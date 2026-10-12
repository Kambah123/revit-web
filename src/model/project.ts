import { newId } from "./ids";
import { SCHEMA_VERSION, type Level, type Opening, type OpeningType, type Project, type Wall, type WallType } from "./types";

export const DEFAULT_WALL_HEIGHT_MM = 3000;

export function createProject(name = "Untitled project"): Project {
  const wallTypes: WallType[] = [
    { id: newId("wt"), name: "Generic - 200 mm", thickness: 200 },
    { id: newId("wt"), name: "Generic - 100 mm", thickness: 100 },
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
    wallTypes,
    openingTypes,
    walls: [],
    openings: [],
  };
}

export function levelById(p: Project, id: string): Level | undefined {
  return p.levels.find((l) => l.id === id);
}

export function wallById(p: Project, id: string): Wall | undefined {
  return p.walls.find((w) => w.id === id);
}

export function openingById(p: Project, id: string): Opening | undefined {
  return p.openings.find((o) => o.id === id);
}

export function wallTypeById(p: Project, id: string): WallType | undefined {
  return p.wallTypes.find((t) => t.id === id);
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

/** Levels at or below the given level's elevation, in elevation order (used for plan visibility). */
export function levelsAtOrBelow(p: Project, levelId: string): Level[] {
  const level = levelById(p, levelId);
  if (!level) return [];
  return p.levels.filter((l) => l.elevation <= level.elevation);
}
