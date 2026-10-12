import { pointsEqual } from "./geometry";
import type { Point, Project } from "./types";

export type WallEndName = "start" | "end";

/** Two wall ends that meet at the same point on the same level. Derived from the model, never stored. */
export interface WallJoin {
  levelId: string;
  point: Point;
  a: { wallId: string; end: WallEndName };
  b: { wallId: string; end: WallEndName };
}

interface WallEndRef {
  wallId: string;
  levelId: string;
  end: WallEndName;
  point: Point;
}

export function findWallJoins(p: Project): WallJoin[] {
  const ends: WallEndRef[] = [];
  for (const wall of p.walls) {
    ends.push({ wallId: wall.id, levelId: wall.levelId, end: "start", point: wall.start });
    ends.push({ wallId: wall.id, levelId: wall.levelId, end: "end", point: wall.end });
  }
  const joins: WallJoin[] = [];
  for (let i = 0; i < ends.length; i += 1) {
    for (let j = i + 1; j < ends.length; j += 1) {
      const a = ends[i];
      const b = ends[j];
      if (a.wallId === b.wallId || a.levelId !== b.levelId) continue;
      if (!pointsEqual(a.point, b.point)) continue;
      joins.push({
        levelId: a.levelId,
        point: { x: a.point.x, y: a.point.y },
        a: { wallId: a.wallId, end: a.end },
        b: { wallId: b.wallId, end: b.end },
      });
    }
  }
  return joins;
}

/** Which ends of each wall are joined to another wall. */
export function joinedEnds(p: Project): Map<string, { start: boolean; end: boolean }> {
  const result = new Map<string, { start: boolean; end: boolean }>();
  for (const wall of p.walls) result.set(wall.id, { start: false, end: false });
  for (const join of findWallJoins(p)) {
    result.get(join.a.wallId)![join.a.end] = true;
    result.get(join.b.wallId)![join.b.end] = true;
  }
  return result;
}
