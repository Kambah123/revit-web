import type { Point } from "./types";

/** Shortest wall that the model accepts, in millimetres. */
export const MIN_WALL_LENGTH_MM = 50;

export function distanceMm(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Rounds a value to the nearest multiple of `step` (integer millimetres).
 * A step of 0 or less only rounds to whole millimetres.
 */
export function snapValue(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  return Math.round(value / step) * step;
}

export function snapPoint(p: Point, step: number): Point {
  return { x: snapValue(p.x, step), y: snapValue(p.y, step) };
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Projects a point onto the segment a-b. Returns the distance along the segment from `a`
 * (clamped to the segment) and the perpendicular distance from `p` to the segment.
 */
export function projectOntoSegment(p: Point, a: Point, b: Point): { along: number; distance: number } {
  const length = distanceMm(a, b);
  if (length === 0) return { along: 0, distance: distanceMm(p, a) };
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const t = Math.min(length, Math.max(0, (p.x - a.x) * ux + (p.y - a.y) * uy));
  const cx = a.x + ux * t;
  const cy = a.y + uy * t;
  return { along: t, distance: Math.hypot(p.x - cx, p.y - cy) };
}
