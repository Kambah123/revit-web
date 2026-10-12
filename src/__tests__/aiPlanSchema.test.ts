import { describe, expect, it } from "vitest";
import { describeOperation, isQuickApply, parseDesignPlan, MAX_PLAN_OPERATIONS } from "../ai/planSchema";
import type { DesignPlan, WallAdd } from "../ai/planTypes";

function wallOp(overrides: Partial<WallAdd> = {}): Record<string, unknown> {
  return {
    op: "wall.add",
    opId: "w1",
    level: { name: "Level 1" },
    start: { x: 0, y: 0 },
    end: { x: "9 m", y: 0 },
    height: "2.7 m",
    ...overrides,
  };
}

describe("DesignPlan parsing", () => {
  it("accepts a valid plan and normalises lengths to integer mm", () => {
    const result = parseDesignPlan({
      kind: "design-plan",
      version: 1,
      summary: "New studio",
      assumptions: ["2.7 m walls"],
      clarifications: [],
      unsupported: [],
      operations: [wallOp(), { op: "roof.add", level: { name: "Level 2" }, boundary: [{ x: 0, y: 0 }, { x: "9 m", y: 0 }, { x: "9 m", y: "6 m" }, { x: 0, y: "6 m" }], overhang: "600 mm", rise: "1.8 m" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wall = result.plan.operations[0] as WallAdd;
    expect(wall.end).toEqual({ x: 9000, y: 0 });
    expect(wall.height).toBe(2700);
    const roof = result.plan.operations[1];
    if (roof.op !== "roof.add") throw new Error("expected roof.add");
    expect(roof.boundary[2]).toEqual({ x: 9000, y: 6000 });
    expect(roof.overhang).toBe(600);
    expect(roof.rise).toBe(1800);
  });

  it("accepts a { plan } wrapper from the server", () => {
    const result = parseDesignPlan({ plan: { kind: "design-plan", version: 1, operations: [wallOp()] }, model: "deepseek-flash", demo: false });
    expect(result.ok).toBe(true);
  });

  it("rejects malformed responses with readable errors", () => {
    expect(parseDesignPlan(null)).toEqual({ ok: false, errors: ["plan: must be a json object"] });
    expect(parseDesignPlan("hello").ok).toBe(false);
    expect(parseDesignPlan({ kind: "evil-plan", operations: [] }).ok).toBe(false);
    const noOps = parseDesignPlan({ kind: "design-plan", operations: "rm -rf" });
    expect(noOps.ok).toBe(false);
    expect(noOps.ok === false && noOps.errors[0]).toMatch(/operations/);
    const badVersion = parseDesignPlan({ kind: "design-plan", version: 99, operations: [] });
    expect(badVersion.ok).toBe(false);
  });

  it("rejects unknown operations and unknown fields-as-ops", () => {
    const result = parseDesignPlan({ operations: [{ op: "eval", code: "alert(1)" }, wallOp()] });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join("\n")).toMatch(/unknown operation "eval"/);
    const nonsense = parseDesignPlan({ operations: [{ op: "wall.add", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }] });
    // 10 mm wall: schema passes (min length enforced by the command layer), but a missing field fails.
    expect(nonsense.ok).toBe(true);
    const missing = parseDesignPlan({ operations: [{ op: "wall.add", level: { name: "Level 1" } }] });
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.errors.join("\n")).toMatch(/start|end/);
  });

  it("validates references: exactly one of id/opId/name", () => {
    const emptyRef = parseDesignPlan({ operations: [{ op: "wall.delete", wall: {} }] });
    expect(emptyRef.ok).toBe(false);
    const doubleRef = parseDesignPlan({ operations: [{ op: "wall.delete", wall: { id: "wall-1", name: "W1" } }] });
    expect(doubleRef.ok).toBe(false);
    const okRef = parseDesignPlan({ operations: [{ op: "wall.delete", wall: { id: "wall-1" } }] });
    expect(okRef.ok).toBe(true);
  });

  it("validates dimensions and units in operations", () => {
    const badUnit = parseDesignPlan({ operations: [wallOp({ height: "2.7 parsecs" })] });
    expect(badUnit.ok).toBe(false);
    expect(badUnit.ok === false && badUnit.errors.join("\n")).toMatch(/Unknown unit/);
    const tooTall = parseDesignPlan({ operations: [wallOp({ height: "200 m" })] });
    expect(tooTall.ok).toBe(false);
    const negativeOverhang = parseDesignPlan({
      operations: [{ op: "roof.add", level: { name: "Level 2" }, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], overhang: -50 }],
    });
    expect(negativeOverhang.ok).toBe(false);
  });

  it("validates boundaries and door sills", () => {
    const shortBoundary = parseDesignPlan({
      operations: [{ op: "room.add", level: { name: "Level 1" }, name: "R", boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
    });
    expect(shortBoundary.ok).toBe(false);
    expect(shortBoundary.ok === false && shortBoundary.errors.join("\n")).toMatch(/3\.\.200 points/);
    const doorSill = parseDesignPlan({
      operations: [{ op: "opening.add", kind: "door", hostWall: { opId: "w1" }, offset: 1000, sillHeight: 300 }],
    });
    expect(doorSill.ok).toBe(false);
    expect(doorSill.ok === false && doorSill.errors.join("\n")).toMatch(/sill/);
  });

  it("validates view.open operations", () => {
    const badView = parseDesignPlan({ operations: [{ op: "view.open", view: "section" }] });
    expect(badView.ok).toBe(false);
    const elevNoDir = parseDesignPlan({ operations: [{ op: "view.open", view: "elevation" }] });
    expect(elevNoDir.ok).toBe(false);
    const planNoLevel = parseDesignPlan({ operations: [{ op: "view.open", view: "plan" }] });
    expect(planNoLevel.ok).toBe(false);
    const good = parseDesignPlan({
      operations: [
        { op: "view.open", view: "elevation", direction: "south" },
        { op: "view.open", view: "plan", level: { name: "Level 1" } },
        { op: "view.open", view: "3d" },
      ],
    });
    expect(good.ok).toBe(true);
  });

  it("rejects duplicate opIds and oversized plans", () => {
    const dup = parseDesignPlan({ operations: [wallOp(), wallOp({ start: { x: 0, y: 1000 }, end: { x: 9000, y: 1000 } })] });
    expect(dup.ok).toBe(false);
    expect(dup.ok === false && dup.errors.join("\n")).toMatch(/duplicate opId/);
    const many = { operations: Array.from({ length: MAX_PLAN_OPERATIONS + 1 }, () => wallOp({ opId: undefined })) };
    // each op without opId is fine, but the cap still applies
    const big = parseDesignPlan(many);
    expect(big.ok).toBe(false);
    expect(big.ok === false && big.errors.join("\n")).toMatch(/at most 200/);
  });

  it("parses clarifications and unsupported features", () => {
    const result = parseDesignPlan({
      operations: [],
      clarifications: [{ question: "How tall are the walls?", options: ["2.4 m", "2.7 m"] }],
      unsupported: [{ request: "section view", reason: "Sections are not implemented yet.", alternative: "Use elevations." }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.clarifications[0].options).toEqual(["2.4 m", "2.7 m"]);
    expect(result.plan.unsupported[0].alternative).toContain("elevations");
  });
});

describe("describeOperation and quick apply", () => {
  it("describes operations for the preview list", () => {
    const result = parseDesignPlan({ operations: [wallOp(), { op: "opening.add", kind: "door", hostWall: { opId: "w1" }, offset: "2 m" }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(describeOperation(result.plan.operations[0])).toContain("Add wall");
    expect(describeOperation(result.plan.operations[1])).toContain("door");
  });

  it("flags small non-destructive plans for quick apply", () => {
    const small: DesignPlan = parseDesignPlan({ operations: [wallOp()] }).ok ? (parseDesignPlan({ operations: [wallOp()] }) as { ok: true; plan: DesignPlan }).plan : (null as never);
    expect(isQuickApply(small)).toBe(true);
    const destructive = parseDesignPlan({ operations: [{ op: "wall.delete", wall: { id: "wall-1" } }] });
    expect(destructive.ok && isQuickApply(destructive.plan)).toBe(false);
  });
});
