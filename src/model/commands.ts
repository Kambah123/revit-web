import { boundaryError } from "../geometry/polygon";
import { distanceMm, MIN_WALL_LENGTH_MM } from "./geometry";
import { newId } from "./ids";
import { firstError } from "./validation";
import {
  columnById,
  columnTypeById,
  floorById,
  floorTypeById,
  levelById,
  materialById,
  openingById,
  openingTypeById,
  roomById,
  wallById,
  wallTypeById,
} from "./project";
import type {
  Column,
  ColumnType,
  Floor,
  FloorType,
  Level,
  Material,
  Opening,
  Point,
  Polygon,
  Project,
  Room,
  Wall,
  WallType,
} from "./types";

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

/** Deletes a level and cascades to every element on it: walls (with their openings), floors, rooms and columns. */
export function deleteLevel(p: Project, levelId: string): Project {
  requireLevel(p, levelId);
  const removedWalls = new Set(p.walls.filter((w) => w.levelId === levelId).map((w) => w.id));
  return commit({
    ...p,
    levels: p.levels.filter((l) => l.id !== levelId),
    walls: p.walls.filter((w) => !removedWalls.has(w.id)),
    openings: p.openings.filter((o) => !removedWalls.has(o.hostWallId)),
    floors: p.floors.filter((f) => f.levelId !== levelId),
    rooms: p.rooms.filter((r) => r.levelId !== levelId),
    columns: p.columns.filter((c) => c.levelId !== levelId),
  });
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export function addMaterial(p: Project, name: string, color: string): { project: Project; material: Material } {
  const material: Material = { id: newId("mat"), name: name.trim(), color };
  return { project: commit({ ...p, materials: [...p.materials, material] }), material };
}

export function updateMaterial(p: Project, materialId: string, patch: Partial<Pick<Material, "name" | "color">>): Project {
  if (!materialById(p, materialId)) throw new Error("Unknown material.");
  return commit({
    ...p,
    materials: p.materials.map((m) => (m.id === materialId ? { ...m, ...patch } : m)),
  });
}

/** Deletes a material that no type uses. Materials in use are refused. */
export function deleteMaterial(p: Project, materialId: string): Project {
  if (!materialById(p, materialId)) throw new Error("Unknown material.");
  const used =
    p.wallTypes.some((t) => t.materialId === materialId) ||
    p.floorTypes.some((t) => t.materialId === materialId) ||
    p.columnTypes.some((t) => t.materialId === materialId);
  if (used) throw new Error("That material is assigned to a type. Reassign the type first.");
  if (p.materials.length <= 1) throw new Error("A project must keep at least one material.");
  return commit({ ...p, materials: p.materials.filter((m) => m.id !== materialId) });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export function addWallType(p: Project, name: string, thickness: number, materialId?: string): { project: Project; wallType: WallType } {
  const mid = materialId ?? p.materials[0]?.id;
  if (!mid || !materialById(p, mid)) throw new Error("Create a material before adding wall types.");
  const wallType: WallType = { id: newId("wt"), name: name.trim(), thickness, materialId: mid };
  return { project: commit({ ...p, wallTypes: [...p.wallTypes, wallType] }), wallType };
}

/** Edits type parameters. Every wall of this type follows the new value. */
export function updateWallType(
  p: Project,
  wallTypeId: string,
  patch: Partial<Pick<WallType, "name" | "thickness" | "materialId">>,
): Project {
  if (!wallTypeById(p, wallTypeId)) throw new Error("Unknown wall type.");
  return commit({
    ...p,
    wallTypes: p.wallTypes.map((t) => (t.id === wallTypeId ? { ...t, ...patch } : t)),
  });
}

export function addFloorType(p: Project, name: string, thickness: number, materialId?: string): { project: Project; floorType: FloorType } {
  const mid = materialId ?? p.materials[0]?.id;
  if (!mid || !materialById(p, mid)) throw new Error("Create a material before adding floor types.");
  const floorType: FloorType = { id: newId("ft"), name: name.trim(), thickness, materialId: mid };
  return { project: commit({ ...p, floorTypes: [...p.floorTypes, floorType] }), floorType };
}

export function updateFloorType(
  p: Project,
  floorTypeId: string,
  patch: Partial<Pick<FloorType, "name" | "thickness" | "materialId">>,
): Project {
  if (!floorTypeById(p, floorTypeId)) throw new Error("Unknown floor type.");
  return commit({
    ...p,
    floorTypes: p.floorTypes.map((t) => (t.id === floorTypeId ? { ...t, ...patch } : t)),
  });
}

/** Deletes a floor type; refused while any floor uses it. */
export function deleteFloorType(p: Project, floorTypeId: string): Project {
  if (!floorTypeById(p, floorTypeId)) throw new Error("Unknown floor type.");
  if (p.floors.some((f) => f.floorTypeId === floorTypeId)) {
    throw new Error("That floor type is used by a floor. Delete or retype the floors first.");
  }
  return commit({ ...p, floorTypes: p.floorTypes.filter((t) => t.id !== floorTypeId) });
}

export function addColumnType(
  p: Project,
  name: string,
  width: number,
  depth: number,
  materialId?: string,
): { project: Project; columnType: ColumnType } {
  const mid = materialId ?? p.materials[0]?.id;
  if (!mid || !materialById(p, mid)) throw new Error("Create a material before adding column types.");
  const columnType: ColumnType = { id: newId("ct"), name: name.trim(), width, depth, materialId: mid };
  return { project: commit({ ...p, columnTypes: [...p.columnTypes, columnType] }), columnType };
}

export function updateColumnType(
  p: Project,
  columnTypeId: string,
  patch: Partial<Pick<ColumnType, "name" | "width" | "depth" | "materialId">>,
): Project {
  if (!columnTypeById(p, columnTypeId)) throw new Error("Unknown column type.");
  return commit({
    ...p,
    columnTypes: p.columnTypes.map((t) => (t.id === columnTypeId ? { ...t, ...patch } : t)),
  });
}

export function deleteColumnType(p: Project, columnTypeId: string): Project {
  if (!columnTypeById(p, columnTypeId)) throw new Error("Unknown column type.");
  if (p.columns.some((c) => c.columnTypeId === columnTypeId)) {
    throw new Error("That column type is used by a column. Delete or retype the columns first.");
  }
  return commit({ ...p, columnTypes: p.columnTypes.filter((t) => t.id !== columnTypeId) });
}

// ---------------------------------------------------------------------------
// Walls and openings
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Floors, rooms and columns
// ---------------------------------------------------------------------------

function checkedBoundary(boundary: Polygon): Polygon {
  const message = boundaryError(boundary);
  if (message) throw new Error(message);
  return boundary.map((pt) => ({ x: pt.x, y: pt.y }));
}

export function addFloor(
  p: Project,
  levelId: string,
  floorTypeId: string,
  boundary: Polygon,
): { project: Project; floor: Floor } {
  requireLevel(p, levelId);
  if (!floorTypeById(p, floorTypeId)) throw new Error("Unknown floor type.");
  const floor: Floor = {
    id: newId("floor"),
    levelId,
    floorTypeId,
    boundary: checkedBoundary(boundary),
  };
  return { project: commit({ ...p, floors: [...p.floors, floor] }), floor };
}

export type FloorPatch = Partial<Pick<Floor, "levelId" | "floorTypeId" | "boundary">>;

export function updateFloor(p: Project, floorId: string, patch: FloorPatch): Project {
  const existing = floorById(p, floorId);
  if (!existing) throw new Error("Unknown floor.");
  const updated: Floor = {
    ...existing,
    ...patch,
    boundary: patch.boundary ? checkedBoundary(patch.boundary) : existing.boundary,
  };
  return commit({ ...p, floors: p.floors.map((f) => (f.id === floorId ? updated : f)) });
}

export function deleteFloor(p: Project, floorId: string): Project {
  if (!floorById(p, floorId)) throw new Error("Unknown floor.");
  return commit({ ...p, floors: p.floors.filter((f) => f.id !== floorId) });
}

export function addRoom(
  p: Project,
  levelId: string,
  name: string,
  number: string,
  boundary: Polygon,
): { project: Project; room: Room } {
  requireLevel(p, levelId);
  const room: Room = {
    id: newId("room"),
    levelId,
    name: name.trim(),
    number,
    boundary: checkedBoundary(boundary),
  };
  return { project: commit({ ...p, rooms: [...p.rooms, room] }), room };
}

export type RoomPatch = Partial<Pick<Room, "levelId" | "name" | "number" | "boundary">>;

export function updateRoom(p: Project, roomId: string, patch: RoomPatch): Project {
  const existing = roomById(p, roomId);
  if (!existing) throw new Error("Unknown room.");
  const updated: Room = {
    ...existing,
    ...patch,
    boundary: patch.boundary ? checkedBoundary(patch.boundary) : existing.boundary,
  };
  return commit({ ...p, rooms: p.rooms.map((r) => (r.id === roomId ? updated : r)) });
}

export function deleteRoom(p: Project, roomId: string): Project {
  if (!roomById(p, roomId)) throw new Error("Unknown room.");
  return commit({ ...p, rooms: p.rooms.filter((r) => r.id !== roomId) });
}

export function addColumn(
  p: Project,
  levelId: string,
  columnTypeId: string,
  position: Point,
  options: { height?: number } = {},
): { project: Project; column: Column } {
  requireLevel(p, levelId);
  if (!columnTypeById(p, columnTypeId)) throw new Error("Unknown column type.");
  const column: Column = {
    id: newId("col"),
    levelId,
    columnTypeId,
    position: { x: position.x, y: position.y },
    height: options.height ?? 3000,
  };
  return { project: commit({ ...p, columns: [...p.columns, column] }), column };
}

export type ColumnPatch = Partial<Pick<Column, "levelId" | "columnTypeId" | "position" | "height">>;

export function updateColumn(p: Project, columnId: string, patch: ColumnPatch): Project {
  const existing = columnById(p, columnId);
  if (!existing) throw new Error("Unknown column.");
  const updated: Column = {
    ...existing,
    ...patch,
    position: patch.position ? { x: patch.position.x, y: patch.position.y } : existing.position,
  };
  return commit({ ...p, columns: p.columns.map((c) => (c.id === columnId ? updated : c)) });
}

export function deleteColumn(p: Project, columnId: string): Project {
  if (!columnById(p, columnId)) throw new Error("Unknown column.");
  return commit({ ...p, columns: p.columns.filter((c) => c.id !== columnId) });
}

// ---------------------------------------------------------------------------
// Shared guards
// ---------------------------------------------------------------------------

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
