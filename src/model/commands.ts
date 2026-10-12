import { distanceMm, MIN_WALL_LENGTH_MM } from "./geometry";
import { newId } from "./ids";
import { firstError } from "./validation";
import { levelById, openingById, openingTypeById, wallById, wallTypeById } from "./project";
import type { Level, Opening, Point, Project, Wall, WallType } from "./types";

/**
 * Every model edit goes through a command. A command returns a new project that has passed
 * validation; if the edit would break an invariant it throws and the input is left untouched.
 */
function commit(next: Project): Project {
  const message = firstError(next);
  if (message !== null) throw new Error(message);
  return next;
}

export function addLevel(p: Project, name: string, elevation: number): { project: Project; level: Level } {
  const level: Level = { id: newId("lvl"), name: name.trim(), elevation };
  const levels = [...p.levels, level].sort((a, b) => a.elevation - b.elevation);
  return { project: commit({ ...p, levels }), level };
}

export function renameLevel(p: Project, levelId: string, name: string): Project {
  requireLevel(p, levelId);
  return commit({
    ...p,
    levels: p.levels.map((l) => (l.id === levelId ? { ...l, name: name.trim() } : l)),
  });
}

export function setLevelElevation(p: Project, levelId: string, elevation: number): Project {
  requireLevel(p, levelId);
  const levels = p.levels
    .map((l) => (l.id === levelId ? { ...l, elevation } : l))
    .sort((a, b) => a.elevation - b.elevation);
  return commit({ ...p, levels });
}

/** Deletes a level and cascades to its walls and their hosted openings. */
export function deleteLevel(p: Project, levelId: string): Project {
  requireLevel(p, levelId);
  const removedWalls = new Set(p.walls.filter((w) => w.levelId === levelId).map((w) => w.id));
  return commit({
    ...p,
    levels: p.levels.filter((l) => l.id !== levelId),
    walls: p.walls.filter((w) => !removedWalls.has(w.id)),
    openings: p.openings.filter((o) => !removedWalls.has(o.hostWallId)),
  });
}

export function addWallType(p: Project, name: string, thickness: number): { project: Project; wallType: WallType } {
  const wallType: WallType = { id: newId("wt"), name: name.trim(), thickness };
  return { project: commit({ ...p, wallTypes: [...p.wallTypes, wallType] }), wallType };
}

/** Edits type parameters. Every wall of this type follows the new value. */
export function updateWallType(
  p: Project,
  wallTypeId: string,
  patch: Partial<Pick<WallType, "name" | "thickness">>,
): Project {
  if (!wallTypeById(p, wallTypeId)) throw new Error("Unknown wall type.");
  return commit({
    ...p,
    wallTypes: p.wallTypes.map((t) => (t.id === wallTypeId ? { ...t, ...patch } : t)),
  });
}

export function addWall(
  p: Project,
  levelId: string,
  start: Point,
  end: Point,
  options: { wallTypeId?: string; height?: number } = {},
): { project: Project; wall: Wall } {
  requireLevel(p, levelId);
  if (distanceMm(start, end) < MIN_WALL_LENGTH_MM) {
    throw new Error(`A wall must be at least ${MIN_WALL_LENGTH_MM} mm long.`);
  }
  const wallTypeId = options.wallTypeId ?? p.wallTypes[0]?.id;
  if (!wallTypeId) throw new Error("Create a wall type before adding walls.");
  const wall: Wall = {
    id: newId("wall"),
    levelId,
    wallTypeId,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    height: options.height ?? 3000,
  };
  return { project: commit({ ...p, walls: [...p.walls, wall] }), wall };
}

export type WallPatch = Partial<Pick<Wall, "levelId" | "wallTypeId" | "start" | "end" | "height">>;

/**
 * Edits a wall. Hosted openings are kept and re-validated: if the new geometry no longer fits an
 * opening, the edit is refused rather than silently deleting the opening.
 */
export function updateWall(p: Project, wallId: string, patch: WallPatch): Project {
  const existing = requireWall(p, wallId);
  const updated: Wall = {
    ...existing,
    ...patch,
    start: patch.start ? { x: patch.start.x, y: patch.start.y } : existing.start,
    end: patch.end ? { x: patch.end.x, y: patch.end.y } : existing.end,
  };
  if (distanceMm(updated.start, updated.end) < MIN_WALL_LENGTH_MM) {
    throw new Error(`A wall must be at least ${MIN_WALL_LENGTH_MM} mm long.`);
  }
  return commit({ ...p, walls: p.walls.map((w) => (w.id === wallId ? updated : w)) });
}

/** Deletes a wall and its hosted openings. */
export function deleteWall(p: Project, wallId: string): Project {
  requireWall(p, wallId);
  return commit({
    ...p,
    walls: p.walls.filter((w) => w.id !== wallId),
    openings: p.openings.filter((o) => o.hostWallId !== wallId),
  });
}

/** Hosts a door or window in a wall, centred `offset` mm from the wall's start point. */
export function addOpening(
  p: Project,
  hostWallId: string,
  openingTypeId: string,
  offset: number,
): { project: Project; opening: Opening } {
  requireWall(p, hostWallId);
  if (!openingTypeById(p, openingTypeId)) throw new Error("Unknown door or window type.");
  const opening: Opening = { id: newId("op"), hostWallId, openingTypeId, offset };
  return { project: commit({ ...p, openings: [...p.openings, opening] }), opening };
}

export function updateOpening(
  p: Project,
  openingId: string,
  patch: Partial<Pick<Opening, "offset" | "openingTypeId">>,
): Project {
  const existing = openingById(p, openingId);
  if (!existing) throw new Error("Unknown door or window.");
  return commit({
    ...p,
    openings: p.openings.map((o) => (o.id === openingId ? { ...existing, ...patch } : o)),
  });
}

export function deleteOpening(p: Project, openingId: string): Project {
  if (!openingById(p, openingId)) throw new Error("Unknown door or window.");
  return commit({ ...p, openings: p.openings.filter((o) => o.id !== openingId) });
}

function requireLevel(p: Project, levelId: string): Level {
  const level = levelById(p, levelId);
  if (!level) throw new Error("Unknown level.");
  return level;
}

function requireWall(p: Project, wallId: string): Wall {
  const wall = wallById(p, wallId);
  if (!wall) throw new Error("Unknown wall.");
  return wall;
}
