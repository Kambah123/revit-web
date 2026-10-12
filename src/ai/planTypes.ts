/**
 * The typed intermediate representation (DesignPlan) that DeepSeek must produce.
 *
 * This is DATA, never code: every operation maps 1:1 to a command in `src/model/commands.ts` (see
 * docs/AI_ARCHITECT.md §4). The runtime validator is `src/ai/planSchema.ts`; the transactional
 * executor is `src/ai/applyPlan.ts`. Length fields accept numbers (millimetres) or strings with
 * units ("600 mm", "3.5 m", "10 ft", "18 in") and are converted to integer millimetres on parse.
 */

/** A length as produced by the model: a number of millimetres or a string with a unit suffix. */
export type LengthValue = number | string;

/** A plan coordinate. Numbers are millimetres; strings may carry units. */
export interface PlanPoint {
  x: LengthValue;
  y: LengthValue;
}

/**
 * Reference to an element. Exactly one field is set:
 * - `id`: an existing element id from the project context (stable identity),
 * - `opId`: an element created by an earlier operation in the same plan,
 * - `name`: a level, room or type looked up by name.
 */
export interface ElementRef {
  id?: string;
  opId?: string;
  name?: string;
}

export interface LevelAdd {
  op: "level.add";
  opId?: string;
  name: string;
  elevation: LengthValue;
}
export interface LevelRename {
  op: "level.rename";
  level: ElementRef;
  name: string;
}
export interface LevelSetElevation {
  op: "level.setElevation";
  level: ElementRef;
  elevation: LengthValue;
}
export interface LevelDelete {
  op: "level.delete";
  level: ElementRef;
}

export interface WallTypeAdd {
  op: "wallType.add";
  opId?: string;
  name: string;
  thickness: LengthValue;
}
export interface WallAdd {
  op: "wall.add";
  opId?: string;
  level: ElementRef;
  start: PlanPoint;
  end: PlanPoint;
  height?: LengthValue;
  wallType?: ElementRef;
}
export interface WallUpdate {
  op: "wall.update";
  wall: ElementRef;
  start?: PlanPoint;
  end?: PlanPoint;
  height?: LengthValue;
  wallType?: ElementRef;
}
export interface WallDelete {
  op: "wall.delete";
  wall: ElementRef;
}

export type OpeningKind = "door" | "window";

/** Width/height/sillHeight create (or reuse) an opening type of that size when `openingType` is absent. */
export interface OpeningAdd {
  op: "opening.add";
  opId?: string;
  kind: OpeningKind;
  hostWall: ElementRef;
  /** Distance from the wall's start point to the opening centre, along the wall. */
  offset: LengthValue;
  openingType?: ElementRef;
  width?: LengthValue;
  height?: LengthValue;
  sillHeight?: LengthValue;
}
export interface OpeningUpdate {
  op: "opening.update";
  opening: ElementRef;
  offset?: LengthValue;
  openingType?: ElementRef;
}
export interface OpeningDelete {
  op: "opening.delete";
  opening: ElementRef;
}

export interface FloorAdd {
  op: "floor.add";
  opId?: string;
  level: ElementRef;
  boundary: PlanPoint[];
  floorType?: ElementRef;
}
export interface FloorUpdate {
  op: "floor.update";
  floor: ElementRef;
  level?: ElementRef;
  boundary?: PlanPoint[];
  floorType?: ElementRef;
}
export interface FloorDelete {
  op: "floor.delete";
  floor: ElementRef;
}

export interface RoomAdd {
  op: "room.add";
  opId?: string;
  level: ElementRef;
  name: string;
  number?: string;
  boundary: PlanPoint[];
}
export interface RoomUpdate {
  op: "room.update";
  room: ElementRef;
  name?: string;
  number?: string;
  level?: ElementRef;
  boundary?: PlanPoint[];
}
export interface RoomDelete {
  op: "room.delete";
  room: ElementRef;
}

export interface ColumnAdd {
  op: "column.add";
  opId?: string;
  level: ElementRef;
  position: PlanPoint;
  height?: LengthValue;
  columnType?: ElementRef;
}
export interface ColumnUpdate {
  op: "column.update";
  column: ElementRef;
  position?: PlanPoint;
  height?: LengthValue;
  columnType?: ElementRef;
}
export interface ColumnDelete {
  op: "column.delete";
  column: ElementRef;
}

export interface CeilingAdd {
  op: "ceiling.add";
  opId?: string;
  level: ElementRef;
  boundary: PlanPoint[];
  height?: LengthValue;
  ceilingType?: ElementRef;
}
export interface CeilingUpdate {
  op: "ceiling.update";
  ceiling: ElementRef;
  boundary?: PlanPoint[];
  height?: LengthValue;
  ceilingType?: ElementRef;
}
export interface CeilingDelete {
  op: "ceiling.delete";
  ceiling: ElementRef;
}

/** Hip roofs only: the engine generates a hip roof over an axis-aligned rectangular footprint. */
export interface RoofAdd {
  op: "roof.add";
  opId?: string;
  level: ElementRef;
  boundary: PlanPoint[];
  overhang?: LengthValue;
  rise?: LengthValue;
  roofType?: ElementRef;
}
export interface RoofUpdate {
  op: "roof.update";
  roof: ElementRef;
  level?: ElementRef;
  boundary?: PlanPoint[];
  overhang?: LengthValue;
  rise?: LengthValue;
  roofType?: ElementRef;
}
export interface RoofDelete {
  op: "roof.delete";
  roof: ElementRef;
}

export type ElevationDirection = "north" | "south" | "east" | "west";

/** Opens a generated view after the plan is applied. Sections are not supported (see UnsupportedFeature). */
export interface ViewOpen {
  op: "view.open";
  view: "plan" | "3d" | "elevation";
  level?: ElementRef;
  direction?: ElevationDirection;
}

export type PlanOperation =
  | LevelAdd
  | LevelRename
  | LevelSetElevation
  | LevelDelete
  | WallTypeAdd
  | WallAdd
  | WallUpdate
  | WallDelete
  | OpeningAdd
  | OpeningUpdate
  | OpeningDelete
  | FloorAdd
  | FloorUpdate
  | FloorDelete
  | RoomAdd
  | RoomUpdate
  | RoomDelete
  | ColumnAdd
  | ColumnUpdate
  | ColumnDelete
  | CeilingAdd
  | CeilingUpdate
  | CeilingDelete
  | RoofAdd
  | RoofUpdate
  | RoofDelete
  | ViewOpen;

export type PlanOpKind = PlanOperation["op"];

export interface Clarification {
  question: string;
  options?: string[];
}

/** A requested feature the engine cannot do; always paired with a supported alternative. */
export interface UnsupportedFeature {
  request: string;
  reason: string;
  alternative?: string;
}

export interface DesignPlan {
  kind: "design-plan";
  version: 1;
  summary: string;
  assumptions: string[];
  clarifications: Clarification[];
  unsupported: UnsupportedFeature[];
  operations: PlanOperation[];
}

/** All operation kinds, for prompt/validator sync checks. */
export const PLAN_OP_KINDS: readonly PlanOpKind[] = [
  "level.add",
  "level.rename",
  "level.setElevation",
  "level.delete",
  "wallType.add",
  "wall.add",
  "wall.update",
  "wall.delete",
  "opening.add",
  "opening.update",
  "opening.delete",
  "floor.add",
  "floor.update",
  "floor.delete",
  "room.add",
  "room.update",
  "room.delete",
  "column.add",
  "column.update",
  "column.delete",
  "ceiling.add",
  "ceiling.update",
  "ceiling.delete",
  "roof.add",
  "roof.update",
  "roof.delete",
  "view.open",
];
