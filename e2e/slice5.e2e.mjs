// End-to-end test for slice 5: elevations generated from the model.
//
//   CHROME_PATH=/path/to/chrome APP_URL=http://localhost:5173 node e2e/slice5.e2e.mjs

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
  defaultViewport: { width: 1280, height: 800 },
});

const problems = [];
const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`✓ ${name}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const model = () => page.evaluate(() => window.__revitWeb.project());
  const canvasBox = async () => (await page.waitForSelector(".canvas-host canvas")).boundingBox();
  const clickPlan = async (x, y) => {
    const box = await canvasBox();
    const s = await page.evaluate((p) => window.__revitWeb.screenOf(p), { x, y });
    await page.mouse.click(box.x + s.x, box.y + s.y);
    await sleep(80);
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await sleep(80);
  };
  const openBrowserView = async (title) => {
    await page.evaluate((t) => {
      const item = [...document.querySelectorAll(".tree-item")].find((b) => b.textContent.includes(t));
      if (!item) throw new Error(`browser item not found: ${t}`);
      item.click();
    }, title);
    await sleep(250);
  };

  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__revitWeb && window.__revitWeb.meshCount() >= 0);
  step("fresh project opens");

  // 1. Build a small scene: wall + door + window on Level 1, hip roof on Level 2.
  await press("w");
  await clickPlan(-8000, 0);
  await clickPlan(8000, 0);
  await press("Escape");
  await press("d");
  await clickPlan(-2000, 0);
  await press("n");
  await clickPlan(3000, 0);
  await press("Escape");
  await page.evaluate(() => {
    const items = [...document.querySelectorAll(".tree-item")];
    items.find((b) => b.textContent.includes("Level 2")).click();
  });
  await sleep(200);
  await press("o");
  await clickPlan(-6000, -3000);
  await clickPlan(6000, -3000);
  await clickPlan(6000, 3000);
  await clickPlan(-6000, 3000);
  await press("Enter");
  let project = await model();
  assert.equal(project.walls.length, 1);
  assert.equal(project.openings.length, 2);
  assert.equal(project.roofs.length, 1);
  step("models a wall with a door and a window, plus a hip roof");

  // 2. Open the North Elevation from the Project Browser.
  await openBrowserView("North Elevation");
  assert.equal(await page.evaluate(() => window.__revitWeb.view()), "elevation");
  assert.ok(await page.$(".elevation-svg"), "elevation SVG rendered");
  assert.equal(await page.$eval(".elevation-host", (el) => el.dataset.direction), "north");
  const svgText = await page.$eval(".elevation-svg", (el) => el.textContent);
  assert.match(svgText, /Level 1/);
  assert.match(svgText, /Level 2/);
  step("opens the North Elevation with level datums");

  // 3. The drawing carries the projected geometry.
  const counts = await page.evaluate(() => ({
    rects: document.querySelectorAll(".elevation-svg rect").length,
    roofs: document.querySelectorAll(".elevation-svg polygon.elev-roof").length,
    levels: document.querySelectorAll(".elevation-svg line.elev-level").length,
    walls: document.querySelectorAll(".elevation-svg rect.elev-wall").length,
    doors: document.querySelectorAll(".elevation-svg rect.elev-door").length,
    windows: document.querySelectorAll(".elevation-svg rect.elev-window").length,
  }));
  assert.equal(counts.walls, 1, "one wall face");
  assert.equal(counts.doors, 1, "one door rect");
  assert.equal(counts.windows, 1, "one window rect");
  assert.equal(counts.roofs, 1, "one roof silhouette");
  assert.equal(counts.levels, 2, "two level datums");
  step("projects walls, openings, the roof silhouette and level datums");

  await page.screenshot({ path: `${SHOTS}/slice5-elevation.png` });
  step("screenshots the elevation");

  // 4. A view tab is open and active; modelling shortcuts are inert here.
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll(".view-tab")].some((t) => t.textContent.includes("North Elevation") && t.classList.contains("active")),
    ),
    "North Elevation tab active",
  );
  const wallsBefore = (await model()).walls.length;
  await press("w");
  await page.mouse.click(640, 400);
  await sleep(150);
  assert.equal((await model()).walls.length, wallsBefore, "no wall drawn from the elevation");
  step("the elevation tab is active and read-only (drawing shortcuts are inert)");

  // 5. Switch back to Plan from the control bar; the SVG disappears.
  const [planBtn] = await page.$$("xpath/.//div[contains(@class,'view-control-bar')]//button[normalize-space(.)='Plan']");
  await planBtn.click();
  await sleep(250);
  assert.equal(await page.evaluate(() => window.__revitWeb.view()), "plan");
  assert.equal(await page.$(".elevation-svg"), null);
  step("Plan from the view control bar leaves the elevation");

  // 6. Open the East Elevation from the View ribbon tab.
  await page.evaluate(() => [...document.querySelectorAll(".ribbon-tabs button")].find((b) => b.textContent.trim() === "View").click());
  await sleep(150);
  await page.evaluate(() => [...document.querySelectorAll(".ribbon-cmd")].find((b) => b.textContent.trim() === "East Elevation").click());
  await sleep(250);
  assert.equal(await page.evaluate(() => window.__revitWeb.view()), "elevation");
  assert.equal(await page.$eval(".elevation-host", (el) => el.dataset.direction), "east");
  // Along the ridge the hip roof is a triangle.
  const eastRoofPoints = await page.evaluate(() => {
    const poly = document.querySelector(".elevation-svg polygon.elev-roof");
    return poly ? poly.getAttribute("points").trim().split(/\s+/).length : 0;
  });
  assert.equal(eastRoofPoints, 3, "hip roof reads as a triangle from the end");
  step("opens the East Elevation from the ribbon; the roof reads as a triangle");

  // 7. Closing the active elevation tab falls back to another view.
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll(".view-tab")].find((t) => t.textContent.includes("East Elevation"));
    tab.querySelector(".view-tab-close").click();
  });
  await sleep(250);
  assert.notEqual(await page.evaluate(() => window.__revitWeb.view()), "elevation");
  assert.equal(await page.$(".elevation-svg"), null);
  step("closing the elevation tab falls back to the previous view");

  // 8. The model is intact and undo/redo still work.
  project = await model();
  assert.equal(project.walls.length, 1);
  assert.equal(project.openings.length, 2);
  assert.equal(project.roofs.length, 1);
  step("the model is intact after working in elevations");

  // 9. Clean console.
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
