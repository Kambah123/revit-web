import type { Vec2, Wall } from "./types";

export const MIN_WALL_LENGTH = 0.05;

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Rounds a coordinate to the nearest step (e.g. 0.1 m). A step of 0 disables snapping. */
export function snap(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapPoint(p: Vec2, step: number): Vec2 {
  return { x: snap(p.x, step), y: snap(p.y, step) };
}

export interface WallPlacement {
  /** Midpoint of the centerline in plan. */
  center: Vec2;
  length: number;
  /** Rotation around the vertical axis, in radians, for a Three.js-style Y-up scene (plan y maps to world z). */
  angle: number;
  /** Elevation of the wall base (level elevation). */
  baseElevation: number;
}

/**
 * Computes the placement of a wall for a Y-up renderer where plan (x, y) maps to world (x, z).
 * The returned angle rotates a box whose local X axis is the wall direction.
 */
export function wallPlacement(wall: Wall, levelElevation: number): WallPlacement {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return {
    center: { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 },
    length: Math.hypot(dx, dy),
    angle: Math.atan2(-dy, dx),
    baseElevation: levelElevation,
  };
}
