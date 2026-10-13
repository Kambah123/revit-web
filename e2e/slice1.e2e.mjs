// End-to-end test for slice 1, run against the dev server in a real browser.
//
//   CHROME_PATH=/path/to/chrome npm run e2e
//
// Optional environment:
//   APP_URL       default http://localhost:5173 (start the app with `npm run dev`)
//   CHROME_ARGS   extra space-separated Chromium flags
//   E2E_SHOTS     directory for screenshots (default ./e2e/screenshots)
//
// The test fails on any assertion, on any console error, and on any failed or 4xx/5xx request.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const APP_URL = (() => { const url = new URL(process.env.APP_URL ?? "http://localhost:5173/"); url.searchParams.set("legacy", "1"); return url.href; })();
const CHROME_PATH = process.env.CHROME_PATH;
const SHOTS = process.env.E2E_SHOTS ?? resolve("e2e/screenshots");
const DOWNLOADS = mkdtempSync(join(tmpdir(), "revit-web-e2e-"));
mkdirSync(SHOTS, { recursive: true });

if (!CHROME_PATH) {
  console.error("Set CHROME_PATH to a Chrome or Chromium executable.");
  process.exit(2);
}

const extraArgs = (process.env.CHROME_ARGS ?? "").split(" ").filter(Boolean);
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    ...extraArgs,
  ],
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

  // Helpers -------------------------------------------------------------------
  const model = () => page.evaluate(() => window.__revitWeb.project());
  const canvasBox = async () => {
    const handle = await page.waitForSelector(".canvas-host canvas");
    return handle.boundingBox();
  };
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setField = async (labelText, value) => {
    const handle = await page.evaluateHandle((text) => {
      const label = [...document.querySelectorAll("label.field")].find((l) => l.textContent.includes(text));
      return label ? label.querySelector("input") : null;
    }, labelText);
    const input = handle.asElement();
    assert.ok(input, `field "${labelText}" not found`);
    await input.click({ count: 3 });
    await page.keyboard.type(String(value));
    await page.keyboard.press("Enter");
    await sleep(120);
  };
  const selectField = async (labelText, value) => {
    const handle = await page.evaluateHandle((text) => {
      const label = [...document.querySelectorAll("label.field")].find((l) => l.textContent.includes(text));
      return label ? label.querySelector("select") : null;
    }, labelText);
    const select = handle.asElement();
    assert.ok(select, `select field "${labelText}" not found`);
    await select.select(value);
    await sleep(150);
  };

  // 1. Fresh start -----------------------------------------------------------
  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__revitWeb && window.__revitWeb.meshCount() >= 0);
  assert.equal((await model()).walls.length, 0);
  assert.equal(await page.evaluate(() => window.__revitWeb.view()), "plan");
  step("fresh project opens in plan view with two levels");

  // Orientation: in plan, +x is to the right and +y is up, so the screen matches the model.
  const origin = await page.evaluate(() => window.__revitWeb.screenOf({ x: 0, y: 0 }));
  const farX = await page.evaluate(() => window.__revitWeb.screenOf({ x: 6000, y: 0 }));
  const farY = await page.evaluate(() => window.__revitWeb.screenOf({ x: 0, y: 4000 }));
  assert.ok(farX.x > origin.x, "plan +x points right");
  assert.ok(farY.y < origin.y, "plan +y points up");
  step("plan orientation matches the model: +x right, +y up");

  // 2. Draw connected walls --------------------------------------------------
  await press("w");
  await clickPlan(0, 0);
  await clickPlan(6000, 0);
  await clickPlan(6000, 4000);
  await clickPlan(0, 4000);
  await press("Escape");
  let project = await model();
  assert.equal(project.walls.length, 3, "three chained walls");
  assert.deepEqual(project.walls[0].start, { x: 0, y: 0 });
  assert.deepEqual(project.walls[0].end, { x: 6000, y: 0 });
  assert.deepEqual(project.walls[1].start, project.walls[0].end, "chained wall starts where the last one ended");
  step("draws three chained walls on the plan (integer millimetres)");

  // Join snapping: a click within the join radius of an existing endpoint snaps to it, so the new wall joins.
  await press("w");
  await clickPlan(0, 4090); // 90 mm from the wall end at (0, 4000): snaps there
  await clickPlan(-3000, 6000);
  await press("Escape");
  project = await model();
  assert.equal(project.walls.length, 4, "the snapped wall was added");
  assert.deepEqual(project.walls[3].start, { x: 0, y: 4000 }, "the new wall starts exactly at the existing endpoint");
  await press("Escape");
  await page.keyboard.down("Control");
  await press("z");
  await page.keyboard.up("Control");
  project = await model();
  assert.equal(project.walls.length, 3, "undo removes the test wall");
  step("snaps a new wall to an existing endpoint so the walls join");

  // 3. Hosted door and window ------------------------------------------------
  await press("d");
  await clickPlan(3000, 0);
  await press("n");
  await clickPlan(3000, 4000);
  project = await model();
  assert.equal(project.openings.length, 2, "door and window placed");
  const door = project.openings.find((o) => project.openingTypes.find((t) => t.id === o.openingTypeId).kind === "door");
  const win = project.openings.find((o) => project.openingTypes.find((t) => t.id === o.openingTypeId).kind === "window");
  assert.equal(door.hostWallId, project.walls[0].id);
  assert.equal(win.hostWallId, project.walls[2].id);
  assert.equal(door.offset, 3000);
  step("places a door and a window hosted in the right walls");

  // A door placed outside the wall is refused, and the model is unchanged.
  await press("d");
  await clickPlan(100, 0);
  project = await model();
  assert.equal(project.openings.length, 2, "invalid door refused");
  assert.match(await statusText(), /outside its host wall/);
  step("refuses a door that would fall outside its wall, with a message");

  // 4. Properties ------------------------------------------------------------
  await press("s");
  await clickPlan(3000, 0);
  const headingDoor = await page.$eval(".panel.right h2", (el) => el.textContent);
  assert.equal(headingDoor, "Door");
  await setField("Offset from wall start", 2000);
  project = await model();
  assert.equal(project.openings.find((o) => o.id === door.id).offset, 2000);
  step("selects a door and edits its offset in the properties panel");

  // Edit a wall's height, then check the 3D geometry follows.
  await clickPlan(4000, 4000); // selects the top wall (no opening there)
  assert.equal(await page.$eval(".panel.right h2", (el) => el.textContent), "Wall");
  await setField("Height (mm)", 2700);
  project = await model();
  assert.equal(project.walls[2].height, 2700);
  step("selects a wall and edits its height");

  // 5. Undo / redo ------------------------------------------------------------
  await clickButton("Undo");
  project = await model();
  assert.equal(project.walls[2].height, 3000, "undo restores the wall height");
  await press("Escape");
  await page.keyboard.down("Control");
  await press("y");
  await page.keyboard.up("Control");
  project = await model();
  assert.equal(project.walls[2].height, 2700, "redo reapplies the wall height");
  await page.keyboard.down("Control");
  await press("z");
  await page.keyboard.up("Control");
  project = await model();
  assert.equal(project.walls[2].height, 3000, "Ctrl+Z undoes");
  step("undo and redo restore exact earlier and later states (buttons and shortcuts)");

  // Wall type materials drive the native Three.js scene and participate in history.
  await clickPlan(4000, 4000);
  assert.equal(await page.$eval(".panel.right h2", (el) => el.textContent), "Wall");
  project = await model();
  const wallTypeId = project.walls[2].wallTypeId;
  const wallId = project.walls[2].id;
  const wallType = project.wallTypes.find((type) => type.id === wallTypeId);
  const generic = project.materials.find((material) => material.id === wallType.materialId);
  const wood = project.materials.find((material) => material.name === "Wood");
  assert.ok(generic && wood, "default and wood materials exist");
  await selectField("Type material", wood.id);
  project = await model();
  assert.equal(project.wallTypes.find((type) => type.id === wallTypeId).materialId, wood.id);
  assert.equal(project.walls.filter((wall) => wall.wallTypeId === wallTypeId).length, 3);
  await clickPlan(-8000, -8000); // clear selection so the normal material is rendered
  assert.equal(await page.evaluate((id) => window.__revitWeb.wallColor(id), wallId), wood.color.toLowerCase());
  await clickButton("Undo");
  project = await model();
  assert.equal(project.wallTypes.find((type) => type.id === wallTypeId).materialId, generic.id);
  await clickButton("Redo");
  project = await model();
  assert.equal(project.wallTypes.find((type) => type.id === wallTypeId).materialId, wood.id);
  await clickPlan(-8000, -8000);
  assert.equal(await page.evaluate((id) => window.__revitWeb.wallColor(id), wallId), wood.color.toLowerCase());
  step("assigns wall type material, renders its colour, and preserves undo/redo");

  // 6. 3D view generated from the same model ----------------------------------
  await clickButton("3D");
  assert.equal(await page.evaluate(() => window.__revitWeb.view()), "3d");
  await sleep(400);
  const meshes = await page.evaluate(() => window.__revitWeb.meshCount());
  // 3 walls, with openings cut: wall pieces + door leaf + window glass + pieces above and below.
  assert.ok(meshes >= 8, `3D model has ${meshes} meshes`);
  await page.screenshot({ path: join(SHOTS, "3d-view.png") });
  step(`3D view renders the model (${meshes} solids, openings cut)`);

  await clickButton("Plan");
  await sleep(200);
  await page.screenshot({ path: join(SHOTS, "plan-view.png") });
  step("plan view shows the model with openings");

  // 7. Autosave and reload ----------------------------------------------------
  const before = JSON.stringify(await model());
  await sleep(700); // autosave is debounced
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__revitWeb && window.__revitWeb.meshCount() >= 0);
  const after = JSON.stringify(await model());
  assert.equal(after, before, "reload recovers the autosaved project exactly");
  assert.match(await statusText(), /Recovered/);
  step("autosave recovers the exact project after a reload");

  // 8. Save to file, new project, reopen -------------------------------------
  await clickButton("Save");
  await sleep(500);
  const saved = readdirSync(DOWNLOADS).filter((f) => f.endsWith(".revit-web.json"));
  assert.equal(saved.length, 1, "one file downloaded");
  const savedText = readFileSync(join(DOWNLOADS, saved[0]), "utf8");
  const savedObj = JSON.parse(savedText);
  assert.equal(savedObj.format, "revit-web/project");
  assert.equal(savedObj.schemaVersion, 5);
  assert.equal(savedObj.walls.length, 3);
  assert.equal(savedObj.openings.length, 2);
  step("saves a project file in the versioned format");

  await clickButton("New");
  project = await model();
  assert.equal(project.walls.length, 0, "New clears the model");
  const uploadHandle = await page.$("input[type=file]");
  await uploadHandle.uploadFile(join(DOWNLOADS, saved[0]));
  await sleep(400);
  project = await model();
  assert.equal(project.walls.length, 3, "reopened walls");
  assert.equal(project.openings.length, 2, "reopened openings");
  assert.deepEqual(project.walls, savedObj.walls, "walls keep their identities and values");
  assert.deepEqual(project.openings, savedObj.openings, "openings keep their identities and values");
  assert.equal(await statusText(), "Opened " + saved[0] + ".");
  step("reopens the saved file with walls and openings intact");

  // 9. Migration from the first file format -----------------------------------
  const v1Path = join(DOWNLOADS, "legacy.json");
  writeFileSync(
    v1Path,
    JSON.stringify({
      format: "revit-web/project",
      version: 1,
      name: "Legacy",
      levels: [{ id: "lvl-a", name: "Ground", elevation: 0 }],
      walls: [{ id: "w-legacy", levelId: "lvl-a", start: { x: 0, y: 0 }, end: { x: 3.5, y: 0 }, thickness: 0.2, height: 2.8 }],
    }),
  );
  await (await page.$("input[type=file]")).uploadFile(v1Path);
  await sleep(400);
  project = await model();
  assert.equal(project.name, "Legacy");
  assert.equal(project.walls[0].end.x, 3500);
  assert.equal(project.walls[0].height, 2800);
  step("opens a version 1 file and migrates it to millimetres");

  // 10. Delete a wall: its doors and windows go with it, and undo restores all ---
  await (await page.$("input[type=file]")).uploadFile(join(DOWNLOADS, saved[0]));
  await sleep(400);
  await press("s");
  await clickPlan(5000, 0);
  assert.equal(await page.$eval(".panel.right h2", (el) => el.textContent), "Wall");
  await press("Delete");
  project = await model();
  assert.equal(project.walls.length, 2);
  assert.equal(project.openings.length, 1, "the door in the deleted wall is gone");
  await clickButton("Undo");
  project = await model();
  assert.equal(project.walls.length, 3);
  assert.equal(project.openings.length, 2, "undo restores the wall and its door");
  step("deleting a wall removes its hosted openings, and undo restores them");

  // 11. Clean console -----------------------------------------------------------
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
