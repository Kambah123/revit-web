// End-to-end test for slice 2: floors, rooms, columns, materials and derived quantities.
// Run against the dev server with a Chromium/Chrome executable:
//
//   CHROME_PATH=/path/to/chrome APP_URL=http://localhost:5173 node e2e/slice2.e2e.mjs
//
// Like slice1.e2e.mjs, it fails on any assertion, console error or failed request.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173/";
const CHROME_PATH = process.env.CHROME_PATH;
const SHOTS = process.env.E2E_SHOTS ?? resolve("e2e/screenshots");
const DOWNLOADS = mkdtempSync(join(tmpdir(), "revit-web-e2e2-"));
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
  defaultViewport: { width: 1280, height: 800 },
});

const problems = [];
const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`✓ ${name}`);
};

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

  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS });

  const model = () => page.evaluate(() => window.__revitWeb.project());
  const canvasBox = async () => (await page.waitForSelector(".canvas-host canvas")).boundingBox();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickPlan = async (x, y) => {
    const box = await canvasBox();
    const s = await page.evaluate((p) => window.__revitWeb.screenOf(p), { x, y });
    await page.mouse.click(box.x + s.x, box.y + s.y);
    await sleep(60);
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await sleep(60);
  };
  const clickButton = async (text) => {
    const [button] = await page.$$("xpath/.//button[normalize-space(.)='" + text + "']");
    assert.ok(button, `button "${text}" not found`);
    await button.click();
    await sleep(120);
  };
  const statusText = () => page.$eval(".status", (el) => el.textContent).catch(() => "");

  // 1. Fresh start -----------------------------------------------------------
  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__revitWeb && window.__revitWeb.meshCount() >= 0);
  step("fresh project opens");

  // 2. Draw a floor from a boundary polygon ---------------------------------
  await press("f");
  await clickPlan(-4000, -3000);
  await clickPlan(4000, -3000);
  await clickPlan(4000, 3000);
  await clickPlan(-4000, 3000);
  await press("Enter"); // close the polygon
  let project = await model();
  assert.equal(project.floors.length, 1, "floor created");
  assert.deepEqual(project.floors[0].boundary, [
    { x: -4000, y: -3000 },
    { x: 4000, y: -3000 },
    { x: 4000, y: 3000 },
    { x: -4000, y: 3000 },
  ]);
  assert.equal(await page.$eval(".panel.right h2", (el) => el.textContent), "Floor");
  assert.match(await page.$eval(".panel.right", (el) => el.textContent), /48\.00 m²/);
  step("draws a floor from a closed boundary with derived area");

  // 3. Draw a room; close by clicking the first point ------------------------
  await press("r");
  await clickPlan(-4000, -3000);
  await clickPlan(0, -3000);
  await clickPlan(0, 3000);
  await clickPlan(-4000, 3000);
  await clickPlan(-4000, -3000); // click the first point to close
  project = await model();
  assert.equal(project.rooms.length, 1, "room created");
  assert.equal(project.rooms[0].name, "Room 1");
  assert.equal(await page.$eval(".panel.right h2", (el) => el.textContent), "Room");
  assert.match(await page.$eval(".panel.right", (el) => el.textContent), /24\.00 m²/);
  step("draws a room closed by clicking its first point (area derived)");

  // 4. Rename the room in properties ----------------------------------------
  const input = await page.$('input[aria-label="Name"]');
  assert.ok(input, "room name field found");
  await input.click({ clickCount: 3 });
  await page.keyboard.type("Living room");
  await page.keyboard.press("Enter");
  await sleep(150);
  project = await model();
  assert.equal(project.rooms[0].name, "Living room");
  step("renames the room in the properties palette");

  // 5. Place columns and verify quantities ----------------------------------
  await press("c");
  await clickPlan(3000, 0);
  await clickPlan(3500, 0);
  project = await model();
  assert.equal(project.columns.length, 2, "two columns placed");
  assert.deepEqual(project.columns[0].position, { x: 3000, y: 0 });
  step("places columns by clicking the plan");

  // Invalid room (two points) is refused.
  await press("r");
  await clickPlan(6000, 0);
  await clickPlan(7000, 0);
  await press("Enter");
  assert.match(await statusText(), /at least three points/);
  await press("Escape");
  project = await model();
  assert.equal(project.rooms.length, 1, "invalid room refused");
  step("refuses a boundary with fewer than three points");

  // 6. Undo/redo over the new element kinds ---------------------------------
  await clickButton("Undo");
  project = await model();
  assert.equal(project.columns.length, 1, "undo removes the second column");
  await clickButton("Redo");
  project = await model();
  assert.equal(project.columns.length, 2, "redo restores it");
  step("undo and redo cover the new element commands");

  // 7. 3D renders floors and columns ----------------------------------------
  await clickButton("3D");
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "slice2-3d.png") });
  await clickButton("Plan");
  await sleep(300);
  await page.screenshot({ path: join(SHOTS, "slice2-plan.png") });
  const meshes = await page.evaluate(() => window.__revitWeb.meshCount());
  // floor slab + 2 columns + room fill + (label sprites live in a separate group)
  assert.ok(meshes >= 4, `plan model has ${meshes} meshes`);
  step(`plan and 3D render floors, rooms and columns (${meshes} plan meshes)`);

  // 8. Save / reopen round-trip ---------------------------------------------
  await clickButton("Save");
  await sleep(500);
  const saved = readdirSync(DOWNLOADS).filter((f) => f.endsWith(".revit-web.json"));
  assert.equal(saved.length, 1, "one file downloaded");
  const savedObj = JSON.parse(readFileSync(join(DOWNLOADS, saved[0]), "utf8"));
  assert.equal(savedObj.schemaVersion, 3);
  assert.equal(savedObj.floors.length, 1);
  assert.equal(savedObj.rooms.length, 1);
  assert.equal(savedObj.columns.length, 2);
  assert.ok(savedObj.materials.length >= 1);
  await clickButton("New");
  await (await page.$("input[type=file]")).uploadFile(join(DOWNLOADS, saved[0]));
  await sleep(400);
  project = await model();
  assert.deepEqual(project.floors, savedObj.floors, "floors keep identities");
  assert.deepEqual(project.rooms, savedObj.rooms, "rooms keep identities");
  assert.deepEqual(project.columns, savedObj.columns, "columns keep identities");
  step("save and reopen preserve floors, rooms, columns and materials");

  // 9. A v2 file migrates with a default material ---------------------------
  const v2Path = join(DOWNLOADS, "legacy-v2.json");
  writeFileSync(
    v2Path,
    JSON.stringify({
      format: "revit-web/project",
      schemaVersion: 2,
      id: "proj-v2",
      name: "V2 legacy",
      units: { length: "mm" },
      revision: 3,
      levels: [{ id: "lvl-a", name: "Ground", elevation: 0 }],
      wallTypes: [{ id: "wt-a", name: "Generic - 200 mm", thickness: 200 }],
      openingTypes: [],
      walls: [{ id: "w1", levelId: "lvl-a", wallTypeId: "wt-a", start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, height: 3000 }],
      openings: [],
    }),
  );
  await (await page.$("input[type=file]")).uploadFile(v2Path);
  await sleep(400);
  project = await model();
  assert.equal(project.name, "V2 legacy");
  assert.equal(project.schemaVersion, 3);
  assert.equal(project.materials.length, 1);
  assert.equal(project.wallTypes[0].materialId, project.materials[0].id);
  assert.equal(project.walls.length, 1);
  step("opens a schema v2 file and migrates it to schema v3");

  // 10. Clean console --------------------------------------------------------
  assert.deepEqual(problems, [], `browser problems:\n${problems.join("\n")}`);
  step("no console errors, page errors or failed requests");

  console.log(`\nE2E PASSED: ${steps.length} checks`);
} catch (error) {
  console.error("\nE2E FAILED:", error instanceof Error ? error.message : error);
  console.error("Completed checks:", steps.length);
  if (problems.length) console.error("Browser problems:\n" + problems.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
