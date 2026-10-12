/**
 * Local, OpenAI-compatible **mock model** for offline demos and manual QA of the AI pipeline.
 *
 * This is not a language model. It is a small deterministic stub that speaks just enough of
 * `POST /chat/completions` for `server/index.mjs` to talk to it, and it exists for one reason: to
 * exercise the **repair path** without an API key, deterministically.
 *
 * Behaviour:
 *  - A request that asks for a building is answered with a plan that is deliberately broken (a wide
 *    window placed so far along its wall that it hangs off the end). The deterministic validator
 *    rejects it, the client re-asks with the validator's messages, and this stub then answers the
 *    repair request by *generically* clamping every opening to fit its host wall.
 *  - A request that already contains a "VALIDATION REPAIR REQUEST" block is always answered by that
 *    clamp, whatever the plan was.
 *  - Anything else is delegated to the rule-based demo planner (`demoPlanner.mjs`), so the UI stays
 *    usable while clicking around.
 *
 * Run:      node server/mockModel.mjs                      (127.0.0.1:9999 by default)
 * Wire up:  DEEPSEEK_API_KEY=demo DEEPSEEK_BASE_URL=http://127.0.0.1:9999 node server/index.mjs
 */

import http from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { demoPlanFor } from "./demoPlanner.mjs";

const BUILD_REQUEST = /\b(design|build|house|home|studio|office|apartment|cottage|cabin|building|rooms?)\b/i;

/** Four walls 9 x 6 m, slab, room, door, two windows — the second window hangs off the wall. */
export function scriptedBrokenPlan() {
  const boundary = [
    { x: 0, y: 0 },
    { x: 9000, y: 0 },
    { x: 9000, y: 6000 },
    { x: 0, y: 6000 },
  ];
  return {
    kind: "design-plan",
    version: 1,
    summary: "New 9 x 6 m studio: walls, floor, room, door, two front windows.",
    assumptions: ["Wall height 2.7 m", "Window size 1200 x 1200 mm with a 900 mm sill"],
    clarifications: [],
    unsupported: [],
    operations: [
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 9000, y: 0 }, height: 2700 },
      { op: "wall.add", opId: "w2", level: { name: "Level 1" }, start: { x: 9000, y: 0 }, end: { x: 9000, y: 6000 }, height: 2700 },
      { op: "wall.add", opId: "w3", level: { name: "Level 1" }, start: { x: 9000, y: 6000 }, end: { x: 0, y: 6000 }, height: 2700 },
      { op: "wall.add", opId: "w4", level: { name: "Level 1" }, start: { x: 0, y: 6000 }, end: { x: 0, y: 0 }, height: 2700 },
      { op: "floor.add", opId: "f1", level: { name: "Level 1" }, boundary },
      { op: "room.add", opId: "r1", level: { name: "Level 1" }, name: "Studio", number: "1", boundary },
      { op: "opening.add", opId: "d1", kind: "door", hostWall: { opId: "w1" }, offset: 4500, width: 900, height: 2100 },
      { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: 1500, width: 1200, height: 1200, sillHeight: 900 },
      // Deliberate defect: 9000 + 600 mm of half width is past the end of the wall.
      { op: "opening.add", opId: "win2", kind: "window", hostWall: { opId: "w1" }, offset: 9000, width: 1200, height: 1200, sillHeight: 900 },
      { op: "view.open", view: "3d" },
    ],
  };
}

/** Wall length in mm for an `opening.add` host reference, resolved within the same plan. */
function hostWallLengthMm(plan, hostRef) {
  const opId = hostRef?.opId;
  const wall = (plan.operations ?? []).find((op) => op.op === "wall.add" && op.opId === opId);
  if (!wall) return null;
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  return Number.isFinite(length) ? length : null;
}

/**
 * The "fix": clamp every opening into its host wall (shrink if the opening is wider than the wall).
 * Deterministic, generic, and exactly the kind of fix the real model is asked for on a repair turn.
 */
export function repairPlan(plan) {
  const operations = [];
  const fixes = [];
  for (const op of plan.operations ?? []) {
    if (op.op !== "opening.add") {
      operations.push(op);
      continue;
    }
    const length = hostWallLengthMm({ operations }, op.hostWall);
    if (length === null || length <= 0) {
      operations.push(op);
      continue;
    }
    const maxWidth = Math.max(300, Math.min(op.width, length - 100));
    const width = Math.min(op.width, maxWidth);
    const half = width / 2;
    const offset = Math.round(Math.min(Math.max(op.offset, half + 50), length - half - 50));
    if (width !== op.width || offset !== op.offset) {
      fixes.push(`${op.kind === "door" ? "door" : "window"} ${op.opId}: ${op.width} mm wide at ${op.offset} mm → ${width} mm wide at ${offset} mm`);
    }
    operations.push({ ...op, width, offset });
  }
  return {
    ...plan,
    summary: `${plan.summary} (placements corrected)`.replace(/\. \(/, " — ("),
    assumptions: [
      ...(plan.assumptions ?? []).filter((a) => !/corrected|clamp/i.test(a)),
      ...fixes.map((fix) => `Re-fitted ${fix} so it stays inside its host wall`),
    ],
    operations,
  };
}

/** Extracts the user's own words from the assembled prompt (context + repair block + request). */
export function userRequestOf(content) {
  const marker = "USER REQUEST:";
  const index = content.lastIndexOf(marker);
  return index === -1 ? content : content.slice(index + marker.length).trim();
}

/** Extracts the rejected json echoed back by the client, if any. */
export function rejectedPlanOf(content) {
  const marker = "PREVIOUS JSON (rejected; lengths shown normalized to millimetres):";
  const index = content.indexOf(marker);
  if (index === -1) return null;
  const rest = content.slice(index + marker.length).trim();
  const end = rest.indexOf("\n\n");
  const jsonText = end === -1 ? rest : rest.slice(0, end);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function respondJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

/** Creates the mock model server (not yet listening) so tests can bind it to an ephemeral port. */
export function createMockModelServer() {
  return http.createServer(async (req, res) => {
    if (req.method !== "POST" || !String(req.url).endsWith("/chat/completions")) {
      return respondJson(res, 404, { error: { type: "not_found", message: "Mock model serves POST /chat/completions only." } });
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return respondJson(res, 400, { error: { type: "invalid_json", message: "Body is not json." } });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const isRepair = lastUser.includes("VALIDATION REPAIR REQUEST");
    const request = userRequestOf(lastUser);
    const previous = isRepair ? rejectedPlanOf(lastUser) : null;

    let plan;
    if (isRepair && previous) {
      plan = repairPlan(previous);
    } else if (isRepair) {
      plan = scriptedBrokenPlan();
    } else if (BUILD_REQUEST.test(request)) {
      plan = scriptedBrokenPlan();
    } else {
      plan = demoPlanFor({ message: request, history: [], context: null, selection: null, repair: null });
    }

    const usage = { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 };
    console.log(`${isRepair ? "repair" : "initial"} request → ${plan.operations.length} operations`);
    return respondJson(res, 200, {
      id: `chatcmpl-mock-${Date.now()}`,
      object: "chat.completion",
      model: body.model ?? "mock-model",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(plan) }, finish_reason: "stop" }],
      usage,
    });
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.MOCK_MODEL_PORT ?? 9999);
  const host = process.env.MOCK_MODEL_HOST ?? "127.0.0.1";
  createMockModelServer().listen(port, host, () => {
    console.log(`Mock model (not an LLM) listening on http://${host}:${port}/chat/completions`);
    console.log("It answers build requests with a deliberately broken plan, then fixes it on the repair request.");
  });
}
