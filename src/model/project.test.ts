import { describe, expect, it } from "vitest";
import {
  addLevel,
  addWall,
  createProject,
  parseProject,
  removeLevel,
  removeWall,
  serializeProject,
  updateWall,
} from "./project";
import { snap, wallPlacement } from "./geometry";

describe("project model", () => {
  it("creates a project with two default levels", () => {
    const p = createProject("Test");
    expect(p.name).toBe("Test");
    expect(p.levels.map((l) => l.name)).toEqual(["Level 1", "Level 2"]);
    expect(p.walls).toEqual([]);
  });

  it("adds walls on an existing level and rejects zero-length walls", () => {
    const p = createProject();
    const levelId = p.levels[0].id;
    const { project, wall } = addWall(p, levelId, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(project.walls).toHaveLength(1);
    expect(wall.height).toBeGreaterThan(0);
    expect(() => addWall(p, levelId, { x: 1, y: 1 }, { x: 1, y: 1 })).toThrow(/longer than 5 cm/);
    expect(() => addWall(p, "missing", { x: 0, y: 0 }, { x: 1, y: 0 })).toThrow(/Unknown level/);
  });

  it("does not mutate the input project", () => {
    const p = createProject();
    const before = JSON.stringify(p);
    addWall(p, p.levels[0].id, { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(JSON.stringify(p)).toBe(before);
  });

  it("updates wall properties and validates them", () => {
    const p = createProject();
    const { project, wall } = addWall(p, p.levels[0].id, { x: 0, y: 0 }, { x: 4, y: 0 });
    const updated = updateWall(project, wall.id, { height: 2.5 });
    expect(updated.walls[0].height).toBe(2.5);
    expect(() => updateWall(project, wall.id, { thickness: 0 })).toThrow(/thickness/);
    expect(() => updateWall(project, wall.id, { levelId: "nope" })).toThrow(/Unknown level/);
  });

  it("removing a level removes its walls and the last level is protected", () => {
    const p = createProject();
    const [l1, l2] = p.levels;
    const withWall = addWall(p, l2.id, { x: 0, y: 0 }, { x: 1, y: 0 }).project;
    const without = removeLevel(withWall, l2.id);
    expect(without.levels.map((l) => l.id)).toEqual([l1.id]);
    expect(without.walls).toEqual([]);
    expect(() => removeLevel(without, l1.id)).toThrow(/at least one level/);
  });

  it("keeps levels sorted by elevation when added", () => {
    const { project } = addLevel(createProject(), "Roof", 12);
    expect(project.levels.map((l) => l.elevation)).toEqual([0, 3, 12]);
  });

  it("removes individual walls", () => {
    const p = createProject();
    const { project, wall } = addWall(p, p.levels[0].id, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(removeWall(project, wall.id).walls).toEqual([]);
  });

  it("round-trips through serialization", () => {
    const base = createProject("RT");
    const p = addWall(base, base.levels[0].id, { x: 0, y: 0 }, { x: 3, y: 4 }).project;
    const text = serializeProject(p);
    expect(parseProject(text)).toEqual(p);
  });

  it("rejects malformed or foreign files with clear messages", () => {
    expect(() => parseProject("not json")).toThrow(/not valid JSON/);
    expect(() => parseProject("[]")).toThrow(/project object/);
    expect(() => parseProject(JSON.stringify({ format: "other" }))).toThrow(/not a revit-web project/);
    const base = JSON.parse(serializeProject(createProject()));
    base.walls = [{ id: "w", levelId: "ghost", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, thickness: 0.2, height: 3 }];
    expect(() => parseProject(JSON.stringify(base))).toThrow(/unknown level/);
  });
});

describe("geometry", () => {
  it("snaps to a step, and a zero step disables snapping", () => {
    expect(snap(1.26, 0.1)).toBeCloseTo(1.3);
    expect(snap(1.26, 0)).toBe(1.26);
  });

  it("places a wall at its midpoint with the correct length and angle", () => {
    const p = createProject();
    const { wall } = addWall(p, p.levels[0].id, { x: 0, y: 0 }, { x: 0, y: 6 });
    const placement = wallPlacement(wall, 3);
    expect(placement.length).toBeCloseTo(6);
    expect(placement.center).toEqual({ x: 0, y: 3 });
    expect(placement.baseElevation).toBe(3);
    // A wall along +y in plan maps to +z in the Y-up scene: local X must map to (0, 0, 1).
    expect(Math.cos(placement.angle)).toBeCloseTo(0, 6);
  });
});
