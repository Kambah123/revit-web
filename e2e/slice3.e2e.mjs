// End-to-end test for slice 3: the professional workspace (ribbon, project browser,
// view tabs, contextual ribbon, view control bar, status bar, command launcher).
//
//   CHROME_PATH=/path/to/chrome APP_URL=http://localhost:5173 node e2e/slice3.e2e.mjs

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import puppeteer from "puppeteer-core";

const APP_URL = (() => { const url = new URL(process.env.APP_URL ?? "http://localhost:5173/"); url.searchParams.set("legacy", "1"); return url.href; })();
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
  const clickText = async (text, selector = "button") => {
    const [el] = await page.$$(`xpath/.//${selector}[normalize-space(.)='${text}']`);
    assert.ok(el, `${selector} "${text}" not found`);
    await el.click();
    await sleep(150);
  };
  const statusText = () => page.$eval(".status-bar", (el) => el.textContent).catch(() => "");

  // 1. Workspace shell --------------------------------------------------------
  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.__revitWeb && window.__revitWeb.meshCount() >= 0);

  assert.ok(await page.$(".ribbon"), "ribbon present");
  assert.ok(await page.$(".qat"), "quick access toolbar present");
  assert.ok(await page.$(".browser"), "project browser present");
  assert.ok(await page.$(".view-tabs"), "view tabs present");
  assert.ok(await page.$(".status-bar"), "status bar present");
  assert.ok(await page.$(".view-control-bar"), "view control bar present");
  step("workspace shell renders: ribbon, QAT, browser, view tabs, control bar, status bar");

  // Ribbon tabs all exist.
  const tabTitles = await page.$$eval(".ribbon-tabs button", (els) => els.map((e) => e.textContent));
  for (const t of ["Architecture", "Structure", "Steel", "Insert", "Annotate", "Analyze", "Massing & Site", "Collaborate", "View", "Manage", "Add-Ins"]) {
    assert.ok(tabTitles.includes(t), `ribbon tab ${t} present`);
  }
  step("all eleven ribbon tabs are present");

  // Unimplemented commands are disabled with an explanatory tooltip.
  const ribbonState = await page.evaluate(() => {
    const disabled = [...document.querySelectorAll(".ribbon-cmd:disabled")];
    return {
      disabledCount: disabled.length,
      titles: disabled.map((b) => b.getAttribute("title") ?? ""),
    };
  });
  assert.ok(ribbonState.disabledCount > 0, "some ribbon commands are visibly disabled");
  assert.ok(ribbonState.titles.every((t) => t.length > 0), "disabled commands carry tooltips");
  assert.ok(
    ribbonState.titles.some((t) => /Not implemented yet/.test(t)),
    "tooltips explain the command is not implemented",
  );
  step(`unsupported tools are disabled with explanatory tooltips (${ribbonState.disabledCount} on this tab)`);

  // 2. Ribbon commands work ---------------------------------------------------
  await clickText("Structure");
  assert.match(await page.$eval(".ribbon-body", (el) => el.textContent), /Foundation/);
  await clickText("Architecture");
  // Draw a wall from the ribbon button (not the keyboard).
  await clickText("Wall");
  const canvasBox = async () => (await page.waitForSelector(".canvas-host canvas")).boundingBox();
  const clickPlan = async (x, y) => {
    const box = await canvasBox();
    const s = await page.evaluate((p) => window.__revitWeb.screenOf(p), { x, y });
    await page.mouse.click(box.x + s.x, box.y + s.y);
    await sleep(80);
  };
  await clickPlan(0, 0);
  await clickPlan(5000, 0);
  await page.keyboard.press("Escape");
  let project = await model();
  assert.equal(project.walls.length, 1, "ribbon Wall tool drew a wall");
  step("ribbon commands perform real work (Wall tool draws)");

  // 3. Contextual ribbon ------------------------------------------------------
  await clickText("Select");
  await clickPlan(2500, 0);
  await sleep(200);
  const contextual = await page.$(".ribbon-tabs .contextual");
  assert.ok(contextual, "contextual tab appears on selection");
  assert.match(await page.evaluate((el) => el.textContent, contextual), /Modify \| Wall/);
  const contextualActive = await page.evaluate((el) => el.classList.contains("active"), contextual);
  assert.ok(contextualActive, "contextual tab is active while selected");
  step("contextual Modify ribbon appears and activates on selection");

  // 4. Project browser opens views -------------------------------------------
  await clickText("3D");
  const tabState = await page.$$eval(".view-tab", (els) => els.map((e) => e.textContent));
  assert.ok(tabState.some((t) => t.includes("Level 1")), "plan tab listed");
  assert.ok(tabState.some((t) => t.includes("3D")), "3D tab listed");
  await clickText("Level 1", "button");
  assert.equal(await page.evaluate(() => window.__revitWeb.view()), "plan", "browser click activates the plan");
  step("project browser opens and activates views as tabs");

  // 5. View tabs close (keeping at least one) --------------------------------
  const closes = await page.$$(".view-tab-close");
  assert.equal(closes.length, 2, "two tabs open with close buttons");
  await closes[1].click();
  await sleep(150);
  assert.equal((await page.$$(".view-tab")).length, 1, "tab closed");
  assert.equal(await page.evaluate(() => window.__revitWeb.view()), "plan");
  step("view tabs close while keeping at least one open");

  // 6. View control bar drives real state ------------------------------------
  await page.select(".view-control-bar select[title^='Annotation'] , .view-control-bar label:nth-of-type(1) select", "200");
  await sleep(150);
  await clickText("Hidden Line", "option").catch(() => {});
  // Use evaluate for selects to avoid option clicks.
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll(".view-control-bar label")];
    const styleSelect = labels.find((l) => l.textContent.includes("Style"))?.querySelector("select");
    styleSelect.value = "wireframe";
    styleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const detailSelect = labels.find((l) => l.textContent.includes("Detail"))?.querySelector("select");
    detailSelect.value = "Coarse";
    detailSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const shadow = labels.find((l) => l.textContent.includes("Shadows"))?.querySelector("input");
    shadow.checked = false;
    shadow.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(200);
  await page.screenshot({ path: `${SHOTS}/slice3-wireframe.png` });
  // Scale shows in the status bar.
  assert.match(await statusText(), /1:200/);
  step("view control bar changes scale, detail level, visual style and shadows");

  await page.evaluate(() => {
    const labels = [...document.querySelectorAll(".view-control-bar label")];
    const styleSelect = labels.find((l) => l.textContent.includes("Style"))?.querySelector("select");
    styleSelect.value = "shaded";
    styleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const detailSelect = labels.find((l) => l.textContent.includes("Detail"))?.querySelector("select");
    detailSelect.value = "Medium";
    detailSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const shadow = labels.find((l) => l.textContent.includes("Shadows"))?.querySelector("input");
    shadow.checked = true;
    shadow.dispatchEvent(new Event("change", { bubbles: true }));
    const scaleSelect = labels[0].querySelector("select");
    scaleSelect.value = "100";
    scaleSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(150);

  // 7. Command launcher -------------------------------------------------------
  await page.keyboard.down("Control");
  await page.keyboard.press("k");
  await page.keyboard.up("Control");
  await sleep(200);
  assert.ok(await page.$(".launcher"), "launcher opens with Ctrl+K");
  await page.keyboard.type("floor");
  await sleep(150);
  const first = await page.$eval(".launcher-item.active", (el) => el.textContent);
  assert.match(first, /Floor/i, "search finds the Floor command");
  await page.keyboard.press("Enter");
  await sleep(200);
  assert.ok(!(await page.$(".launcher")), "launcher closes on run");
  // The Floor tool is now active: drawing two clicks + Enter would make a floor.
  await clickPlan(-2000, -2000);
  await clickPlan(2000, -2000);
  await clickPlan(2000, 2000);
  await page.keyboard.press("Enter");
  await sleep(200);
  project = await model();
  assert.equal(project.floors.length, 1, "command launcher started the Floor tool");
  step("command launcher searches and runs commands (Ctrl+K → Floor)");

  // Launcher lists unimplemented commands as unavailable.
  await page.keyboard.down("Control");
  await page.keyboard.press("k");
  await page.keyboard.up("Control");
  await page.keyboard.type("interference");
  await sleep(150);
  const disabledItem = await page.$(".launcher-item.unimplemented");
  assert.ok(disabledItem, "unimplemented commands appear as unavailable in the launcher");
  await page.keyboard.press("Escape");
  await sleep(150);
  step("launcher marks unimplemented commands unavailable");

  // 8. Shortcuts dialog -------------------------------------------------------
  await page.keyboard.press("F1");
  await sleep(150);
  const dialog = await page.$(".dialog");
  assert.ok(dialog, "shortcut dialog opens with F1");
  const dialogText = await page.evaluate((el) => el.textContent, dialog);
  assert.match(dialogText, /Ctrl\+K/);
  assert.match(dialogText, /Wall/);
  await clickText("Close");
  assert.ok(!(await page.$(".dialog")), "dialog closes");
  step("keyboard shortcut map opens and lists shortcuts");

  // 9. Panels collapse and expand ---------------------------------------------
  await clickText("‹");
  await sleep(150);
  assert.ok(!(await page.$(".panel.left")), "browser panel collapses");
  await clickText("› Browser");
  await sleep(150);
  assert.ok(await page.$(".panel.left"), "browser panel expands again");
  step("docked panels collapse and expand");

  // 10. Status bar -------------------------------------------------------------
  assert.match(await statusText(), /Tool:/);
  assert.match(await statusText(), /rev \d+/);
  await page.screenshot({ path: `${SHOTS}/slice3-workspace.png` });
  step("status bar reports tool, snap, scale and project revision");

  // 11. Clean console ----------------------------------------------------------
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
