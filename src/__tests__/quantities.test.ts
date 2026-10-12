import { describe, expect, it } from "vitest";
import {
  columnVolumeMm3,
  floorAreaM2,
  floorAreaMm2,
  floorPerimeterMm,
  floorVolumeMm3,
  openingAreaMm2,
  projectQuantities,
  roomAreaM2,
  roomAreaMm2,
  wallGrossAreaMm2,
  wallLengthMm,
  wallNetAreaMm2,
  wallNetVolumeMm3,
} from "../model/quantities";
import { addColumn, addFloor, addOpening, addRoom, addWall } from "../model/commands";
import { freshProject, ids } from "./helpers";

const boundary = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 4000 },
  { x: 0, y: 4000 },
];

describe("quantities", () => {
  it("computes room areas from the boundary, in mm² and m²", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { room } = addRoom(p0, i.level1, "Living", "101", boundary);
    expect(roomAreaMm2(room)).toBe(20_000_000);
    expect(roomAreaM2(room)).toBe(20);
  });

  it("rounds square metres to two decimals", () => {
    const p0 = freshProject();
    const i = ids(p0);
    // 2.25 m² triangle: 3000 x 1500 / 2.
    const { room } = addRoom(p0, i.level1, "Closet", "102", [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 0, y: 1500 },
    ]);
    expect(roomAreaMm2(room)).toBe(2_250_000);
    expect(roomAreaM2(room)).toBe(2.25);
  });

  it("computes floor area, perimeter and volume from its type thickness", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { floor } = addFloor(p0, i.level1, p0.floorTypes[0].id, boundary);
    expect(floorAreaMm2(floor)).toBe(20_000_000);
    expect(floorAreaM2(floor)).toBe(20);
    expect(floorPerimeterMm(floor)).toBe(18_000);
    // 20 m² × 200 mm = 4 m³ = 4e9 mm³.
    expect(floorVolumeMm3(floor, p0)).toBe(4_000_000_000);
  });

  it("computes wall net area and volume after openings", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 6000, y: 0 }, { wallTypeId: i.thickWall, height: 3000 });
    expect(wallLengthMm(wall)).toBe(6000);
    expect(wallGrossAreaMm2(wall)).toBe(18_000_000);
    const doorType = p1.openingTypes.find((t) => t.kind === "door")!;
    const { project: p2, opening } = addOpening(p1, wall.id, doorType.id, 1500);
    expect(openingAreaMm2(opening, p2)).toBe(900 * 2100);
    expect(wallNetAreaMm2(wall, p2)).toBe(18_000_000 - 1_890_000);
    // Thickness 200 mm: gross volume minus opening void.
    expect(wallNetVolumeMm3(wall, p2)).toBe(6000 * 3000 * 200 - 900 * 2100 * 200);
  });

  it("computes column volume from the type section", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { column } = addColumn(p0, i.level1, p0.columnTypes[0].id, { x: 0, y: 0 }, { height: 3000 });
    expect(columnVolumeMm3(column, p0)).toBe(300 * 300 * 3000);
  });

  it("summarises project quantities from real model data", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let p = addRoom(p0, i.level1, "Living", "101", boundary).project;
    p = addFloor(p, i.level1, p0.floorTypes[0].id, boundary).project;
    const wallResult = addWall(p, i.level1, { x: 0, y: 0 }, { x: 6000, y: 0 }, { wallTypeId: i.thickWall });
    p = wallResult.project;
    const doorType = p.openingTypes.find((t) => t.kind === "door")!;
    const windowType = p.openingTypes.find((t) => t.kind === "window")!;
    p = addOpening(p, wallResult.wall.id, doorType.id, 1500).project;
    p = addOpening(p, wallResult.wall.id, windowType.id, 4500).project;
    p = addColumn(p, i.level1, p0.columnTypes[0].id, { x: 2500, y: 2000 }, { height: 3000 }).project;

    const q = projectQuantities(p);
    expect(q.roomCount).toBe(1);
    expect(q.roomAreaM2).toBe(20);
    expect(q.wallLengthM).toBe(6);
    expect(q.floorAreaM2).toBe(20);
    expect(q.floorVolumeM3).toBe(4);
    expect(q.columnCount).toBe(1);
    expect(q.columnVolumeM3).toBe(0.27);
    expect(q.openingCount).toBe(2);
    expect(q.doorCount).toBe(1);
    expect(q.windowCount).toBe(1);
  });
});
