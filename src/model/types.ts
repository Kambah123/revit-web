/** A point on the plan, in integer millimetres. */
export interface Point {
  x: number;
  y: number;
}

/**
 * A closed boundary polygon on the plan, in integer millimetres. Vertices are listed in order and
 * the last vertex does not repeat the first; the edge from the last vertex back to the first is
 * implicit. At least three vertices, non-self-intersecting, non-zero area.
 */
export type Polygon = Point[];

export const SCHEMA_VERSION = 5 as const;

/** Static, aligned linear annotation. Coordinates and signed perpendicular offset in mm. */
export interface Dimension {
  id: string;
  levelId: string;
  start: Point;
  end: Point;
  offset: number;
  unit: "mm" | "m";
}

export interface ProjectUnits {
  length: "mm";
}

/** A building level (floor). Elevation is measured in millimetres from the project datum. */
export interface Level {
  id: string;
  name: string;
  elevation: number;
}

/**
 * A material: identity and appearance. The colour is sRGB "#rrggbb" for the viewer only; it is not
 * an engineering property. Physical/thermal properties arrive with later milestones.
 */
export interface Material {
  id: string;
  name: string;
  color: string;
}

/** Type parameters shared by walls of the same type. */
export interface WallType {
  id: string;
  name: string;
  /** Thickness in millimetres (positive). */
  thickness: number;
  materialId: string;
}

/** Type parameters shared by floors of the same type. */
export interface FloorType {
  id: string;
  name: string;
  /** Slab thickness in millimetres (positive). */
  thickness: number;
  materialId: string;
}

/** Type parameters shared by columns of the same type: a rectangular section. */
export interface ColumnType {
  id: string;
  name: string;
  /** Section size along plan X, in millimetres (positive). */
  width: number;
  /** Section size along plan Y, in millimetres (positive). */
  depth: number;
  materialId: string;
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

/**
 * A floor slab: a boundary sketch extruded downward from its level. The slab's top face is at the
 * level elevation; its bottom is one thickness below (see DECISIONS.md D7).
 */
export interface Floor {
  id: string;
  levelId: string;
  floorTypeId: string;
  boundary: Polygon;
}

/** A room: a named bounded area on a level. Its area is derived from the boundary, never stored. */
export interface Room {
  id: string;
  levelId: string;
  name: string;
  number: string;
  boundary: Polygon;
}

/** A rectangular column standing on a level, centred on `position` in plan. */
export interface Column {
  id: string;
  levelId: string;
  columnTypeId: string;
  position: Point;
  /** Height above the level elevation, in millimetres (positive). */
  height: number;
}

/** Type parameters shared by ceilings of the same type. */
export interface CeilingType {
  id: string;
  name: string;
  /** Panel thickness in millimetres (positive). */
  thickness: number;
  materialId: string;
}

/**
 * A ceiling: a horizontal panel whose top face sits `height` millimetres above its level.
 * Shown in plan and 3D; a reflected ceiling plan is a later view milestone.
 */
export interface Ceiling {
  id: string;
  levelId: string;
  ceilingTypeId: string;
  boundary: Polygon;
  /** Height of the panel's top face above the level elevation, in millimetres (positive). */
  height: number;
}

/** Type parameters shared by roofs of the same type. */
export interface RoofType {
  id: string;
  name: string;
  /** Slab thickness at the eaves, in millimetres (positive). */
  thickness: number;
  materialId: string;
}

/**
 * A simple hip roof over an axis-aligned rectangular footprint. The footprint is the stored
 * boundary; `overhang` expands it outward before the hip geometry is generated. `rise` is the
 * height of the ridge above the level (DECISIONS.md D10).
 */
export interface Roof {
  id: string;
  levelId: string;
  roofTypeId: string;
  /** Axis-aligned rectangle, 4 vertices. */
  boundary: Polygon;
  /** Horizontal overhang beyond the boundary, in millimetres (0 or positive). */
  overhang: number;
  /** Ridge height above the level elevation, in millimetres (positive). */
  rise: number;
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  units: ProjectUnits;
  /** Incremented on each committed edit; a metadata counter for the saved state. */
  revision: number;
  levels: Level[];
  materials: Material[];
  wallTypes: WallType[];
  floorTypes: FloorType[];
  columnTypes: ColumnType[];
  ceilingTypes: CeilingType[];
  roofTypes: RoofType[];
  openingTypes: OpeningType[];
  walls: Wall[];
  openings: Opening[];
  floors: Floor[];
  rooms: Room[];
  columns: Column[];
  ceilings: Ceiling[];
  roofs: Roof[];
  dimensions: Dimension[];
}
