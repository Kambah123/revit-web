import { describe, expect, it } from "vitest";
import {
  boundaryError,
  isSelfIntersecting,
  pointInPolygon,
  polygonAbsAreaMm2,
  polygonArea2,
  polygonAreaMm2,
  polygonBounds,
  polygonCentroid,
  polygonPerimeterMm,
  segmentsIntersect,
} from "../geometry/polygon";

const square = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];

const bowtie = [
  { x: 0, y: 0 },
  { x: 4000, y: 4000 },
  { x: 4000, y: 0 },
  { x: 0, y: 4000 },
];

describe("polygon", () => {
  it("computes twice the signed area exactly (counter-clockwise positive)", () => {
    expect(polygonArea2(square)).toBe(2 * 12_000_000);
    expect(polygonArea2([...square].reverse())).toBe(-2 * 12_000_000);
    expect(polygonAreaMm2(square)).toBe(12_000_000);
    expect(polygonAbsAreaMm2([...square].reverse())).toBe(12_000_000);
  });

  it("computes area of a triangle", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
    ];
    expect(polygonAreaMm2(tri)).toBe(500_000);
  });

  it("computes perimeter", () => {
    expect(polygonPerimeterMm(square)).toBe(14_000);
  });

  it("computes the centroid", () => {
    expect(polygonCentroid(square)).toEqual({ x: 2000, y: 1500 });
  });

  it("computes bounds", () => {
    expect(polygonBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 4000, maxY: 3000 });
  });

  it("tests points inside and outside", () => {
    expect(pointInPolygon({ x: 100, y: 100 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5000, y: 100 }, square)).toBe(false);
  });

  it("detects intersecting segments", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
    // Touching endpoints count as intersecting (used for non-adjacent edge checks).
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe(true);
  });

  it("detects self-intersecting boundaries and accepts simple ones", () => {
    expect(isSelfIntersecting(square)).toBe(false);
    expect(isSelfIntersecting(bowtie)).toBe(true);
  });

  it("validates boundary polygons with readable messages", () => {
    expect(boundaryError(square)).toBeNull();
    expect(boundaryError([1, 2, 3])).toMatch(/list of points/);
    expect(boundaryError([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toMatch(/at least three/);
    expect(boundaryError([{ x: 0, y: 0 }, { x: 1.5, y: 1 }, { x: 2, y: 2 }])).toMatch(/whole millimetres/);
    expect(
      boundaryError([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toMatch(/twice in a row/);
    expect(
      boundaryError([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ]),
    ).toMatch(/zero area/);
    expect(boundaryError(bowtie)).toMatch(/cross itself/);
  });
});
