import { distanceMm, projectOntoSegment } from "./geometry";
import { wallTypeById } from "./project";
import type { Point, Project, Wall } from "./types";

export interface NearestWall {
  wall: Wall;
  /** Offset from the wall start to the closest point, in integer millimetres, clamped to the wall. */
  offset: number;
  distance: number;
}

/** The wall on `levelId` whose centreline is closest to `point`, if it is within `maxDistance` mm. */
export function nearestWallOnLevel(
  p: Project,
  levelId: string,
  point: Point,
  maxDistance: number,
): NearestWall | null {
  let best: NearestWall | null = null;
  for (const wall of p.walls) {
    if (wall.levelId !== levelId) continue;
    const { along, distance } = projectOntoSegment(point, wall.start, wall.end);
    if (distance > maxDistance) continue;
    if (best === null || distance < best.distance) {
      best = { wall, offset: Math.round(along), distance };
    }
  }
  return best;
}

/** An existing wall endpoint on `levelId` within `radius` mm of `point`, used to snap joins. */
export function nearestWallEndpoint(p: Project, levelId: string, point: Point, radius: number): Point | null {
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (const wall of p.walls) {
    if (wall.levelId !== levelId) continue;
    for (const end of [wall.start, wall.end]) {
      const d = distanceMm(point, end);
      if (d <= radius && d < bestDistance) {
        best = { x: end.x, y: end.y };
        bestDistance = d;
      }
    }
  }
  return best;
}

/** Thickness of a wall, from its type. Returns 0 if the type is missing (validation prevents this). */
export function wallThickness(p: Project, wall: Wall): number {
  return wallTypeById(p, wall.wallTypeId)?.thickness ?? 0;
}
