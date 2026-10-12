/**
 * Integration tests: DesignPlan → transactional apply → canonical model. These prove that AI
 * operations become genuine, editable BIM entities through the command layer (not render-only
 * shapes), that edits keep stable identities, that failures are atomic, and that applied plans
 * participate in undo/redo as a single step.
 */
import { describe, expect, it } from "vitest";
import { applyPlan } from "../ai/applyPlan";
import { parseDesignPlan } from "../ai/planSchema";
import type { DesignPlan } from "../ai/planTypes";
import { historyReducer, initialHistory } from "../app/history";
import { validateProject } from "../model/validation";
import { roomAreaM2, wallLengthMm } from "../model/quantities";
import { freshProject, ids } from "./helpers";
import type { Project, Roof, Room, Wall } from "../model/types";

function planOf(operations: Record<string, unknown>[], fields: Record<string, unknown> = {}): DesignPlan {
  const result = parseDesignPlan({ kind: "design-plan", version: 1, summary: "test", operations, ...fields });
  if (!result.ok) throw new Error(`test plan invalid: ${result.errors.join("; ")}`);
  return result.plan;
}

function errorsOf(p: Project) {
  return validateProject(p).filter((i) => i.severity === "error");
}

/** A 9 x 6 m studio: four walls, slab, room, door, two windows, hip roof. */
function studioPlan(): DesignPlan {
  return planOf([
    { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: "9 m", y: 0 }, height: "2.7 m" },
    { op: "wall.add", opId: "w2", level: { name: "Level 1" }, start: { x: "9 m", y: 0 }, end: { x: "9 m", y: "6 m" }, height: "2.7 m" },
    { op: "wall.add", opId: "w3", level: { name: "Level 1" }, start: { x: "9 m", y: "6 m" }, end: { x: 0, y: "6 m" }, height: "2.7 m" },
    { op: "wall.add", opId: "w4", level: { name: "Level 1" }, start: { x: 0, y: "6 m" }, end: { x: 0, y: 0 }, height: "2.7 m" },
    { op: "floor.add", opId: "f1", level: { name: "Level 1" }, boundary: [{ x: 0, y: 0 }, { x: "9 m", y: 0 }, { x: "9 m", y: "6 m" }, { x: 0, y: "6 m" }] },
    { op: "room.add", opId: "r1", level: { name: "Level 1" }, name: "Studio", number: "1", boundary: [{ x: 0, y: 0 }, { x: "9 m", y: 0 }, { x: "9 m", y: "6 m" }, { x: 0, y: "6 m" }] },
    { op: "opening.add", opId: "d1", kind: "door", hostWall: { opId: "w1" }, offset: "4.5 m", width: 900, height: 2100 },
    { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: "1.5 m", width: 1200, height: 1200, sillHeight: 900 },
    { op: "opening.add", opId: "win2", kind: "window", hostWall: { opId: "w1" }, offset: "7.5 m", width: 1200, height: 1200, sillHeight: 900 },
    { op: "roof.add", opId: "rf1", level: { name: "Level 2" }, boundary: [{ x: 0, y: 0 }, { x: "9 m", y: 0 }, { x: "9 m", y: "6 m" }, { x: 0, y: "6 m" }], overhang: "600 mm", rise: "1.8 m" },
    { op: "view.open", view: "3d" },
  ]);
}

describe("applyPlan — new building generation", () => {
  it("creates real canonical entities through the command layer", () => {
    const p0 = freshProject();
    const result = applyPlan(p0, studioPlan());

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(errorsOf(result.project)).toEqual([]);

    const p = result.project;
    expect(p.walls).toHaveLength(4);
    expect(p.openings).toHaveLength(3);
    expect(p.floors).toHaveLength(1);
    expect(p.rooms).toHaveLength(1);
    expect(p.roofs).toHaveLength(1);

    // Genuine BIM data, not render shapes: integer mm geometry, type references, derived quantities.
    const wall = p.walls[0] as Wall;
    expect(wall.start).toEqual({ x: 0, y: 0 });
    expect(wall.end).toEqual({ x: 9000, y: 0 });
    expect(wall.height).toBe(2700);
    expect(wallLengthMm(wall)).toBe(9000);
    expect(roomAreaM2(p.rooms[0])).toBeCloseTo(54, 5);

    // Doors and windows are hosted by the wall created earlier in the same plan.
    for (const opening of p.openings) {
      expect(opening.hostWallId).toBe(wall.id);
    }
    const door = p.openings[0];
    const doorType = p.openingTypes.find((t) => t.id === door.openingTypeId)!;
    expect(doorType.kind).toBe("door");
    expect(doorType.sillHeight).toBe(0);
    expect(doorType.width).toBe(900);

    // Hip roof with overhang and rise on the roof level.
    const roof = p.roofs[0] as Roof;
    expect(roof.overhang).toBe(600);
    expect(roof.rise).toBe(1800);

    // view.open is reported, not applied to the model.
    expect(result.views).toEqual([{ view: "3d" }]);
    expect(result.createdIds).toHaveLength(10);
  });

  it("reuses existing opening types of the requested size and creates them when missing", () => {
    const p0 = freshProject();
    const first = applyPlan(p0, planOf([
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },
      { op: "opening.add", kind: "door", hostWall: { opId: "w1" }, offset: 1000, width: 900, height: 2100 },
      { op: "opening.add", kind: "door", hostWall: { opId: "w1" }, offset: 3500, width: 900, height: 2100 },
    ]));
    expect(first.ok).toBe(true);
    // The seeded "Door 900 x 2100" matches exactly, so no new type is created.
    expect(first.project.openingTypes.filter((t) => t.kind === "door")).toHaveLength(1);
    expect(first.project.openings).toHaveLength(2);

    const custom = applyPlan(first.project, planOf([
      { op: "wall.add", opId: "w2", level: { name: "Level 1" }, start: { x: 0, y: 2000 }, end: { x: 5000, y: 2000 } },
      { op: "opening.add", kind: "window", hostWall: { opId: "w2" }, offset: 2500, width: 1500, height: 1400, sillHeight: 800 },
    ]));
    expect(custom.ok).toBe(true);
    const created = custom.project.openingTypes.find((t) => t.width === 1500 && t.height === 1400);
    expect(created).toBeDefined();
    expect(created!.kind).toBe("window");
    expect(custom.project.openings[2].openingTypeId).toBe(created!.id);
  });
});

describe("applyPlan — edits to an existing design", () => {
  it("adds a hip roof to an existing building, referencing walls by id", () => {
    const built = applyPlan(freshProject(), studioPlan());
    expect(built.ok).toBe(true);
    const p0 = built.project;
    const before = p0.roofs.length;

    // "Add a hip roof with a 600 mm overhang" over the existing footprint.
    const result = applyPlan(
      p0,
      planOf([
        {
          op: "roof.add",
          level: { name: "Level 2" },
          boundary: [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 6000 }, { x: 0, y: 6000 }],
          overhang: 600,
          rise: 2000,
        },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.project.roofs).toHaveLength(before + 1);
    // Everything else untouched.
    expect(result.project.walls).toEqual(p0.walls);
    expect(result.project.rooms).toEqual(p0.rooms);
  });

  it("makes a room larger via room.update and keeps its identity", () => {
    const built = applyPlan(freshProject(), studioPlan());
    const p0 = built.project;
    const room = p0.rooms[0];
    const result = applyPlan(
      p0,
      planOf([
        {
          op: "room.update",
          room: { id: room.id },
          boundary: [{ x: -500, y: -500 }, { x: 9500, y: -500 }, { x: 9500, y: 6500 }, { x: -500, y: 6500 }],
        },
      ]),
    );
    expect(result.ok).toBe(true);
    const updated = result.project.rooms[0] as Room;
    expect(updated.id).toBe(room.id); // stable identity: edited, not recreated
    expect(roomAreaM2(updated)).toBeGreaterThan(roomAreaM2(room));
    expect(result.project.rooms).toHaveLength(1);
  });

  it("updates wall properties by id and preserves hosted openings", () => {
    const built = applyPlan(freshProject(), studioPlan());
    const p0 = built.project;
    const wall = p0.walls[0];
    const openingCount = p0.openings.length;
    const result = applyPlan(p0, planOf([{ op: "wall.update", wall: { id: wall.id }, height: 3200 }]));
    expect(result.ok).toBe(true);
    expect(result.project.walls[0].id).toBe(wall.id);
    expect(result.project.walls[0].height).toBe(3200);
    expect(result.project.openings).toHaveLength(openingCount);
    expect(result.project.openings[0].hostWallId).toBe(wall.id);
  });

  it("opens elevation views by direction and plan views by level", () => {
    const p0 = freshProject();
    const result = applyPlan(
      p0,
      planOf([
        { op: "view.open", view: "elevation", direction: "south" },
        { op: "view.open", view: "elevation", direction: "north" },
        { op: "view.open", view: "elevation", direction: "west" },
        { op: "view.open", view: "plan", level: { name: "Level 2" } },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.views).toEqual([
      { view: "elevation", direction: "south" },
      { view: "elevation", direction: "north" },
      { view: "elevation", direction: "west" },
      { view: "plan", levelId: ids(p0).level2 },
    ]);
    expect(result.project).toBe(p0); // view-only plans return the input unchanged
  });
});

describe("applyPlan — host relationships and refusals", () => {
  it("refuses a door that does not fit on its host wall", () => {
    const p0 = freshProject();
    const built = applyPlan(p0, planOf([
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 1500, y: 0 } },
    ]));
    expect(built.ok).toBe(true);
    const result = applyPlan(built.project, planOf([
      { op: "opening.add", kind: "door", hostWall: { id: built.project.walls[0].id }, offset: 100, width: 900, height: 2100 },
    ]));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/failed/i);
    expect(result.project).toBe(built.project); // untouched
  });

  it("refuses openings that overlap on the same wall", () => {
    const built = applyPlan(freshProject(), planOf([
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 6000, y: 0 } },
    ]));
    const wallId = built.project.walls[0].id;
    const result = applyPlan(built.project, planOf([
      { op: "opening.add", kind: "door", hostWall: { id: wallId }, offset: 2000, width: 900, height: 2100 },
      { op: "opening.add", kind: "window", hostWall: { id: wallId }, offset: 2300, width: 1200, height: 1200, sillHeight: 900 },
    ]));
    expect(result.ok).toBe(false);
    expect(result.project).toBe(built.project);
  });

  it("rejects unknown references and wrong kinds", () => {
    const p0 = freshProject();
    expect(applyPlan(p0, planOf([{ op: "wall.update", wall: { id: "wall-nope" }, height: 3000 }])).ok).toBe(false);
    expect(applyPlan(p0, planOf([{ op: "room.update", room: { name: "Nowhere" }, name: "X" }])).ok).toBe(false);
    // A level opId cannot be used where a wall is expected.
    const mixed = applyPlan(p0, planOf([
      { op: "level.add", opId: "lv", name: "Attic", elevation: 9000 },
      { op: "wall.delete", wall: { opId: "lv" } },
    ]));
    expect(mixed.ok).toBe(false);
    expect(mixed.outcomes[mixed.outcomes.length - 1].detail).toMatch(/level, but a wall/);
    expect(mixed.project).toBe(p0);
  });
});

describe("applyPlan — atomicity and recovery", () => {
  it("a failure mid-plan leaves the model completely untouched and reports the failing op", () => {
    const p0 = freshProject();
    const plan = planOf([
      { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } },
      { op: "wall.add", opId: "w2", level: { name: "Level 1" }, start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } },
      { op: "wall.add", opId: "w3", level: { name: "Level 1" }, start: { x: 4000, y: 3000 }, end: { x: 4000, y: 3000 } }, // zero length
      { op: "room.add", opId: "r1", level: { name: "Level 1" }, name: "R", boundary: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }] },
    ]);
    const result = applyPlan(p0, plan);
    expect(result.ok).toBe(false);
    expect(result.project).toBe(p0);
    expect(result.project.walls).toHaveLength(0); // the two valid walls were NOT kept
    expect(result.project.rooms).toHaveLength(0);
    expect(result.outcomes.filter((o) => o.status === "ok")).toHaveLength(2);
    const failed = result.outcomes.find((o) => o.status === "error")!;
    expect(failed.index).toBe(2);
    expect(failed.detail).toMatch(/at least 50 mm/i);
    expect(result.error).toContain("Operation 3 of 4");
  });

  it("deletes cascade correctly through plan operations", () => {
    const built = applyPlan(freshProject(), studioPlan());
    const p0 = built.project;
    const wallId = p0.walls[0].id;
    const result = applyPlan(p0, planOf([{ op: "wall.delete", wall: { id: wallId } }]));
    expect(result.ok).toBe(true);
    expect(result.project.walls).toHaveLength(3);
    // Hosted openings died with their host — a real cascade, not orphaned data.
    expect(result.project.openings).toHaveLength(0);
  });
});

describe("applyPlan — undo/redo integration", () => {
  it("an applied plan is one history step that undoes and redoes exactly", () => {
    const p0 = freshProject();
    let hist = initialHistory(p0);
    const plan = studioPlan();
    const applied = applyPlan(hist.present, plan);
    expect(applied.ok).toBe(true);

    hist = historyReducer(hist, { type: "commit", label: `AI: ${plan.summary}`, project: applied.project });
    expect(hist.present.walls).toHaveLength(4);
    expect(hist.present.revision).toBe(p0.revision + 1);

    hist = historyReducer(hist, { type: "undo" });
    expect(hist.present).toBe(p0); // exact snapshot restore
    expect(hist.present.walls).toHaveLength(0);

    hist = historyReducer(hist, { type: "redo" });
    expect(hist.present.walls).toHaveLength(4);
    expect(hist.present.rooms).toHaveLength(1);
    expect(hist.past[hist.past.length - 1].label).toContain("AI:");
  });
});
