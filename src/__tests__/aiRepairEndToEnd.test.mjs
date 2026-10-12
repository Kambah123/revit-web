/**
 * Integration test for the repair loop across the real system boundary:
 *
 *   client orchestrator (src/ai/repair.ts)
 *     → real HTTP request body (`repair` field)
 *     → real server (server/index.mjs, request validation + prompt assembly)
 *     → mocked DeepSeek (local HTTP)
 *
 * Only the model itself is mocked. This is the wiring the unit tests cannot see: that the server
 * accepts and forwards the repair block, that the echoed json and problems reach the prompt in the
 * documented shape, and that a repaired plan comes back through the ordinary response envelope.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../server/index.mjs";
import { loadConfig } from "../../server/config.mjs";
import { createMockModelServer } from "../../server/mockModel.mjs";
import { requestAiPlan } from "../ai/apiClient";
import { applyPlan } from "../ai/applyPlan";
import { requestPlanWithAutoRepair } from "../ai/repair";
import { freshProject } from "./helpers";

const SECRET = "sk-e2e-secret-key-999";

const WALL_ONLY = {
  kind: "design-plan",
  version: 1,
  summary: "Add a 3 m wall with a very wide window.",
  assumptions: [],
  clarifications: [],
  unsupported: [],
  operations: [
    { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, height: 2700 },
    { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: 2500, width: 2000, height: 1200, sillHeight: 900 },
  ],
};

const REPAIRED = {
  ...WALL_ONLY,
  summary: "Add a 3 m wall with a 1200 mm window that fits.",
  operations: [
    WALL_ONLY.operations[0],
    { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: 1500, width: 1200, height: 1200, sillHeight: 900 },
  ],
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe("repair loop end to end (client ⇄ server ⇄ mocked model)", () => {
  let mockServer;
  let appServer;
  let base;
  const seen = [];

  beforeAll(async () => {
    // The model: rejects nothing, but answers the first question badly and the repair request well.
    mockServer = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      seen.push(body);
      // The repair block arrives in the *user* turn; the system prompt mentions it too, so a naive
      // search over all messages would match every request.
      const lastTurn = body.messages[body.messages.length - 1];
      const isRepair = String(lastTurn?.content ?? "").includes("VALIDATION REPAIR REQUEST");
      const plan = isRepair ? REPAIRED : WALL_ONLY;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-e2e",
          model: "deepseek-flash",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(plan) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
        }),
      );
    });
    const mockPort = await listen(mockServer);

    const config = {
      ...loadConfig({ DEEPSEEK_API_KEY: SECRET, DEEPSEEK_MODEL: "deepseek-flash", AI_RATE_LIMIT_PER_MIN: "1000" }),
      baseUrl: `http://127.0.0.1:${mockPort}`,
    };
    appServer = createServer({ config });
    const appPort = await listen(appServer);
    base = `http://127.0.0.1:${appPort}`;
  });

  afterAll(async () => {
    await close(appServer);
    await close(mockServer);
  });

  it("turns an unbuildable plan into an applied, verified plan with one extra request", async () => {
    const project = freshProject();
    const statuses = [];

    const outcome = await requestPlanWithAutoRepair(
      { message: "fit a window into a 3 m wall" },
      {
        // The browser sends a relative URL; point it at the test server.
        request: (body) => requestAiPlan(body, { fetchImpl: (url, init) => fetch(new URL(url, base), init) }),
        preview: (plan) => applyPlan(project, plan),
        onStatus: (text) => statuses.push(text),
      },
    );

    expect(outcome.status).toBe("plan");
    if (outcome.status !== "plan") throw new Error("expected a repaired plan");

    // Two model calls: the failed attempt and one repair, both accounted for.
    expect(outcome.usage.requests).toBe(2);
    expect(outcome.usage.total).toBe(400);
    expect(statuses.join(" ")).toMatch(/cannot be built/i);

    // The prompt the model received really contained the validator's message and the rejected json.
    expect(seen).toHaveLength(2);
    const repairTurn = seen[1].messages[seen[1].messages.length - 1];
    expect(repairTurn.role).toBe("user");
    expect(repairTurn.content).toContain("VALIDATION REPAIR REQUEST");
    expect(repairTurn.content).toContain("operation 2 (opening.add)");
    expect(repairTurn.content).toContain("would fall outside its host wall");
    // The echoed json is the one the validator saw: lengths normalized to integer millimetres.
    expect(repairTurn.content).toContain('"offset":2500');
    expect(repairTurn.content).toContain("USER REQUEST:\nfit a window into a 3 m wall");
    expect(seen[1].messages[0].content).toContain("REPAIR REQUESTS");
    // Deterministic fixing, not creative redesign; ordinary requests keep the configured sampling.
    expect(seen[1].temperature).toBe(0);
    expect(seen[0].temperature).toBe(0.2);

    // The repaired plan is genuinely buildable in the canonical model.
    expect(outcome.apply.ok).toBe(true);
    expect(outcome.apply.project.walls).toHaveLength(1);
    expect(outcome.apply.project.openings).toHaveLength(1);
    const opening = outcome.apply.project.openings[0];
    const wall = outcome.apply.project.walls[0];
    expect(opening.hostWallId).toBe(wall.id);
    expect(opening.offset + 600).toBeLessThanOrEqual(3000);
    expect(project.walls).toHaveLength(0);

    // The server never echoes the secret back through the transport.
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
  });
});

/**
 * The offline demo harness (`npm run mock:model`) must really exercise the repair path: if it
 * stopped producing a rejectable plan, the demo would silently stop demonstrating anything.
 */
describe("mock model harness (npm run mock:model)", () => {
  it("answers a build request with a plan that is rejected, then fixes it on the repair request", async () => {
    const mockModel = createMockModelServer();
    const mockPort = await listen(mockModel);
    const config = {
      ...loadConfig({ DEEPSEEK_API_KEY: "demo", AI_RATE_LIMIT_PER_MIN: "1000" }),
      baseUrl: `http://127.0.0.1:${mockPort}`,
    };
    const appServer = createServer({ config });
    const appPort = await listen(appServer);
    const base = `http://127.0.0.1:${appPort}`;

    try {
      const project = freshProject();
      const outcome = await requestPlanWithAutoRepair(
        { message: "Design a studio" },
        {
          request: (body) => requestAiPlan(body, { fetchImpl: (url, init) => fetch(new URL(url, base), init) }),
          preview: (plan) => applyPlan(project, plan),
        },
      );

      expect(outcome.status).toBe("plan");
      if (outcome.status !== "plan") throw new Error("the harness did not produce a repairable plan");
      // The deliberately broken plan was rejected, repaired, and only then accepted.
      expect(outcome.repair?.attempts).toBe(1);
      expect(outcome.usage.requests).toBe(2);
      expect(outcome.apply.ok).toBe(true);

      // Every repaired opening fits its host wall, and the fix is disclosed in the assumptions.
      const walls = new Map(outcome.apply.project.walls.map((w) => [w.id, w]));
      for (const opening of outcome.apply.project.openings) {
        const wall = walls.get(opening.hostWallId);
        const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
        const type = outcome.apply.project.openingTypes.find((t) => t.id === opening.openingTypeId);
        expect(opening.offset - type.width / 2).toBeGreaterThanOrEqual(0);
        expect(opening.offset + type.width / 2).toBeLessThanOrEqual(length);
      }
      expect(outcome.plan.assumptions.join(" ")).toMatch(/Re-fitted/i);
    } finally {
      await close(appServer);
      await close(mockModel);
    }
  });
});
