import { describe, expect, it } from "vitest";
import { addLevel, addOpening, addWall, updateWall } from "../model/commands";
import { findWallJoins, joinedEnds } from "../model/joins";
import { clipSolid, DOOR_LEAF_THICKNESS_MM, projectGeometry, solidVolume, wallGeometry, WINDOW_GLASS_THICKNESS_MM, type Solid } from "../geometry/wallSolids";
import { freshProject, ids } from "./helpers";
import type { Project, Wall } from "../model/types";

function allLevels(p: Project) {
  return new Set(p.levels.map((l) => l.id));
}

/** True if the point (plan mm, elevation mm) lies inside a solid. */
function insideSolid(s: Solid, x: number, y: number, z: number): boolean {
  const dx = x - s.centre.x;
  const dy = y - s.centre.y;
  const along = dx * s.axis.x + dy * s.axis.y;
  const across = -dx * s.axis.y + dy * s.axis.x;
  return Math.abs(along) <= s.length / 2 && Math.abs(across) <= s.thickness / 2 && z > s.z0 && z < s.z1;
}

function wallSolidVolume(solids: Solid[]) {
  return solids.filter((s) => s.role === "wall").reduce((sum, s) => sum + solidVolume(s), 0);
}

describe("wall geometry", () => {
  it("a plain wall is one full-height solid of the wall's length, thickness and height", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 5000, y: 0 }, { wallTypeId: i.thickWall });
    const g = wallGeometry(project, project.walls.find((w) => w.id === wall.id)!);
    expect(g.solids).toHaveLength(1);
    expect(g.solids[0]).toMatchObject({ role: "wall", length: 5000, thickness: 200, z0: 0, z1: 3000 });
    expect(g.voids).toHaveLength(0);
  });

  it("cutting openings conserves volume: wall volume = solid volume minus the openings' voids", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 8000, y: 0 }, { wallTypeId: i.thickWall });
    const { project: p2 } = addOpening(p1, wall.id, i.door, 2000);
    const { project: p3 } = addOpening(p2, wall.id, i.window, 5000);
    const w = p3.walls[0];
    const g = wallGeometry(p3, w);
    const doorVoid = 900 * 200 * 2100;
    const windowVoid = 1200 * 200 * 1200;
    const expected = 8000 * 200 * 3000 - doorVoid - windowVoid;
    expect(wallSolidVolume(g.solids)).toBeCloseTo(expected, 3);
  });

  it("no wall solid occupies a door or window opening, and the wall is solid everywhere else", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 8000, y: 0 }, { wallTypeId: i.thickWall });
    const { project: p2 } = addOpening(p1, wall.id, i.door, 2000);
    const { project: p3 } = addOpening(p2, wall.id, i.window, 5000);
    const g = wallGeometry(p3, p3.walls[0]);
    const wallSolids = g.solids.filter((s) => s.role === "wall");

    // Door opening: x in [1550, 2450], z in [0, 2100]. Nothing in the wall should be there.
    expect(wallSolids.some((s) => insideSolid(s, 2000, 0, 1000))).toBe(false);
    // Window opening: x in [4400, 5600], z in [900, 2100]. The sill and head pieces stop at the opening.
    expect(wallSolids.some((s) => insideSolid(s, 5000, 0, 1500))).toBe(false);
    expect(wallSolids.some((s) => insideSolid(s, 5000, 0, 500))).toBe(true); // below the sill
    expect(wallSolids.some((s) => insideSolid(s, 5000, 0, 2500))).toBe(true); // above the window
    // Solid wall elsewhere, including above the door head.
    expect(wallSolids.some((s) => insideSolid(s, 1000, 0, 1000))).toBe(true);
    expect(wallSolids.some((s) => insideSolid(s, 2000, 0, 2500))).toBe(true);
  });

  it("a door has a head piece above it unless it reaches the full wall height", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 }, { wallTypeId: i.thickWall, height: 3000 });
    const { project: p2 } = addOpening(p1, wall.id, i.door, 2000);
    const doorGeometry = wallGeometry(p2, p2.walls[0]);
    const headPieces = doorGeometry.solids.filter((s) => s.role === "wall" && s.openingId);
    expect(headPieces.map((s) => [s.z0, s.z1])).toEqual([[2100, 3000]]);
    const { project: tall, wall: tallWall } = addWall(p0, i.level1, { x: 0, y: 5000 }, { x: 4000, y: 5000 }, { height: 2100 });
    const { project: tallWithDoor } = addOpening(tall, tallWall.id, i.door, 2000);
    expect(wallGeometry(tallWithDoor, tallWithDoor.walls[tallWithDoor.walls.length - 1]).solids.filter((s) => s.role === "wall" && s.openingId)).toHaveLength(0);
    const leaf = doorGeometry.solids.find((s) => s.role === "door-leaf")!;
    expect(leaf).toMatchObject({ z0: 0, z1: 2100, thickness: DOOR_LEAF_THICKNESS_MM });
    const { project: p3 } = addOpening(p2, wall.id, i.window, 3200);
    const g = wallGeometry(p3, p3.walls[0]);
    const glass = g.solids.find((s) => s.role === "window-glass")!;
    expect(glass).toMatchObject({ z0: 900, z1: 2100, thickness: WINDOW_GLASS_THICKNESS_MM });
    const windowPieces = g.solids.filter((s) => s.role === "wall" && s.openingId === p3.openings[1].id);
    expect(windowPieces.map((s) => [s.z0, s.z1]).sort((a, b) => a[0] - b[0])).toEqual([
      [0, 900],
      [2100, 3000],
    ]);
  });

  it("joined corners extend by half the thickness so the corner has no gap", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall: a } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 }, { wallTypeId: i.thickWall });
    const { project: p2, wall: b } = addWall(p1, i.level1, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { wallTypeId: i.thickWall });
    const wa = p2.walls.find((w) => w.id === a.id)!;
    const wb = p2.walls.find((w) => w.id === b.id)!;
    const ga = wallGeometry(p2, wa).solids[0];
    const gb = wallGeometry(p2, wb).solids[0];
    // Wall a runs to x = 4000 + 100 (half its thickness past the joint); wall b starts 100 before y = 0.
    expect(ga.length).toBe(4100);
    expect(gb.length).toBe(3100);
    // The outer corner square (x in [4000, 4100], y in [-100, 0]) belongs to wall a's extension.
    expect(insideSolid(ga, 4050, -50, 1000)).toBe(true);
    const joins = findWallJoins(p2);
    expect(joins).toHaveLength(1);
    expect(joinedEnds(p2).get(wa.id)).toEqual({ start: false, end: true });
    expect(joinedEnds(p2).get(wb.id)).toEqual({ start: true, end: false });
  });

  it("walls on different levels never join", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1 } = addLevel(p0, "Other", 9000);
    const level3 = p1.levels.find((l) => l.name === "Other")!.id;
    const { project: p2 } = addWall(p1, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 });
    const { project: p3 } = addWall(p2, level3, { x: 4000, y: 0 }, { x: 4000, y: 3000 });
    expect(findWallJoins(p3)).toEqual([]);
  });

  it("walls on upper levels sit at their level elevation", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level2, { x: 0, y: 0 }, { x: 4000, y: 0 });
    const g = wallGeometry(p1, p1.walls.find((w) => w.id === wall.id)!);
    expect(g.solids[0]).toMatchObject({ z0: 3000, z1: 6000 });
  });

  it("dependent geometry follows the model: moving a wall moves its solids and its openings", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 6000, y: 0 }, { wallTypeId: i.thickWall });
    const { project: p2 } = addOpening(p1, wall.id, i.door, 3000);
    const before = projectGeometry(p2, allLevels(p2), i.level1);
    const p3 = updateWall(p2, wall.id, { start: { x: 0, y: 1000 }, end: { x: 6000, y: 1000 } });
    const after = projectGeometry(p3, allLevels(p3), i.level1);
    expect(before.solids[0].centre.y).toBe(0);
    expect(after.solids.every((s) => s.centre.y === 1000)).toBe(true);
    expect(after.voids[0].centre).toEqual({ x: 3000, y: 1000 });
  });

  it("projectGeometry shows only visible levels and picks openings only on the active level", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall: low } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 });
    const { project: p2 } = addOpening(p1, low.id, i.door, 2000);
    const { project: p3 } = addWall(p2, i.level2, { x: 0, y: 2000 }, { x: 4000, y: 2000 });
    const onlyLevel1 = projectGeometry(p3, new Set([i.level1]), i.level1);
    expect(new Set(onlyLevel1.solids.map((s) => s.wallId))).toEqual(new Set([low.id]));
    const wallsOnBoth = projectGeometry(p3, allLevels(p3), i.level2);
    expect(wallsOnBoth.voids).toHaveLength(0);
    expect(projectGeometry(p3, allLevels(p3), i.level1).voids).toHaveLength(1);
  });

  it("returns no solids for a wall whose references are missing (invalid input is inert, not a crash)", () => {
    const p = freshProject();
    const orphan: Wall = {
      id: "orphan",
      levelId: "missing",
      wallTypeId: p.wallTypes[0].id,
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      height: 3000,
    };
    expect(wallGeometry({ ...p, walls: [orphan] }, orphan).solids).toEqual([]);
  });

  it("clips solids at the plan cut plane: nothing above it, and nothing is lost below it", () => {
    expect(clipSolid({ z0: 1200, z1: 3000 }, 1200)).toBeNull();
    expect(clipSolid({ z0: 0, z1: 900 }, 1200)).toEqual({ z0: 0, z1: 900 });
    expect(clipSolid({ z0: 900, z1: 2100 }, 1200)).toEqual({ z0: 900, z1: 1200 });
  });
});
