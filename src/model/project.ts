import { newId } from "./ids";
import {
  SCHEMA_VERSION,
  type Column,
  type ColumnType,
  type Floor,
  type FloorType,
  type Level,
  type Material,
  type Opening,
  type OpeningType,
  type Project,
  type Room,
  type Wall,
  type WallType,
} from "./types";

export const DEFAULT_WALL_HEIGHT_MM = 3000;
export const DEFAULT_COLUMN_HEIGHT_MM = 3000;
export const DEFAULT_FLOOR_THICKNESS_MM = 200;

export function createProject(name = "Untitled project"): Project {
  const materials: Material[] = [
    { id: newId("mat"), name: "Generic", color: "#b0a89a" },
    { id: newId("mat"), name: "Concrete", color: "#9a9a94" },
    { id: newId("mat"), name: "Wood", color: "#9b6b3c" },
    { id: newId("mat"), name: "Steel", color: "#7d8aa0" },
  ];
  const generic = materials[0].id;
  const concrete = materials[1].id;
  const wallTypes: WallType[] = [
    { id: newId("wt"), name: "Generic - 200 mm", thickness: 200, materialId: generic },
    { id: newId("wt"), name: "Generic - 100 mm", thickness: 100, materialId: generic },
  ];
  const floorTypes: FloorType[] = [
    { id: newId("ft"), name: "Floor - 200 mm", thickness: DEFAULT_FLOOR_THICKNESS_MM, materialId: concrete },
  ];
  const columnTypes: ColumnType[] = [
    { id: newId("ct"), name: "Column - 300 x 300", width: 300, depth: 300, materialId: concrete },
  ];
  const openingTypes: OpeningType[] = [
    { id: newId("ot"), name: "Door 900 x 2100", kind: "door", width: 900, height: 2100, sillHeight: 0 },
    { id: newId("ot"), name: "Window 1200 x 1200", kind: "window", width: 1200, height: 1200, sillHeight: 900 },
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId("proj"),
    name,
    units: { length: "mm" },
    revision: 0,
    levels: [
      { id: newId("lvl"), name: "Level 1", elevation: 0 },
      { id: newId("lvl"), name: "Level 2", elevation: 3000 },
    ],
    materials,
    wallTypes,
    floorTypes,
    columnTypes,
    openingTypes,
    walls: [],
    openings: [],
    floors: [],
    rooms: [],
    columns: [],
  };
}

export function levelById(p: Project, id: string): Level | undefined {
  return p.levels.find((l) => l.id === id);
}

export function materialById(p: Project, id: string): Material | undefined {
  return p.materials.find((m) => m.id === id);
}

export function wallById(p: Project, id: string): Wall | undefined {
  return p.walls.find((w) => w.id === id);
}

export function openingById(p: Project, id: string): Opening | undefined {
  return p.openings.find((o) => o.id === id);
}

export function floorById(p: Project, id: string): Floor | undefined {
  return p.floors.find((f) => f.id === id);
}

export function roomById(p: Project, id: string): Room | undefined {
  return p.rooms.find((r) => r.id === id);
}

export function columnById(p: Project, id: string): Column | undefined {
  return p.columns.find((c) => c.id === id);
}

export function wallTypeById(p: Project, id: string): WallType | undefined {
  return p.wallTypes.find((t) => t.id === id);
}

export function floorTypeById(p: Project, id: string): FloorType | undefined {
  return p.floorTypes.find((t) => t.id === id);
}

export function columnTypeById(p: Project, id: string): ColumnType | undefined {
  return p.columnTypes.find((t) => t.id === id);
}

export function openingTypeById(p: Project, id: string): OpeningType | undefined {
  return p.openingTypes.find((t) => t.id === id);
}

export function wallsOnLevel(p: Project, levelId: string): Wall[] {
  return p.walls.filter((w) => w.levelId === levelId);
}

export function openingsInWall(p: Project, wallId: string): Opening[] {
  return p.openings.filter((o) => o.hostWallId === wallId);
}

export function floorsOnLevel(p: Project, levelId: string): Floor[] {
  return p.floors.filter((f) => f.levelId === levelId);
}

export function roomsOnLevel(p: Project, levelId: string): Room[] {
  return p.rooms.filter((r) => r.levelId === levelId);
}

export function columnsOnLevel(p: Project, levelId: string): Column[] {
  return p.columns.filter((c) => c.levelId === levelId);
}

/** Levels at or below the given level's elevation, in elevation order (used for plan visibility). */
export function levelsAtOrBelow(p: Project, levelId: string): Level[] {
  const level = levelById(p, levelId);
  if (!level) return [];
  return p.levels.filter((l) => l.elevation <= level.elevation);
}
