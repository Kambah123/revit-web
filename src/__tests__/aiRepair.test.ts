/**
 * Tests for the automatic repair loop (`src/ai/repair.ts`).
 *
 * Two layers are covered:
 *  - the pure policy (error bounding/normalization, payload construction), and
 *  - the loop itself against a fake transport, including the real `applyPlan` dry run so the
 *    "parsed fine but the geometry does not fit" path is exercised as the model really hits it.
 */
import { describe, expect, it, vi } from "vitest";
import { applyPlan } from "../ai/applyPlan";
import type { PlanRequestBody, PlanRequestResult, TokenUsage } from "../ai/apiClient";
import { parseDesignPlan } from "../ai/planSchema";
import type { DesignPlan } from "../ai/planTypes";
import {
  MAX_REPAIR_ERRORS,
  MAX_REPAIR_ERROR_CHARS,
  applyRepairErrors,
  boundRepairErrors,
  buildRepairPayload,
  mergeUsage,
  parseRepairErrors,
  requestPlanWithAutoRepair,
  type UsageTotals,
} from "../ai/repair";
import { freshProject } from "./helpers";

const USAGE: TokenUsage = { prompt: 100, completion: 50, total: 150 };

function planOf(operations: Record<string, unknown>[], fields: Record<string, unknown> = {}): DesignPlan {
  const result = parseDesignPlan({ kind: "design-plan", version: 1, summary: "test", operations, ...fields });
  if (!result.ok) throw new Error(`test plan invalid: ${result.errors.join("; ")}`);
  return result.plan;
}

/** A minimal schema-valid plan (nothing to build, so it is always applicable). */
function validPlan(): DesignPlan {
  return planOf([{ op: "view.open", view: "3d" }]);
}

/** A recording fake for the server call. */
function recorder(responses: PlanRequestResult[]) {
  const sent: PlanRequestBody[] = [];
  const request = async (body: PlanRequestBody): Promise<PlanRequestResult> => {
    sent.push(body);
    const next = responses[sent.length - 1];
    if (!next) throw new Error(`unexpected request ${sent.length}`);
    return next;
  };
  return { sent, request };
}

function okResult(plan: unknown): PlanRequestResult {
  return { ok: true, plan, model: "deepseek-flash", demo: false, usage: USAGE };
}

describe("repair error policy", () => {
  it("bounds the number and length of messages and removes duplicates", () => {
    const many = Array.from({ length: MAX_REPAIR_ERRORS + 5 }, (_, i) => `problem ${i}`);
    const bounded = boundRepairErrors([...many, "problem 0", "  ", "x".repeat(MAX_REPAIR_ERROR_CHARS + 100)]);
    expect(bounded).toHaveLength(MAX_REPAIR_ERRORS);
    expect(bounded.filter((e) => e === "problem 0")).toHaveLength(1);
    expect(bounded.every((e) => e.length <= MAX_REPAIR_ERROR_CHARS)).toBe(true);
    expect(bounded.every((e) => e.trim() === e && !e.includes("\n"))).toBe(true);
  });

  it("labels schema failures as json problems", () => {
    expect(parseRepairErrors(["plan.operations[0].op: unknown op \"wall.make\""])).toEqual([
      'plan json: plan.operations[0].op: unknown op "wall.make"',
    ]);
  });

  it("turns per-operation apply failures into numbered messages", () => {
    const result = applyPlan(freshProject(), validPlan());
    const failed = {
      ...result,
      ok: false,
      error: "Operation 1 of 1 failed (Open 3D view): something",
      outcomes: [{ index: 0, op: "view.open", label: "Open 3D view", status: "error" as const, detail: "something specific" }],
    };
    expect(applyRepairErrors(failed)).toEqual(["operation 1 (view.open): something specific"]);
  });

  it("does not invent a repair payload when there is nothing to report", () => {
    expect(buildRepairPayload(validPlan(), validPlan(), [])).toBeNull();
    expect(buildRepairPayload(null, "not an object", [])).toBeNull();
    expect(buildRepairPayload(null, null, ["broken"])).toBeNull();
  });

  it("echoes the validated plan when it parsed and falls back to the raw response when it did not", () => {
    const plan = validPlan();
    const raw = { kind: "design-plan", operations: [{ op: "nonsense" }] };
    expect(buildRepairPayload(plan, raw, ["problem"])?.plan).toBe(plan);
    expect(buildRepairPayload(null, raw, ["problem"])?.plan).toBe(raw);
  });

  it("counts requests and tokens without losing the request count", () => {
    const totals: UsageTotals = { requests: 1, prompt: 10, completion: 5, total: 15 };
    expect(mergeUsage(totals, { requests: 2, prompt: 200, completion: 100, total: 300 })).toEqual({
      requests: 3,
      prompt: 210,
      completion: 105,
      total: 315,
    });
  });
});

describe("requestPlanWithAutoRepair", () => {
  it("returns a valid plan without extra requests when nothing fails", async () => {
    const plan = validPlan();
    const { sent, request } = recorder([okResult(plan)]);
    const preview = vi.fn(() => applyPlan(freshProject(), plan));

    const outcome = await requestPlanWithAutoRepair({ message: "open 3d" }, { request, preview });

    expect(outcome.status).toBe("plan");
    expect(outcome.usage.requests).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].repair ?? null).toBeNull();
    if (outcome.status === "plan") {
      expect(outcome.repair).toBeUndefined();
      expect(outcome.apply.ok).toBe(true);
    }
  });

  it("repairs a schema-invalid response once, sending the problems and the rejected json", async () => {
    const statuses: string[] = [];
    const plan = validPlan();
    const { sent, request } = recorder([
      okResult({ kind: "design-plan", version: 1, summary: "bad", operations: [{ op: "wall.make" }] }),
      okResult(plan),
    ]);

    const outcome = await requestPlanWithAutoRepair(
      { message: "add a wall", history: [{ role: "user", content: "add a wall" }] },
      { request, preview: (p) => applyPlan(freshProject(), p), onStatus: (t) => statuses.push(t) },
    );

    expect(sent).toHaveLength(2);
    expect(sent[1].repair).toBeTruthy();
    expect(sent[1].repair?.errors.join(" ")).toContain("wall.make");
    expect(sent[1].repair?.plan).toEqual({ kind: "design-plan", version: 1, summary: "bad", operations: [{ op: "wall.make" }] });
    // The original conversation is preserved on the repair request.
    expect(sent[1].history).toEqual([{ role: "user", content: "add a wall" }]);
    expect(sent[1].message).toBe("add a wall");
    expect(statuses.join(" ")).toMatch(/json was rejected/i);

    expect(outcome.status).toBe("plan");
    expect(outcome.usage.requests).toBe(2);
    expect(outcome.usage.total).toBe(300);
    if (outcome.status === "plan") {
      expect(outcome.repair?.attempts).toBe(1);
      expect(outcome.repair?.errors.join(" ")).toContain("wall.make");
    }
  });

  it("repairs a plan that parses but cannot be built, with the real applyPlan dry run", async () => {
    // The wall is 3 m long; a 2 m wide window at 2.5 m from the start does not fit.
    const badOps = [
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, height: 2700 },
      { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: "2500 mm", width: "2000 mm", height: 1200, sillHeight: 900 },
    ];
    const fixedOps = [
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, height: 2700 },
      { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: "1500 mm", width: "1200 mm", height: 1200, sillHeight: 900 },
    ];
    const { sent, request } = recorder([okResult(planOf(badOps)), okResult(planOf(fixedOps))]);
    const project = freshProject();

    const outcome = await requestPlanWithAutoRepair({ message: "add a window" }, { request, preview: (p) => applyPlan(project, p) });

    expect(sent).toHaveLength(2);
    expect(sent[1].repair?.errors.join(" ")).toMatch(/operation 2 \(opening\.add\)/i);
    // Feedback is about the plan as validated (lengths normalized to mm), not the raw response.
    const echoed = JSON.stringify(sent[1].repair?.plan);
    expect(echoed).toContain('"offset":2500');
    expect(echoed).not.toContain("2500 mm");

    expect(outcome.status).toBe("plan");
    if (outcome.status === "plan") {
      expect(outcome.apply.ok).toBe(true);
      expect(outcome.apply.project.walls).toHaveLength(1);
      expect(outcome.apply.project.openings).toHaveLength(1);
      expect(outcome.repair?.attempts).toBe(1);
    }
    // The model itself is never touched by a dry run.
    expect(project.walls).toHaveLength(0);
  });

  it("gives up after the configured budget and keeps the feedback for a user-initiated retry", async () => {
    const invalid = { kind: "design-plan", version: 1, summary: "bad", operations: [{ op: "wall.make" }] };
    const { sent, request } = recorder([okResult(invalid), okResult(invalid)]);

    const outcome = await requestPlanWithAutoRepair({ message: "add a wall" }, { request, preview: () => applyPlan(freshProject(), validPlan()) });

    expect(sent).toHaveLength(2); // one attempt + one repair, never more
    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") {
      expect(outcome.errors.join(" ")).toContain("wall.make");
      expect(outcome.plan).toBeNull();
      expect(outcome.repairPayload?.errors.join(" ")).toContain("wall.make");
      expect(outcome.usage.requests).toBe(2);
    }
  });

  it("surfaces an unbuildable plan with its per-operation context when repair does not help", async () => {
    const badOps = [
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, height: 2700 },
      { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: "2500 mm", width: "2000 mm", height: 1200, sillHeight: 900 },
    ];
    const bad = planOf(badOps);
    const { request } = recorder([okResult(bad), okResult(bad)]);

    const outcome = await requestPlanWithAutoRepair({ message: "add a window" }, { request, preview: (p) => applyPlan(freshProject(), p) });

    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") {
      expect(outcome.plan).not.toBeNull();
      expect(outcome.apply?.ok).toBe(false);
      expect(outcome.apply?.outcomes.some((o) => o.status === "error")).toBe(true);
      expect(outcome.errors.join(" ")).toMatch(/operation 2/i);
    }
  });

  it("does not attempt a repair when the budget is zero", async () => {
    const invalid = { kind: "design-plan", version: 1, summary: "bad", operations: [{ op: "wall.make" }] };
    const { sent, request } = recorder([okResult(invalid)]);

    const outcome = await requestPlanWithAutoRepair({ message: "add a wall" }, { request, preview: () => applyPlan(freshProject(), validPlan()), maxAutoRepairs: 0 });

    expect(sent).toHaveLength(1);
    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") expect(outcome.repairPayload).not.toBeNull();
  });

  it("reports transport failures without retrying or repairing", async () => {
    const { sent, request } = recorder([{ ok: false, code: "ai_timeout", message: "The AI service timed out." }]);

    const outcome = await requestPlanWithAutoRepair({ message: "design a house" }, { request, preview: () => applyPlan(freshProject(), validPlan()) });

    expect(sent).toHaveLength(1);
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.code).toBe("ai_timeout");
      expect(outcome.usage.requests).toBe(1);
      expect(outcome.repairPayload).toBeNull();
    }
  });

  it("never sends more than one repair request when both attempts fail on geometry", async () => {
    const badOps = [
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, height: 2700 },
      { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: "2900 mm", width: "2000 mm", height: 1200, sillHeight: 900 },
    ];
    const bad = planOf(badOps);
    const { sent, request } = recorder([okResult(bad), okResult(bad), okResult(bad)]);

    const outcome = await requestPlanWithAutoRepair({ message: "add a window" }, { request, preview: (p) => applyPlan(freshProject(), p) });

    expect(sent).toHaveLength(2);
    expect(outcome.status).toBe("invalid");
  });
});
