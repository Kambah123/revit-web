// Contour's real browser workflow. Run with the dev server and CHROME_PATH set.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { demoPlanFor } from "../server/demoPlanner.mjs";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
  defaultViewport: { width: 1440, height: 960 },
});
const page = await browser.newPage();
const errors = [];
let checks = 0;
const check = (name) => {
  checks++;
  console.log(`✓ ${name}`);
};
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("dialog", (d) => d.accept());
const screenshots = process.env.E2E_SHOTS ?? "e2e/screenshots";
mkdirSync(screenshots, { recursive: true });
const downloads = mkdtempSync(join(tmpdir(), "contour-download-"));
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: downloads,
});
const click = (selector) => page.click(selector);
const wait = () => new Promise((r) => setTimeout(r, 150));
const model = () => page.evaluate(() => window.__revitWeb.project());
const clickPlan = async (x, y) => {
  const box = await (await page.$(".canvas-host canvas")).boundingBox();
  const p = await page.evaluate((point) => window.__revitWeb.screenOf(point), {
    x,
    y,
  });
  await page.mouse.click(box.x + p.x, box.y + p.y);
  await wait();
};
const setField = async (selector, value) => {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(value);
  await page.keyboard.press("Tab");
  await wait();
};
const textButton = async (text) => {
  const buttons = await page.$$("button, [role=menuitem]");
  for (const b of buttons)
    if ((await b.evaluate((el) => el.textContent.trim())) === text) {
      await b.click();
      return;
    }
  throw Error(`Missing button ${text}`);
};
try {
  await page.goto(process.env.APP_URL ?? "http://localhost:5173/", {
    waitUntil: "networkidle0",
  });
  await page.waitForSelector('[aria-label="Open Courtyard residence"]');
  assert.equal(await page.$$eval(".project-card", (els) => els.length), 2);
  check("Dashboard seeds two independently editable example projects");
  await setField('[aria-label="Search projects"]', "Garden");
  assert.equal(await page.$$eval(".project-card", (els) => els.length), 1);
  await setField('[aria-label="Search projects"]', "");
  await click('[aria-label="List layout"]');
  assert.ok(await page.$(".project-list"));
  await click('[aria-label="Grid layout"]');
  check("Project search and grid/list switch");
  await page.screenshot({ path: join(screenshots, "contour-dashboard.png") });
  await click('[aria-label="Open Courtyard residence"]');
  await page.waitForSelector(".canvas-host canvas");
  await wait();
  assert.equal((await model()).rooms.length, 5);
  check("Original example opens as real semantic geometry");
  await page.screenshot({ path: join(screenshots, "contour-editor.png") });
  await click('[aria-label="Visualize mode"]');
  await page.waitForFunction(() => window.__revitWeb.view() === "3d");
  await wait();
  assert.ok(await page.$(".visualize-mode"));
  await page.screenshot({ path: join(screenshots, "contour-spatial.png") });
  await click('[aria-label="Drafting mode"]');
  await page.waitForFunction(() => window.__revitWeb.view() === "plan");
  check("3D and plan views retain the model");
  await click('[aria-label="Visualize mode"]');await page.waitForFunction(()=>window.__revitWeb.view()==='3d');await page.keyboard.press('m');await page.waitForFunction(()=>window.__revitWeb.view()==='plan');await page.waitForSelector('[aria-label="Dimension"][aria-pressed="true"]');await click('[aria-label="Select"]');check('Dimension shortcut explicitly opens plan view from 3D');
  await click('[aria-label="Hide panels"]');
  assert.ok(await page.$(".panels-hidden"));
  await click('[aria-label="Show panels"]');
  assert.equal((await model()).rooms.length, 5);
  check("Hide/restore panels without losing model");
  await textButton("Assets");
  await textButton("Doors");
  await page.click(".asset-tile");
  await page.waitForSelector('[aria-label="Door"][aria-pressed="true"]');
  assert.ok(
    (await page.$eval(".studio-inspector", (el) => el.innerText)).includes(
      "Opening type",
    ),
  );
  check("Building asset chooses the real placement tool");
  await click('[aria-label="Back to projects"]');
  await page.waitForSelector(".dashboard");
  await textButton("New project");
  await page.waitForSelector("[role=dialog][data-state=open]");
  await setField("[role=dialog] input", "Browser test studio");
  await textButton("Create project");
  await page.waitForSelector(".canvas-host canvas");
  assert.equal((await model()).walls.length, 0);
  check("Creates a separate blank project");
  // Deterministic, explicitly-labelled local planner response. No paid model call.
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().endsWith("/api/ai/health"))
      return request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, aiConfigured: false, demo: true }),
      });
    if (request.url().endsWith("/api/ai/plan"))
      return request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: demoPlanFor(JSON.parse(request.postData())),
          demo: true,
          model: "demo",
        }),
      });
    return request.continue();
  });
  await click('[aria-label="AI Architect"]');
  await page.waitForSelector(".ai-banner.demo");
  assert.equal(
    await page.$eval(".ai-entry.status", (el) => getComputedStyle(el).position),
    "static",
  );
  await page.type(".ai-input", "Design a 10 m by 8 m house");
  await click(".ai-send");
  await page.waitForSelector(".ai-plan.pending .ai-apply:not(:disabled)");
  assert.equal((await model()).walls.length, 0);
  check("Assistant labels the demo and previews without mutating the model");
  await page.screenshot({ path: join(screenshots, "contour-assistant.png") });
  await click(".ai-apply");
  await page.waitForFunction(
    () => window.__revitWeb.project().walls.length === 4,
  );
  await click(".ai-header button");
  await click('[aria-label="Undo"]');
  await page.waitForFunction(
    () => window.__revitWeb.project().walls.length === 0,
  );
  check("Assistant changes are real model edits undone in one step");
  await textButton("Fit");

  await click('[aria-label="Wall"]');
  await clickPlan(-2000, -2000);
  await clickPlan(2000, -2000);
  await page.keyboard.press("Escape");
  assert.equal((await model()).walls.length, 1);
  check("Wall drawing commits actual millimetre geometry");
  await click('[aria-label="Undo"]');
  await page.waitForFunction(
    () => window.__revitWeb.project().walls.length === 0,
  );
  await click('[aria-label="Redo"]');
  await page.waitForFunction(
    () => window.__revitWeb.project().walls.length === 1,
  );
  check("Undo/redo preserves the command engine");
  await click('[aria-label="Door"]');
  await clickPlan(0, -2000);
  assert.equal((await model()).openings.length, 1);
  check("Door placement hosts and validates a real opening");
  await click('[aria-label="Dimension"]');
  await clickPlan(-2000, 0);
  await clickPlan(2000, 0);
  await clickPlan(0, 1000);
  await page.waitForFunction(
    () => window.__revitWeb.project().dimensions.length === 1,
  );
  assert.equal(
    await page.$eval(".dimension-value", (el) => el.textContent),
    "4000 mm",
  );
  assert.deepEqual((await model()).dimensions[0].start, { x: -2000, y: 0 });
  assert.equal((await model()).dimensions[0].offset, 1000);
  check(
    "Three-click dimension stores exact measurement points and signed offset",
  );
  await page.select('[aria-label="Dimension display unit"]', "m");
  await page.waitForFunction(
    () => document.querySelector(".dimension-value")?.textContent === "4.000 m",
  );
  await setField('[aria-label="Dimension offset (mm)"]', "1200");
  assert.equal((await model()).dimensions[0].offset, 1200);
  check("Dimension properties support explicit units and editable offset");
  await page.screenshot({ path: join(screenshots, "contour-dimensions.png") });
  await clickPlan(5000, -4000);
  await clickPlan(0, 1200);
  await page.waitForSelector('[aria-label="Dimension display unit"]');
  await page.keyboard.press("Delete");
  await page.waitForFunction(
    () => window.__revitWeb.project().dimensions.length === 0,
  );
  await click('[aria-label="Undo"]');
  await page.waitForFunction(
    () => window.__revitWeb.project().dimensions.length === 1,
  );
  check("Canvas dimension selection, deletion and undo");
  await click('[aria-label="Dimension"]');
  await clickPlan(-1000, 3000);
  await page.keyboard.press("Escape");
  assert.equal((await model()).dimensions.length, 1);
  check("Escape cancels an unfinished dimension without committing");

  await textButton("Layers");
  await setField('[aria-label="Find an element"]', "Wall");
  await click(".layer-row");
  await page.waitForFunction(() =>
    document
      .querySelector(".studio-inspector")
      ?.innerText.toLowerCase()
      .includes("thickness"),
  );
  check("Layer search selects an element and opens its properties");
  await setField('[aria-label="Project name"]', "Renamed browser studio");
  await page.waitForFunction(
    () =>
      document.querySelector(".save-indicator")?.textContent ===
      "Saved locally",
  );
  await click('[aria-label="Back to projects"]');
  await page.waitForSelector(".dashboard");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('[aria-label="Open Renamed browser studio"]');
  await click('[aria-label="Open Renamed browser studio"]');
  await page.waitForSelector(".canvas-host canvas");
  assert.equal((await model()).walls.length, 1);
  assert.equal((await model()).openings.length, 1);
  assert.equal((await model()).dimensions[0].unit, "m");
  assert.equal((await model()).dimensions[0].offset, 1200);
  check(
    "Per-project IndexedDB save survives reload with edits and name intact",
  );
  await textButton("Export");
  await page.waitForSelector("[role=dialog][data-state=open]");
  await page.click(".export-option");
  await page.waitForFunction(() =>
    document.querySelector(".canvas-toast")?.textContent.includes("Saved "),
  );
  await wait();
  const file = readdirSync(downloads).find((f) => f.endsWith(".json"));
  assert.ok(file);
  const data = JSON.parse(readFileSync(join(downloads, file), "utf8"));
  assert.equal(data.walls.length, 1);
  assert.equal(data.openings.length, 1);
  assert.equal(data.dimensions.length, 1);
  assert.equal(data.dimensions[0].unit, "m");
  check("Exports a valid editable JSON backup");
  await click('[aria-label="Back to projects"]');
  await page.waitForSelector(".dashboard");
  await (await page.$("input[type=file]")).uploadFile(join(downloads, file));
  await page.waitForSelector(".canvas-host canvas");
  const imported = await model();
  assert.notEqual(imported.id, data.id);
  assert.equal(imported.walls.length, 1);
  assert.deepEqual(imported.dimensions, data.dimensions);
  check("Import creates an independent copy without overwriting the original");
  await click('[aria-label="Search commands"]');
  await page.waitForSelector('[role="dialog"]');
  await page.type(".launcher input", "Floor");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[aria-label="Floor"][aria-pressed="true"]');
  check("Command search activates real tools");
  await click('[aria-label="Back to projects"]');
  await page.waitForSelector(".dashboard");
  const count = await page.$$eval(".project-card", (els) => els.length);
  await page.click('[aria-label^="Project actions for"]');
  await textButton("Duplicate");
  await page.waitForFunction(
    (n) => document.querySelectorAll(".project-card").length === n + 1,
    {},
    count,
  );
  check("Project duplication creates a separate library entry");
  await page.waitForSelector("[role=menu]", { hidden: true });
  await page.click('[aria-label^="Project actions for"]');
  await page.waitForSelector('[role=menu][data-state="open"]');
  await textButton("Delete project");
  await page.waitForSelector("[role=dialog]");
  await page.click('[role=dialog] button[data-variant="destructive"]');
  await page.waitForFunction(
    (n) => document.querySelectorAll(".project-card").length === n,
    {},
    count,
  );
  check("Confirmed project deletion affects only the selected project");
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({
    path: join(screenshots, "contour-dashboard-mobile.png"),
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  check("Small-screen dashboard stays within viewport");
  await click('[aria-label="Open Courtyard residence"]');
  await page.waitForSelector(".canvas-host canvas");
  await textButton("Fit");
  await page.screenshot({
    path: join(screenshots, "contour-editor-mobile.png"),
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  check(
    "Narrow editor preserves the canvas and scrollable tool strip without page overflow",
  );
  assert.deepEqual(errors, []);
  check("No browser runtime or console errors");
  console.log(`\n${checks} Contour browser checks passed.`);
} finally {
  await browser.close();
}
