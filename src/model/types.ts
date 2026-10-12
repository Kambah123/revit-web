/** A point on the horizontal plan, in meters. */
export interface Vec2 {
  x: number;
  y: number;
}

/** A building level (floor). Elevation is measured in meters from the project datum. */
export interface Level {
  id: string;
  name: string;
  elevation: number;
}

/** A straight wall, defined in plan by its centerline and sitting on a level. */
export interface Wall {
  id: string;
  levelId: string;
  start: Vec2;
  end: Vec2;
  /** Wall thickness in meters. */
  thickness: number;
  /** Wall height above its level in meters. */
  height: number;
}

export interface Project {
  format: "revit-web/project";
  version: 1;
  name: string;
  levels: Level[];
  walls: Wall[];
}
