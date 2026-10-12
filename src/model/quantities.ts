import { polygonAbsAreaMm2, polygonPerimeterMm } from "../geometry/polygon";
import { distanceMm } from "./geometry";
import { columnTypeById, floorTypeById, openingTypeById, openingsInWall, wallTypeById } from "./project";
import type { Column, Floor, Opening, Project, Room, Wall } from "./types";

/**
 * Derived quantities, always computed from the canonical model and its geometry. Nothing here is
 * stored in the project file (DECISIONS.md D9). Values in millimetres unless the name says otherwise.
 */

export function roomAreaMm2(room: Room): number {
  return polygonAbsAreaMm2(room.boundary);
}

/** Room area in square metres, rounded to two decimals for display and schedules. */
export function roomAreaM2(room: Room): number {
  return Math.round(roomAreaMm2(room) / 10_000) / 100;
}

export function floorAreaMm2(floor: Floor): number {
  return polygonAbsAreaMm2(floor.boundary);
}

export function floorAreaM2(floor: Floor): number {
  return Math.round(floorAreaMm2(floor) / 10_000) / 100;
}

export function floorPerimeterMm(floor: Floor): number {
  return polygonPerimeterMm(floor.boundary);
}

export function floorVolumeMm3(floor: Floor, p: Project): number {
  const thickness = floorTypeById(p, floor.floorTypeId)?.thickness ?? 0;
  return floorAreaMm2(floor) * thickness;
}

export function wallLengthMm(wall: Wall): number {
  return distanceMm(wall.start, wall.end);
}

/** Gross wall face area (length × height) before openings, in square millimetres. */
export function wallGrossAreaMm2(wall: Wall): number {
  return wallLengthMm(wall) * wall.height;
}

export function openingAreaMm2(opening: Opening, p: Project): number {
  const type = openingTypeById(p, opening.openingTypeId);
  return type ? type.width * type.height : 0;
}

/** Net wall face area after subtracting openings, in square millimetres. */
export function wallNetAreaMm2(wall: Wall, p: Project): number {
  const gross = wallGrossAreaMm2(wall);
  const holes = openingsInWall(p, wall.id).reduce((sum, o) => sum + openingAreaMm2(o, p), 0);
  return Math.max(0, gross - holes);
}

/** Wall volume (length × thickness × height) minus opening voids, in cubic millimetres. */
export function wallNetVolumeMm3(wall: Wall, p: Project): number {
  const thickness = wallTypeById(p, wall.wallTypeId)?.thickness ?? 0;
  const holes = openingsInWall(p, wall.id).reduce((sum, o) => sum + openingAreaMm2(o, p), 0);
  return Math.max(0, wallLengthMm(wall) * wall.height * thickness - holes * thickness);
}

export function columnVolumeMm3(column: Column, p: Project): number {
  const type = columnTypeById(p, column.columnTypeId);
  return type ? type.width * type.depth * column.height : 0;
}

export interface ProjectQuantities {
  roomCount: number;
  roomAreaM2: number;
  wallLengthM: number;
  wallNetVolumeM3: number;
  floorAreaM2: number;
  floorVolumeM3: number;
  columnCount: number;
  columnVolumeM3: number;
  openingCount: number;
  doorCount: number;
  windowCount: number;
}

/** Project-wide totals derived on demand. Cubic metres are rounded to three decimals. */
export function projectQuantities(p: Project): ProjectQuantities {
  const roomAreaMm2Total = p.rooms.reduce((sum, r) => sum + roomAreaMm2(r), 0);
  const wallLengthMmTotal = p.walls.reduce((sum, w) => sum + wallLengthMm(w), 0);
  const wallVolumeMm3Total = p.walls.reduce((sum, w) => sum + wallNetVolumeMm3(w, p), 0);
  const floorAreaMm2Total = p.floors.reduce((sum, f) => sum + floorAreaMm2(f), 0);
  const floorVolumeMm3Total = p.floors.reduce((sum, f) => sum + floorVolumeMm3(f, p), 0);
  const columnVolumeMm3Total = p.columns.reduce((sum, c) => sum + columnVolumeMm3(c, p), 0);
  let doorCount = 0;
  let windowCount = 0;
  for (const o of p.openings) {
    const type = openingTypeById(p, o.openingTypeId);
    if (type?.kind === "door") doorCount += 1;
    else if (type?.kind === "window") windowCount += 1;
  }
  return {
    roomCount: p.rooms.length,
    roomAreaM2: Math.round(roomAreaMm2Total / 10_000) / 100,
    wallLengthM: Math.round(wallLengthMmTotal / 10) / 100,
    wallNetVolumeM3: Math.round(wallVolumeMm3Total / 1e6) / 1e3,
    floorAreaM2: Math.round(floorAreaMm2Total / 10_000) / 100,
    floorVolumeM3: Math.round(floorVolumeMm3Total / 1e6) / 1e3,
    columnCount: p.columns.length,
    columnVolumeM3: Math.round(columnVolumeMm3Total / 1e6) / 1e3,
    openingCount: p.openings.length,
    doorCount,
    windowCount,
  };
}
