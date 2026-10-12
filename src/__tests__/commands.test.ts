import { describe, expect, it } from "vitest";
import {
  addLevel,
  addOpening,
  addWall,
  deleteLevel,
  deleteOpening,
  deleteWall,
  renameLevel,
  setLevelElevation,
  updateOpening,
  updateWall,
  updateWallType,
} from "../model/commands";
import { validateProject } from "../model/validation";
import { freshProject, ids } from "./helpers";

function errorsOf(p: Parameters<typeof validateProject>[0]) {
  return validateProject(p).filter((i) => i.severity === "error");
}

describe("levels", () => {
  it("adds, sorts by elevation, renames and changes elevation", () => {
    const p = freshProject();
    const { project, level } = addLevel(p, "Roof", 9000);
    expect(project.levels.map((l) => l.name)).toEqual(["Level 1", "Level 2", "Roof"]);
    const renamed = renameLevel(project, level.id, "  Top  ");
    expect(renamed.levels[2].name).toBe("Top");
    const moved = setLevelElevation(renamed, level.id, 1000);
    expect(moved.levels.map((l) => l.name)).toEqual(["Level 1", "Top", "Level 2"]);
  });

  it("refuses an empty name and leaves the project unchanged", () => {
    const p = freshProject();
    expect(() => renameLevel(p, p.levels[0].id, "   ")).toThrow(/cannot be empty/);
  });

  it("refuses non-integer elevations", () => {
    const p = freshProject();
    expect(() => addLevel(p, "Bad", 1.5)).toThrow(/whole-millimetre/);
  });

  it("deleting a level removes its walls and their openings, and the last level is protected", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1 } = addWall(p0, i.level2, { x: 0, y: 0 }, { x: 4000, y: 0 }, { wallTypeId: i.thickWall });
    const wallId = p1.walls[0].id;
    const { project: p2 } = addOpening(p1, wallId, i.window, 2000);
    const p3 = deleteLevel(p2, i.level2);
    expect(p3.walls).toHaveLength(0);
    expect(p3.openings).toHaveLength(0);
    expect(p3.levels.map((l) => l.id)).toEqual([i.level1]);
    expect(() => deleteLevel(p3, i.level1)).toThrow(/at least one level/);
    expect(() => deleteLevel(p3, i.level2)).toThrow(/Unknown level/);
  });
});

describe("walls", () => {
  it("adds a wall with the default type and height, and rejects walls shorter than 50 mm", () => {
    const p = freshProject();
    const i = ids(p);
    const { project, wall } = addWall(p, i.level1, { x: 0, y: 0 }, { x: 5000, y: 0 });
    expect(wall.wallTypeId).toBe(i.thickWall);
    expect(wall.height).toBe(3000);
    expect(project.walls).toHaveLength(1);
    expect(() => addWall(p, i.level1, { x: 0, y: 0 }, { x: 10, y: 0 })).toThrow(/at least 50 mm/);
    expect(() => addWall(p, "missing", { x: 0, y: 0 }, { x: 1000, y: 0 })).toThrow(/Unknown level/);
  });

  it("never mutates the input project", () => {
    const p = freshProject();
    const before = JSON.stringify(p);
    addWall(p, p.levels[0].id, { x: 0, y: 0 }, { x: 2000, y: 2000 });
    expect(JSON.stringify(p)).toBe(before);
  });

  it("edits endpoints, height and wall type, and refuses edits that make the wall too short", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 5000, y: 0 });
    const moved = updateWall(project, wall.id, { end: { x: 6000, y: 0 }, height: 2700, wallTypeId: i.thinWall });
    expect(moved.walls[0]).toMatchObject({ end: { x: 6000, y: 0 }, height: 2700, wallTypeId: i.thinWall });
    expect(() => updateWall(project, wall.id, { end: { x: 10, y: 0 } })).toThrow(/at least 50 mm/);
  });

  it("changing a wall type's thickness updates every wall of that type", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1 } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 5000, y: 0 }, { wallTypeId: i.thickWall });
    const p2 = updateWallType(p1, i.thickWall, { thickness: 250 });
    expect(p2.wallTypes.find((t) => t.id === i.thickWall)?.thickness).toBe(250);
    expect(p2.walls[0].wallTypeId).toBe(i.thickWall);
    expect(() => updateWallType(p1, i.thickWall, { thickness: 0 })).toThrow(/positive/);
  });

  it("assigns wall type materials without changing wall instances", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const wood = p0.materials.find((material) => material.name === "Wood");
    expect(wood).toBeDefined();
    const { project: p1 } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 5000, y: 0 });
    const p2 = updateWallType(p1, i.thickWall, { materialId: wood!.id });
    expect(p2.wallTypes.find((type) => type.id === i.thickWall)?.materialId).toBe(wood!.id);
    expect(p2.walls).toEqual(p1.walls);
    expect(() => updateWallType(p2, i.thickWall, { materialId: "missing-material" })).toThrow(/missing material/);
  });

  it("deleting a wall deletes its hosted openings in the same command", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1 } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 5000, y: 0 });
    const { project: p2 } = addOpening(p1, p1.walls[0].id, i.door, 2000);
    const p3 = deleteWall(p2, p2.walls[0].id);
    expect(p3.walls).toHaveLength(0);
    expect(p3.openings).toHaveLength(0);
    expect(errorsOf(p3)).toEqual([]);
  });
});

describe("hosted openings", () => {
  function wallWithDoor() {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 6000, y: 0 }, { wallTypeId: i.thickWall });
    const { project: p2, opening } = addOpening(p1, wall.id, i.door, 3000);
    return { p: p2, i, wall, opening };
  }

  it("adds a door that fits in the wall", () => {
    const { p, opening } = wallWithDoor();
    expect(opening.offset).toBe(3000);
    expect(errorsOf(p)).toEqual([]);
  });

  it("refuses openings that fall outside the wall, overlap, or are taller than the wall", () => {
    const { p, i, wall } = wallWithDoor();
    expect(() => addOpening(p, wall.id, i.door, 200)).toThrow(/outside its host wall/);
    expect(() => addOpening(p, wall.id, i.door, 5900)).toThrow(/outside its host wall/);
    expect(() => addOpening(p, wall.id, i.door, 3500)).toThrow(/overlap/);
    // Lowering the wall below the existing door's head is refused, and the wall keeps its height.
    expect(() => updateWall(p, wall.id, { height: 2000 })).toThrow(/taller than its host wall/);
    // A window whose head is above a short new wall is refused when added.
    const short = addWall(p, i.level1, { x: 0, y: 5000 }, { x: 4000, y: 5000 }, { height: 2000 }).project;
    const shortWall = short.walls[short.walls.length - 1];
    expect(() => addOpening(short, shortWall.id, i.window, 1000)).toThrow(/taller than its host wall/);
  });

  it("allows adjacent openings that touch but do not overlap", () => {
    const { p, i, wall } = wallWithDoor();
    expect(() => addOpening(p, wall.id, i.door, 3900)).not.toThrow();
  });

  it("refuses a wall edit that would leave an opening outside the wall, without deleting the opening", () => {
    const { p, wall, opening } = wallWithDoor();
    expect(() => updateWall(p, wall.id, { end: { x: 3000, y: 0 } })).toThrow(/outside its host wall/);
    expect(p.openings.map((o) => o.id)).toContain(opening.id);
  });

  it("moves an opening within the wall and deletes it", () => {
    const { p, i, opening } = wallWithDoor();
    const moved = updateOpening(p, opening.id, { offset: 4000 });
    expect(moved.openings[0].offset).toBe(4000);
    expect(() => updateOpening(p, opening.id, { openingTypeId: i.window, offset: 1000 })).not.toThrow();
    expect(deleteOpening(p, opening.id).openings).toHaveLength(0);
  });
});
