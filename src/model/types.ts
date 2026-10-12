/** A point on the plan, in integer millimetres. */
export interface Point {
  x: number;
  y: number;
}

export const SCHEMA_VERSION = 2 as const;

export interface ProjectUnits {
  length: "mm";
}

/** A building level (floor). Elevation is measured in millimetres from the project datum. */
export interface Level {
  id: string;
  name: string;
  elevation: number;
}

/** Type parameters shared by walls of the same type. */
export interface WallType {
  id: string;
  name: string;
  /** Thickness in millimetres (positive). */
  thickness: number;
}

/** A straight wall defined by its centreline on a level. */
export interface Wall {
  id: string;
  levelId: string;
  wallTypeId: string;
  start: Point;
  end: Point;
  /** Height above the level elevation, in millimetres (positive). */
  height: number;
}

export type OpeningKind = "door" | "window";

/** Type parameters shared by doors or windows of the same type. */
export interface OpeningType {
  id: string;
  name: string;
  kind: OpeningKind;
  width: number;
  height: number;
  /** Height of the opening's bottom above the wall base. Doors must be 0. */
  sillHeight: number;
}

/** A door or window hosted in a wall. The host owns the opening's lifetime. */
export interface Opening {
  id: string;
  hostWallId: string;
  openingTypeId: string;
  /** Distance from the wall's start point to the opening centre, along the wall, in millimetres. */
  offset: number;
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  units: ProjectUnits;
  /** Incremented on each committed edit; a metadata counter for the saved state. */
  revision: number;
  levels: Level[];
  wallTypes: WallType[];
  openingTypes: OpeningType[];
  walls: Wall[];
  openings: Opening[];
}
