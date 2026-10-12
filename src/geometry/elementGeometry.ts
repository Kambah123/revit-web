import type { Point, Polygon, Project } from "../model/types";
import { levelById } from "../model/project";
import { polygonAbsAreaMm2, polygonCentroid } from "./polygon";

/**
 * Derived geometry for floors, columns and rooms, in millimetres. Pure functions of the canonical
 * model: nothing here is stored. Walls and openings live in `wallSolids.ts`.
 */

export interface FloorSlab {
  floorId: string;
  levelId: string;
  boundary: Polygon;
  /** Top face elevation (the level), mm. */
  z1: number;
  /** Bottom face elevation (level minus thickness), mm. */
  z0: number;
  materialId: string;
}

export interface ColumnSolid {
  columnId: string;
  levelId: string;
  /** Section centre on the plan. */
  centre: Point;
  width: number;
  depth: number;
  z0: number;
  z1: number;
  materialId: string;
}

export interface RoomFace {
  roomId: string;
  levelId: string;
  boundary: Polygon;
  /** Absolute elevation of the room's floor plane, mm. */
  z: number;
  areaMm2: number;
  labelPoint: Point;
}

/** Floor slabs on visible levels. The slab top is at its level elevation; thickness goes down. */
export function floorSlabs(p: Project, visibleLevelIds: Set<string>): FloorSlab[] {
  const slabs: FloorSlab[] = [];
  for (const floor of p.floors) {
    if (!visibleLevelIds.has(floor.levelId)) continue;
    const level = levelById(p, floor.levelId);
    const type = p.floorTypes.find((t) => t.id === floor.floorTypeId);
    if (!level || !type) continue;
    slabs.push({
      floorId: floor.id,
      levelId: floor.levelId,
      boundary: floor.boundary,
      z1: level.elevation,
      z0: level.elevation - type.thickness,
      materialId: type.materialId,
    });
  }
  return slabs;
}

/** Columns on visible levels, with their section and elevation range derived from types. */
export function columnSolids(p: Project, visibleLevelIds: Set<string>): ColumnSolid[] {
  const solids: ColumnSolid[] = [];
  for (const column of p.columns) {
    if (!visibleLevelIds.has(column.levelId)) continue;
    const level = levelById(p, column.levelId);
    const type = p.columnTypes.find((t) => t.id === column.columnTypeId);
    if (!level || !type) continue;
    solids.push({
      columnId: column.id,
      levelId: column.levelId,
      centre: column.position,
      width: type.width,
      depth: type.depth,
      z0: level.elevation,
      z1: level.elevation + column.height,
      materialId: type.materialId,
    });
  }
  return solids;
}

/** Room faces on visible levels: boundary, area and label point derived, never stored. */
export function roomFaces(p: Project, visibleLevelIds: Set<string>): RoomFace[] {
  const faces: RoomFace[] = [];
  for (const room of p.rooms) {
    if (!visibleLevelIds.has(room.levelId)) continue;
    const level = levelById(p, room.levelId);
    if (!level) continue;
    faces.push({
      roomId: room.id,
      levelId: room.levelId,
      boundary: room.boundary,
      z: level.elevation,
      areaMm2: polygonAbsAreaMm2(room.boundary),
      labelPoint: polygonCentroid(room.boundary),
    });
  }
  return faces;
}
