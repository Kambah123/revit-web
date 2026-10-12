import type { Project } from "../model/types";
import {
  ceilingSlabs,
  columnSolids,
  floorSlabs,
  roofSolids,
  type RoofSolid,
} from "./elementGeometry";
import { wallGeometry } from "./wallSolids";

/**
 * Elevation projections derived from the canonical model — nothing here is stored (DECISIONS D13).
 *
 * Naming follows the architectural convention: the "North" elevation is seen from the north
 * (camera looking south at the north facade). The horizontal axis `u` always increases to the
 * viewer's right, so north u=-x, south u=+x, east u=+y, west u=-y. Vertical is absolute
 * elevation in millimetres, same as the model's world Z.
 */

export type ElevationDirection = "north" | "south" | "east" | "west";

export const ELEVATION_DIRECTIONS: readonly ElevationDirection[] = ["north", "south", "east", "west"];

export function elevationTitle(d: ElevationDirection): string {
  return `${d[0].toUpperCase()}${d.slice(1)} Elevation`;
}

/** Horizontal projection of a plan point onto the viewer's right axis, mm. Never -0. */
export function elevationU(d: ElevationDirection, x: number, y: number): number {
  switch (d) {
    case "north":
      return x === 0 ? 0 : -x;
    case "south":
      return x;
    case "east":
      return y;
    case "west":
      return y === 0 ? 0 : -y;
  }
}

/** A rectangle in the elevation plane: u is the horizontal axis, z absolute elevation, mm. */
export interface ElevRect {
  kind: "wall" | "door" | "window" | "floor" | "ceiling" | "column";
  u0: number;
  u1: number;
  z0: number;
  z1: number;
}

/** A roof silhouette: the convex hull of the projected hip-roof vertices. */
export interface ElevRoof {
  kind: "roof";
  /** Hull vertices in CCW order in the (u, z) plane. */
  hull: { u: number; z: number }[];
}

export interface ElevLevel {
  levelId: string;
  name: string;
  z: number;
}

export type ElevationShape = ElevRect | ElevRoof;

export interface ElevationDrawing {
  direction: ElevationDirection;
  shapes: ElevationShape[];
  levels: ElevLevel[];
  /** Drawing extents in mm, already margined. */
  minU: number;
  maxU: number;
  minZ: number;
  maxZ: number;
}

/** u-extent of a plan segment (an oriented wall/void box) with half-thickness lateral offset. */
function segmentUExtent(
  d: ElevationDirection,
  centre: { x: number; y: number },
  axis: { x: number; y: number },
  length: number,
  halfThickness: number,
): [number, number] {
  const hx = (axis.x * length) / 2;
  const hy = (axis.y * length) / 2;
  const px = -axis.y * halfThickness;
  const py = axis.x * halfThickness;
  const us = [
    elevationU(d, centre.x - hx + px, centre.y - hy + py),
    elevationU(d, centre.x - hx - px, centre.y - hy - py),
    elevationU(d, centre.x + hx + px, centre.y + hy + py),
    elevationU(d, centre.x + hx - px, centre.y + hy - py),
  ];
  return [Math.min(...us), Math.max(...us)];
}

function polygonUExtent(
  d: ElevationDirection,
  points: readonly { x: number; y: number }[],
): [number, number] {
  const us = points.map((p) => elevationU(d, p.x, p.y));
  return [Math.min(...us), Math.max(...us)];
}

/** Convex hull (monotone chain) of points in the (u, z) plane; CCW, no duplicate end point. */
export function convexHull2(points: { u: number; z: number }[]): { u: number; z: number }[] {
  const pts = [...points].sort((a, b) => a.u - b.u || a.z - b.z);
  const cross = (o: { u: number; z: number }, a: { u: number; z: number }, b: { u: number; z: number }) =>
    (a.u - o.u) * (b.z - o.z) - (a.z - o.z) * (b.u - o.u);
  const lower: { u: number; z: number }[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { u: number; z: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Roof silhouette: convex hull of the eaves rectangle (at z0) and the ridge (at z1). */
function roofHull(d: ElevationDirection, r: RoofSolid): { u: number; z: number }[] {
  const pts = [
    { u: elevationU(d, r.minX, r.minY), z: r.z0 },
    { u: elevationU(d, r.maxX, r.minY), z: r.z0 },
    { u: elevationU(d, r.maxX, r.maxY), z: r.z0 },
    { u: elevationU(d, r.minX, r.maxY), z: r.z0 },
    { u: elevationU(d, r.ridgeA.x, r.ridgeA.y), z: r.z1 },
    { u: elevationU(d, r.ridgeB.x, r.ridgeB.y), z: r.z1 },
  ];
  return convexHull2(pts);
}

/**
 * Builds the full drawing for one elevation: wall faces, opening rectangles, slabs, columns,
 * roof silhouettes and level datums. All levels are shown, matching the 3D view (D11).
 */
export function buildElevation(p: Project, direction: ElevationDirection): ElevationDrawing {
  const all = new Set(p.levels.map((l) => l.id));
  const shapes: ElevationShape[] = [];

  for (const wall of p.walls) {
    const geom = wallGeometry(p, wall);
    // Walls are split around openings; the elevation shows one face per wall, so union the pieces.
    const pieces = geom.solids.filter((s) => s.role === "wall");
    if (pieces.length > 0) {
      let u0 = Infinity;
      let u1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const s of pieces) {
        const [a, b] = segmentUExtent(direction, s.centre, s.axis, s.length, s.thickness / 2);
        u0 = Math.min(u0, a);
        u1 = Math.max(u1, b);
        z0 = Math.min(z0, s.z0);
        z1 = Math.max(z1, s.z1);
      }
      shapes.push({ kind: "wall", u0, u1, z0, z1 });
    }
    for (const v of geom.voids) {
      const opening = p.openings.find((o) => o.id === v.openingId);
      const otype = opening ? p.openingTypes.find((t) => t.id === opening.openingTypeId) : undefined;
      const kind: ElevRect["kind"] = otype?.kind === "window" ? "window" : "door";
      const [u0, u1] = segmentUExtent(direction, v.centre, v.axis, v.length, v.thickness / 2);
      shapes.push({ kind, u0, u1, z0: v.z0, z1: v.z1 });
    }
  }

  for (const slab of floorSlabs(p, all)) {
    const [u0, u1] = polygonUExtent(direction, slab.boundary);
    shapes.push({ kind: "floor", u0, u1, z0: slab.z0, z1: slab.z1 });
  }

  for (const slab of ceilingSlabs(p, all)) {
    const [u0, u1] = polygonUExtent(direction, slab.boundary);
    shapes.push({ kind: "ceiling", u0, u1, z0: slab.z0, z1: slab.z1 });
  }

  for (const c of columnSolids(p, all)) {
    const half = (direction === "north" || direction === "south" ? c.width : c.depth) / 2;
    const u = elevationU(direction, c.centre.x, c.centre.y);
    shapes.push({ kind: "column", u0: u - half, u1: u + half, z0: c.z0, z1: c.z1 });
  }

  for (const r of roofSolids(p, all)) {
    shapes.push({ kind: "roof", hull: roofHull(direction, r) });
  }

  const levels: ElevLevel[] = p.levels
    .map((l) => ({ levelId: l.id, name: l.name, z: l.elevation }))
    .sort((a, b) => a.z - b.z);

  // Extents from shapes and level datums, then a margin.
  let minU = Infinity;
  let maxU = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const eat = (u: number, z: number) => {
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const s of shapes) {
    if (s.kind === "roof") {
      for (const pt of s.hull) eat(pt.u, pt.z);
    } else {
      eat(s.u0, s.z0);
      eat(s.u1, s.z1);
    }
  }
  for (const l of levels) {
    eat(minU === Infinity ? 0 : minU, l.z);
    eat(maxU === -Infinity ? 12000 : maxU, l.z);
  }
  if (!Number.isFinite(minU)) {
    minU = 0;
    maxU = 12000;
    minZ = 0;
    maxZ = 6000;
  }
  const marginU = Math.max(1500, (maxU - minU) * 0.06);
  const marginZ = Math.max(1200, (maxZ - minZ) * 0.08);
  return {
    direction,
    shapes,
    levels,
    minU: Math.round(minU - marginU),
    maxU: Math.round(maxU + marginU),
    minZ: Math.round(minZ - marginZ),
    maxZ: Math.round(maxZ + marginZ),
  };
}
