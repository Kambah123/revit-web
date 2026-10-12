import { describe, expect, it } from "vitest";
import {
  buildElevation,
  convexHull2,
  elevationTitle,
  elevationU,
  type ElevRect,
} from "../geometry/elevation";
import {
  addColumn,
  addColumnType,
  addOpening,
  addRoof,
  addRoofType,
  addWall,
} from "../model/commands";
import { freshProject, ids } from "./helpers";

const rect12 = [
  { x: 0, y: 0 },
  { x: 12000, y: 0 },
  { x: 12000, y: 8000 },
  { x: 0, y: 8000 },
];

describe("elevation projections", () => {
  it("maps plan points onto the viewer's right axis", () => {
    expect(elevationU("north", 500, -300)).toBe(-500);
    expect(elevationU("south", 500, -300)).toBe(500);
    expect(elevationU("east", 500, -300)).toBe(-300);
    expect(elevationU("west", 500, -300)).toBe(300);
    expect(elevationTitle("north")).toBe("North Elevation");
    expect(elevationTitle("east")).toBe("East Elevation");
  });

  it("builds convex hulls in the (u, z) plane", () => {
    const hull = convexHull2([
      { u: 0, z: 0 },
      { u: 4, z: 0 },
      { u: 4, z: 4 },
      { u: 0, z: 4 },
      { u: 2, z: 2 },
    ]);
    expect(hull).toHaveLength(4);
    expect(convexHull2([
      { u: -1, z: 0 },
      { u: 1, z: 0 },
      { u: 0, z: 2 },
    ])).toHaveLength(3);
    // Colinear points collapse to the extremes.
    expect(convexHull2([
      { u: 0, z: 0 },
      { u: 5, z: 0 },
      { u: 9, z: 0 },
    ])).toHaveLength(2);
  });

  it("projects a wall and its openings as rectangles", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 10000, y: 0 }, { height: 3000 });
    const doorType = p1.openingTypes.find((t) => t.id === i.door)!;
    const windowType = p1.openingTypes.find((t) => t.id === i.window)!;
    const { project: p2 } = addOpening(p1, wall.id, i.door, 3000);
    const { project: p3 } = addOpening(p2, wall.id, i.window, 7000);

    const north = buildElevation(p3, "north");
    const wallRect = north.shapes.find((s) => s.kind === "wall") as ElevRect;
    // Seen from the north the viewer's right axis is -x: the wall spans x 0..10000 -> u -10000..0.
    expect(wallRect).toMatchObject({ u0: -10000, u1: 0, z0: 0, z1: 3000 });

    const door = north.shapes.find((s) => s.kind === "door") as ElevRect;
    expect(door.z0).toBe(0);
    expect(door.z1).toBe(doorType.height);
    expect(door.u0).toBe(-3000 - doorType.width / 2);
    expect(door.u1).toBe(-3000 + doorType.width / 2);

    const win = north.shapes.find((s) => s.kind === "window") as ElevRect;
    expect(win.z0).toBe(windowType.sillHeight);
    expect(win.z1).toBe(windowType.sillHeight + windowType.height);
  });

  it("derives hip-roof silhouettes: trapezoid from the sides, triangle from the ends", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, roofType } = addRoofType(p0, "Roof - 200 mm", 200);
    const { project: p2 } = addRoof(p1, i.level2, roofType.id, rect12, { overhang: 600, rise: 2000 });

    const north = buildElevation(p2, "north");
    const roof = north.shapes.find((s) => s.kind === "roof");
    expect(roof?.kind).toBe("roof");
    if (roof?.kind !== "roof") throw new Error("no roof shape");
    // Ridge runs along X (13200 x 9200 expanded footprint): from the north the top is flat
    // between the ridge ends.
    expect(roof.hull).toHaveLength(4);
    const top = roof.hull.filter((pt) => pt.z === 5000).map((pt) => pt.u).sort((a, b) => a - b);
    expect(top).toEqual([-8000, -4000]);
    const base = roof.hull.filter((pt) => pt.z === 3000).map((pt) => pt.u).sort((a, b) => a - b);
    expect(base).toEqual([-12600, 600]);

    const east = buildElevation(p2, "east");
    const hip = east.shapes.find((s) => s.kind === "roof");
    if (hip?.kind !== "roof") throw new Error("no roof shape");
    // Looking along the ridge: a triangle with the apex over the mid plane.
    expect(hip.hull).toHaveLength(3);
    const apex = hip.hull.find((pt) => pt.z === 5000);
    expect(apex?.u).toBe(4000);
    expect(hip.hull.filter((pt) => pt.z === 3000).map((pt) => pt.u).sort((a, b) => a - b)).toEqual([-600, 8600]);
  });

  it("projects columns by width or depth per direction and lists level datums", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, columnType } = addColumnType(p0, "C", 400, 300);
    const { project: p2 } = addColumn(p1, i.level1, columnType.id, { x: 3000, y: 2000 }, { height: 3000 });

    const north = buildElevation(p2, "north");
    const col = north.shapes.find((s) => s.kind === "column") as ElevRect;
    expect(col).toMatchObject({ u0: -3200, u1: -2800, z0: 0, z1: 3000 });

    const east = buildElevation(p2, "east");
    const colE = east.shapes.find((s) => s.kind === "column") as ElevRect;
    expect(colE).toMatchObject({ u0: 1850, u1: 2150 });

    expect(north.levels.map((l) => l.z)).toEqual([0, 3000]);
    expect(north.levels.map((l) => l.name)).toEqual(["Level 1", "Level 2"]);
    expect(north.minU).toBeLessThan(-3200);
    expect(north.maxU).toBeGreaterThan(-2800);
    expect(north.minZ).toBeLessThan(0);
    expect(north.maxZ).toBeGreaterThan(3000);
  });
});
