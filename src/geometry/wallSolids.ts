import { distanceMm } from "../model/geometry";
import { joinedEnds } from "../model/joins";
import { openingTypeById, wallTypeById, levelById } from "../model/project";
import type { Opening, Point, Project, Wall } from "../model/types";

/**
 * Derived geometry, in millimetres, computed from the canonical model. Nothing here is stored.
 * Each solid is an oriented box: `centre` on the plan, `axis` (unit) along the wall, `length`
 * along the axis, `thickness` across it, and an absolute elevation range z0..z1.
 */
export type SolidRole = "wall" | "door-leaf" | "window-glass";

export interface Solid {
  role: SolidRole;
  wallId: string;
  openingId?: string;
  centre: Point;
  axis: { x: number; y: number };
  length: number;
  thickness: number;
  z0: number;
  z1: number;
}

/** A void cut in a wall by a door or window. Used for picking in the viewer. */
export interface OpeningVoid {
  openingId: string;
  wallId: string;
  centre: Point;
  axis: { x: number; y: number };
  length: number;
  thickness: number;
  z0: number;
  z1: number;
}

export interface WallGeometry {
  solids: Solid[];
  voids: OpeningVoid[];
}

/** Door leaves are drawn at this thickness, centred in the wall. */
export const DOOR_LEAF_THICKNESS_MM = 40;
/** Window glass is drawn at this thickness, centred in the wall. */
export const WINDOW_GLASS_THICKNESS_MM = 6;

/** Height of the plan cut plane above a level, in millimetres. Walls are shown cut here in plan. */
export const PLAN_CUT_HEIGHT_MM = 1200;

/**
 * Clips a solid to elevations at or below `cutZ`. Returns null if nothing remains below the cut.
 * Used by the plan view, so openings show as gaps below the cut plane.
 */
export function clipSolid<T extends { z0: number; z1: number }>(s: T, cutZ: number): T | null {
  if (s.z0 >= cutZ) return null;
  return s.z1 <= cutZ ? s : { ...s, z1: cutZ };
}

export function solidVolume(s: { length: number; thickness: number; z0: number; z1: number }): number {
  return s.length * s.thickness * (s.z1 - s.z0);
}

/**
 * Builds the solids of one wall. The wall is split along its length around each opening: full-height
 * pieces between openings, a piece below each window's sill, and a piece above each opening's head.
 * Wall ends that are joined to another wall are extended by half the wall's thickness, so corners
 * close without gaps.
 */
export function wallGeometry(p: Project, wall: Wall): WallGeometry {
  const level = levelById(p, wall.levelId);
  const type = wallTypeById(p, wall.wallTypeId);
  if (!level || !type) return { solids: [], voids: [] };

  const length = distanceMm(wall.start, wall.end);
  const axis = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length };
  const t = type.thickness;
  const H = wall.height;
  const base = level.elevation;
  const joins = joinedEnds(p).get(wall.id) ?? { start: false, end: false };
  const extendStart = joins.start ? t / 2 : 0;
  const extendEnd = joins.end ? t / 2 : 0;

  const at = (s: number): Point => ({ x: wall.start.x + axis.x * s, y: wall.start.y + axis.y * s });
  const solids: Solid[] = [];
  const voids: OpeningVoid[] = [];

  const push = (role: SolidRole, s0: number, s1: number, z0: number, z1: number, opening?: Opening) => {
    if (s1 - s0 <= 0 || z1 - z0 <= 0) return;
    const mid = at((s0 + s1) / 2);
    solids.push({
      role,
      wallId: wall.id,
      openingId: opening?.id,
      centre: mid,
      axis: { ...axis },
      length: s1 - s0,
      thickness: t,
      z0,
      z1,
    });
  };

  const openings = p.openings
    .filter((o) => o.hostWallId === wall.id)
    .map((o) => ({ opening: o, type: openingTypeById(p, o.openingTypeId) }))
    .filter((x): x is { opening: Opening; type: NonNullable<typeof x.type> } => x.type !== undefined)
    .sort((a, b) => a.opening.offset - b.opening.offset);

  // Full-height wall pieces between openings, including joined ends.
  let cursor = -extendStart;
  for (const { opening, type: ot } of openings) {
    const s0 = opening.offset - ot.width / 2;
    const s1 = opening.offset + ot.width / 2;
    if (s0 > cursor) push("wall", cursor, s0, base, base + H);
    cursor = Math.max(cursor, s1);
  }
  if (length + extendEnd > cursor) push("wall", cursor, length + extendEnd, base, base + H);

  // Wall above and below each opening, and the door leaf or window glass that fills it.
  for (const { opening, type: ot } of openings) {
    const s0 = opening.offset - ot.width / 2;
    const s1 = opening.offset + ot.width / 2;
    const sill = ot.sillHeight;
    const head = sill + ot.height;
    if (sill > 0) push("wall", s0, s1, base, base + sill, opening);
    if (head < H) push("wall", s0, s1, base + head, base + H, opening);
    if (ot.kind === "door") {
      push("door-leaf", s0, s1, base + sill, base + head, opening);
    } else {
      push("window-glass", s0, s1, base + sill, base + head, opening);
    }
    voids.push({
      openingId: opening.id,
      wallId: wall.id,
      centre: at(opening.offset),
      axis: { ...axis },
      length: ot.width,
      thickness: t,
      z0: base + sill,
      z1: base + head,
    });
  }

  return { solids: solids.map(thinFill(t)), voids };
}

/** Door leaves and window glass are thinner than the wall, centred across its thickness. */
function thinFill(wallThickness: number): (s: Solid) => Solid {
  return (s) => {
    if (s.role === "wall") return s;
    const thickness = s.role === "door-leaf" ? DOOR_LEAF_THICKNESS_MM : WINDOW_GLASS_THICKNESS_MM;
    return { ...s, thickness: Math.min(thickness, wallThickness) };
  };
}

/**
 * Geometry for every wall whose level is in `visibleLevelIds`. Openings are only picked for walls on
 * `pickLevelId`, the active level, so selection stays on the level being edited.
 */
export function projectGeometry(
  p: Project,
  visibleLevelIds: ReadonlySet<string>,
  pickLevelId: string | null,
): WallGeometry {
  const solids: Solid[] = [];
  const voids: OpeningVoid[] = [];
  for (const wall of p.walls) {
    if (!visibleLevelIds.has(wall.levelId)) continue;
    const g = wallGeometry(p, wall);
    solids.push(...g.solids);
    if (wall.levelId === pickLevelId) voids.push(...g.voids);
  }
  return { solids, voids };
}
