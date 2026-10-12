import type { Point, Polygon, Project } from "../model/types";
import { levelById } from "../model/project";
import { polygonAbsAreaMm2, polygonBounds, polygonCentroid } from "./polygon";

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

export interface CeilingSlab {
  ceilingId: string;
  levelId: string;
  boundary: Polygon;
  /** Bottom face (top minus thickness), mm. */
  z0: number;
  /** Top face: level elevation plus the ceiling height, mm. */
  z1: number;
  materialId: string;
}

/** Ceiling panels on visible levels: a horizontal slab whose top is `height` above the level. */
export function ceilingSlabs(p: Project, visibleLevelIds: Set<string>): CeilingSlab[] {
  const slabs: CeilingSlab[] = [];
  for (const ceiling of p.ceilings) {
    if (!visibleLevelIds.has(ceiling.levelId)) continue;
    const level = levelById(p, ceiling.levelId);
    const type = p.ceilingTypes.find((t) => t.id === ceiling.ceilingTypeId);
    if (!level || !type) continue;
    const z1 = level.elevation + ceiling.height;
    slabs.push({
      ceilingId: ceiling.id,
      levelId: ceiling.levelId,
      boundary: ceiling.boundary,
      z0: z1 - type.thickness,
      z1,
      materialId: type.materialId,
    });
  }
  return slabs;
}

/**
 * A hip roof derived from its rectangular footprint, overhang and rise (DECISIONS.md D10).
 * The footprint is expanded outward by the overhang; the ridge runs along the longer axis and is
 * inset from the ends by half the shorter side, forming two trapezoid slopes and two hip ends.
 */
export interface RoofSolid {
  roofId: string;
  levelId: string;
  /** Expanded footprint bounds in plan, mm. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Eaves elevation (the level), mm. */
  z0: number;
  /** Ridge elevation (level + rise), mm. */
  z1: number;
  /** Ridge endpoints in plan, mm. */
  ridgeA: Point;
  ridgeB: Point;
  materialId: string;
}

export function roofSolids(p: Project, visibleLevelIds: Set<string>): RoofSolid[] {
  const solids: RoofSolid[] = [];
  for (const roof of p.roofs) {
    if (!visibleLevelIds.has(roof.levelId)) continue;
    const level = levelById(p, roof.levelId);
    const type = p.roofTypes.find((t) => t.id === roof.roofTypeId);
    if (!level || !type) continue;
    const bounds = polygonBounds(roof.boundary);
    const o = roof.overhang;
    const minX = bounds.minX - o;
    const minY = bounds.minY - o;
    const maxX = bounds.maxX + o;
    const maxY = bounds.maxY + o;
    const w = maxX - minX;
    const d = maxY - minY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    let ridgeA: Point;
    let ridgeB: Point;
    if (w >= d) {
      const half = d / 2;
      ridgeA = { x: minX + half, y: midY };
      ridgeB = { x: maxX - half, y: midY };
    } else {
      const half = w / 2;
      ridgeA = { x: midX, y: minY + half };
      ridgeB = { x: midX, y: maxY - half };
    }
    solids.push({
      roofId: roof.id,
      levelId: roof.levelId,
      minX,
      minY,
      maxX,
      maxY,
      z0: level.elevation,
      z1: level.elevation + roof.rise,
      ridgeA,
      ridgeB,
      materialId: type.materialId,
    });
  }
  return solids;
}
