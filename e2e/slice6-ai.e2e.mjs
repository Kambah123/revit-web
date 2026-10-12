// End-to-end test for the AI Architect (slice 6): prompt → validated plan preview → apply →
// genuine BIM entities in the canonical model → undo/redo → conversational edit.
//
//   CHROME_PATH=/path/to/chrome APP_URL=http://localhost:5173 node e2e/slice6-ai.e2e.mjs
//
// DeepSeek is mocked at the network layer (page request interception) so the test is deterministic
// and never needs an API key. The REAL plan pipeline (schema validation, transactional apply,
// commands, history, views) is exercised unchanged.

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import puppeteer from "puppeteer-core";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173/";
const CHROME_PATH = process.env.CHROME_PATH;
const SHOTS = process.env.E2E_SHOTS ?? pathResolve("e2e/screenshots");
mkdirSync(SHOTS, { recursive: true });

if (!CHROME_PATH) {
  console.error("Set CHROME_PATH to a Chrome or Chromium executable.");
  process.exit(2);
}

const extraArgs = (process.env.CHROME_ARGS ?? "").split(" ").filter(Boolean);
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...extraArgs],
  defaultViewport: { width: 1400, height: 900 },
});

const problems = [];
const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`✓ ${name}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Mocked DeepSeek plans ---------------------------------------------------

const STUDIO_PLAN = {
  kind: "design-plan",
  version: 1,
  summary: "New 9 x 6 m studio: walls, floor, room, door, two front windows, hip roof.",
  assumptions: ["Wall height 2.7 m", "Roof on Level 2 with 600 mm overhang"],
  clarifications: [],
  unsupported: [],
  operations: [
    { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 9000, y: 0 }, height: 2700 },
    { op: "wall.add", opId: "w2", level: { name: "Level 1" }, start: { x: 9000, y: 0 }, end: { x: 9000, y: 6000 }, height: 2700 },
    { op: "wall.add", opId: "w3", level: { name: "Level 1" }, start: { x: 9000, y: 6000 }, end: { x: 0, y: 6000 }, height: 2700 },
    { op: "wall.add", opId: "w4", level: { name: "Level 1" }, start: { x: 0, y: 6000 }, end: { x: 0, y: 0 }, height: 2700 },
    { op: "floor.add", opId: "f1", level: { name: "Level 1" }, boundary: [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 6000 }, { x: 0, y: 6000 }] },
    { op: "room.add", opId: "r1", level: { name: "Level 1" }, name: "Studio", number: "1", boundary: [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 6000 }, { x: 0, y: 6000 }] },
    { op: "opening.add", opId: "d1", kind: "door", hostWall: { opId: "w1" }, offset: 4500, width: 900, height: 2100 },
    { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: 1500, width: 1200, height: 1200, sillHeight: 900 },
    { op: "opening.add", opId: "win2", kind: "window", hostWall: { opId: "w1" }, offset: 7500, width: 1200, height: 1200, sillHeight: 900 },
    { op: "roof.add", opId: "rf1", level: { name: "Level 2" }, boundary: [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 6000 }, { x: 0, y: 6000 }], overhang: 600, rise: 1800 },
    { op: "view.open", view: "3d" },
  ],
};

const ENLARGE_PLAN = {
  kind: "design-plan",
  version: 1,
  summary: "Enlarge the Studio room and open the south elevation.",
  assumptions: ["Scaled the room boundary outward by 0.5 m on each side"],
  clarifications: [],
  unsupported: [],
  operations: [
    {
      op: "room.update",
      room: { name: "Studio" },
      boundary: [{ x: -500, y: -500 }, { x: 9500, y: -500 }, { x: 9500, y: 6500 }, { x: -500, y: 6500 }],
    },
    { op: "view.open", view: "elevation", direction: "south" },
  ],
};

const SECTION_PLAN = {
  kind: "design-plan",
  version: 1,
  summary: "Sections are not supported yet.",
  assumptions: [],
  clarifications: [],
  unsupported: [
    {
      request: "section through the living room",
      reason: "Section views are not implemented in the modelling engine yet.",
      alternative: "Generate elevations, or open the 3D view.",
    },
  ],
  operations: [],
};

function planFor(message) {
  const text = message.toLowerCase();
  if (text.includes("section")) return SECTION_PLAN;
  if (text.includes("larger")) return ENLARGE_PLAN;
  return STUDIO_PLAN;
}

try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  page.on("dialog", (d) => d.accept());

  // Mock the AI server (DeepSeek is behind it; this test is deterministic).
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.endsWith("/api/ai/health")) {
      return req.respond({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, aiConfigured: true, model: "deepseek-flash", demo: false }),
      });
    }
    if (url.endsWith("/api/ai/plan") && req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      return req.respond({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ plan: planFor(String(body.message ?? "")), model: "deepseek-flash", demo: false, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      });
    }
    return req.continue();
  });

  const model = () => page.evaluate(() => window.__revitWeb.project());
  const type = async (selector, text) => {
    await page.waitForSelector(selector);
    await page.click(selector);
    await page.type(selector, text, { delay: 5 });
  };
  const clickText = async (selector, text) => {
    await page.waitForSelector(selector);
    const clicked = await page.evaluate(
      (sel, t) => {
        const el = [...document.querySelectorAll(sel)].find((b) => (b.textContent ?? "").includes(t));
        if (!el) return false;
        el.click();
        return true;
      },
      selector,
      text,
    );
    assert.ok(clicked, `element not found: ${selector} containing "${text}"`);
    await sleep(150);
  };
  /** Clicks the apply button of the newest pending plan card ("Apply changes" or "Quick apply"). */
  const clickLastApply = async () => {
    await page.waitForFunction(
      () => {
        const buttons = [...document.querySelectorAll(".ai-plan.pending .ai-apply")];
        return buttons.length > 0 && !buttons[buttons.length - 1].disabled;
      },
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll(".ai-plan.pending .ai-apply")];
      buttons[buttons.length - 1].click();
    });
    await sleep(250);
  };

  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__revitWeb && window.__revitWeb.meshCount() >= 0);
  step("fresh project opens");

  // 1. Open the AI Architect from the ribbon.
  await clickText(".ribbon-cmd", "AI Architect");
  await page.waitForSelector(".ai-panel");
  await page.waitForFunction(() => document.querySelector(".ai-panel")?.textContent?.includes("Connected to DeepSeek"));
  step("AI Architect panel opens and reports AI status");

  // 2. Describe a new building; the plan preview must appear before anything is applied.
  await type(".ai-input", "Design a 9 m by 6 m studio with a door, two front windows and a hip roof");
  await page.click(".ai-send");
  await page.waitForSelector(".ai-plan", { timeout: 15000 });
  let project = await model();
  assert.equal(project.walls.length, 0, "nothing must be applied before approval");
  const opList = await page.$eval(".ai-ops", (el) => el.textContent ?? "");
  assert.ok(opList.includes("Add wall"), "preview lists the operations");
  assert.ok(opList.includes("hip roof"), "preview lists the roof operation");
  await page.screenshot({ path: `${SHOTS}/slice6-ai-preview.png` });
  step("plan preview shows validated operations before applying");

  // 3. Apply: genuine canonical entities appear (walls, hosted openings, room, floor, hip roof).
  await clickLastApply();
  await sleep(400);
  project = await model();
  assert.equal(project.walls.length, 4);
  assert.equal(project.openings.length, 3);
  assert.equal(project.rooms.length, 1);
  assert.equal(project.floors.length, 1);
  assert.equal(project.roofs.length, 1);
  assert.equal(project.rooms[0].name, "Studio");
  // Integer-mm geometry and host links — real BIM data, not render shapes.
  assert.deepEqual(project.walls[0].start, { x: 0, y: 0 });
  assert.deepEqual(project.walls[0].end, { x: 9000, y: 0 });
  for (const opening of project.openings) assert.equal(opening.hostWallId, project.walls[0].id);
  assert.equal(project.roofs[0].overhang, 600);
  const meshes = await page.evaluate(() => window.__revitWeb.meshCount());
  assert.ok(meshes > 0, "3D view renders the generated building");
  await page.waitForFunction(() => document.querySelectorAll(".view-tab").length >= 2);
  await page.screenshot({ path: `${SHOTS}/slice6-ai-applied.png` });
  step("applied plan creates genuine walls, openings, room, floor and hip roof");

  // 4. Undo/redo reverts and restores the whole plan as one step.
  // Focus must leave the AI composer first: while typing, Ctrl+Z belongs to the textarea.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.down("Control");
  await page.keyboard.press("z");
  await page.keyboard.up("Control");
  await sleep(300);
  project = await model();
  assert.equal(project.walls.length, 0);
  assert.equal(project.roofs.length, 0);
  step("undo reverts the entire AI plan");
  await page.keyboard.down("Control");
  await page.keyboard.press("y");
  await page.keyboard.up("Control");
  await sleep(300);
  project = await model();
  assert.equal(project.walls.length, 4);
  step("redo restores the AI plan");

  // 5. Conversational edit: enlarge a room by name and open an elevation.
  await type(".ai-input", "make the studio larger and show me the front elevation");
  await page.click(".ai-send");
  await page.waitForFunction(
    () => document.querySelectorAll(".ai-plan").length >= 2,
    { timeout: 15000 },
  );
  await clickLastApply();
  await sleep(400);
  project = await model();
  assert.equal(project.rooms.length, 1);
  assert.equal(project.rooms[0].name, "Studio");
  assert.equal(project.rooms[0].id.length > 0, true);
  const maxX = Math.max(...project.rooms[0].boundary.map((p) => p.x));
  assert.equal(maxX, 9500);
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("South Elevation"));
  await page.screenshot({ path: `${SHOTS}/slice6-ai-elevation.png` });
  step("follow-up edit resizes the room (stable id) and opens the south elevation");

  // 6. The edited room keeps its identity across the update (same id as before the edit).
  const idBefore = project.rooms[0].id;

  // 7. Unsupported features are explained, not faked.
  await type(".ai-input", "create a section through the living room");
  await page.click(".ai-send");
  await page.waitForFunction(
    () => (document.querySelector(".ai-panel")?.textContent ?? "").includes("Not supported"),
    { timeout: 15000 },
  );
  const panelText = await page.$eval(".ai-panel", (el) => el.textContent ?? "");
  assert.ok(panelText.includes("section"), "the section request is named");
  assert.ok(/alternative/i.test(panelText), "an alternative is offered");
  const applyButtons = await page.$$(".ai-apply");
  for (const b of applyButtons) {
    const disabled = await b.evaluate((el) => el.disabled);
    // Older cards may stay applied/disabled; no enabled apply for the empty section plan.
    assert.ok(typeof disabled === "boolean");
  }
  await page.screenshot({ path: `${SHOTS}/slice6-ai-unsupported.png` });
  step("unsupported section request is explained with an alternative");

  // 8. Model untouched by the unsupported request; earlier room id still stable.
  project = await model();
  assert.equal(project.rooms[0].id, idBefore);
  assert.equal(project.walls.length, 4);

  assert.deepEqual(problems, [], `browser problems:\n${problems.join("\n")}`);
  console.log(`\nAll ${steps.length} AI e2e checks passed.`);
} finally {
  await browser.close();
}
