import { describe, expect, it } from "vitest";
import {
  ceilingSlabs,
  columnSolids,
  floorSlabs,
  roomFaces,
  roofSolids,
} from "../geometry/elementGeometry";
import { rectangleError } from "../geometry/polygon";
import { addCeiling, addColumn, addFloor, addRoof, addRoom, addWall } from "../model/commands";
import { freshProject, ids } from "./helpers";

const rect = [
  { x: 0, y: 0 },
  { x: 8000, y: 0 },
  { x: 8000, y: 5000 },
  { x: 0, y: 5000 },
];

const all = (p: import("../model/types").Project) => new Set(p.levels.map((l) => l.id));

describe("element geometry", () => {
  it("places floor slabs under the level and ceilings above it", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let p = addFloor(p0, i.level1, p0.floorTypes[0].id, rect).project;
    p = addCeiling(p, i.level1, p0.ceilingTypes[0].id, rect, { height: 2700 }).project;
    const slabs = floorSlabs(p, all(p));
    expect(slabs).toHaveLength(1);
    expect(slabs[0].z1).toBe(0);
    expect(slabs[0].z0).toBe(-200); // 200 mm thick slab below level 1
    const ceilings = ceilingSlabs(p, all(p));
    expect(ceilings).toHaveLength(1);
    expect(ceilings[0].z1).toBe(2700);
    expect(ceilings[0].z0).toBe(2700 - 50);
  });

  it("derives column solids from types", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p, column } = addColumn(p0, i.level2, p0.columnTypes[0].id, { x: 1000, y: 2000 }, { height: 3500 });
    const solids = columnSolids(p, all(p));
    expect(solids).toHaveLength(1);
    expect(solids[0].z0).toBe(3000);
    expect(solids[0].z1).toBe(6500);
    expect(solids[0].width).toBe(300);
    expect(solids[0].materialId).toBe(p0.columnTypes[0].materialId);
    // Only visible levels are included.
    expect(columnSolids(p, new Set([i.level1]))).toHaveLength(0);
    expect(column.id).toBeTruthy();
  });

  it("derives room faces with area and label point", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p } = addRoom(p0, i.level1, "Living", "101", rect);
    const faces = roomFaces(p, all(p));
    expect(faces).toHaveLength(1);
    expect(faces[0].areaMm2).toBe(40_000_000);
    expect(faces[0].labelPoint).toEqual({ x: 4000, y: 2500 });
    expect(faces[0].z).toBe(0);
  });

  it("builds a hip roof with overhang and a ridge along the longer axis", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p } = addRoof(p0, i.level2, p0.roofTypes[0].id, rect, { overhang: 500, rise: 2000 });
    const solids = roofSolids(p, all(p));
    expect(solids).toHaveLength(1);
    const roof = solids[0];
    // Footprint expands by the overhang on every side.
    expect({ minX: roof.minX, minY: roof.minY, maxX: roof.maxX, maxY: roof.maxY }).toEqual({
      minX: -500,
      minY: -500,
      maxX: 8500,
      maxY: 5500,
    });
    expect(roof.z0).toBe(3000);
    expect(roof.z1).toBe(5000);
    // Width 9000 > depth 6000, so the ridge runs along X at mid Y, inset by half the depth.
    expect(roof.ridgeA).toEqual({ x: -500 + 3000, y: 2500 });
    expect(roof.ridgeB).toEqual({ x: 8500 - 3000, y: 2500 });
  });

  it("runs the ridge along Y when the footprint is taller than it is wide", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const tall = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 10000 },
      { x: 0, y: 10000 },
    ];
    const { project: p } = addRoof(p0, i.level1, p0.roofTypes[0].id, tall, { overhang: 0, rise: 1500 });
    const roof = roofSolids(p, all(p))[0];
    expect(roof.ridgeA).toEqual({ x: 2000, y: 2000 });
    expect(roof.ridgeB).toEqual({ x: 2000, y: 8000 });
  });

  it("checks roof footprints are axis-aligned rectangles", () => {
    expect(rectangleError(rect)).toBeNull();
    expect(
      rectangleError([
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 4000 },
      ]),
    ).toMatch(/four points/);
    expect(
      rectangleError([
        { x: 0, y: 0 },
        { x: 5000, y: 1000 },
        { x: 4000, y: 5000 },
        { x: 500, y: 3000 },
      ]),
    ).toMatch(/axis-aligned/);
  });

  it("wall solids and element solids share the same visible-level rule", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let p = addWall(p0, i.level2, { x: 0, y: 0 }, { x: 5000, y: 0 }).project;
    p = addFloor(p, i.level1, p0.floorTypes[0].id, rect).project;
    const onlyLevel1 = new Set([i.level1]);
    expect(floorSlabs(p, onlyLevel1)).toHaveLength(1);
    expect(roofSolids(p, onlyLevel1)).toHaveLength(0);
    expect(ceilingSlabs(p, onlyLevel1)).toHaveLength(0);
  });
});
