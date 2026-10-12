import { MIN_WALL_LENGTH, distance } from "./geometry";
import { newId } from "./ids";
import type { Level, Project, Vec2, Wall } from "./types";

export const PROJECT_FORMAT = "revit-web/project" as const;
export const PROJECT_VERSION = 1 as const;

export const DEFAULT_WALL_HEIGHT = 3;
export const DEFAULT_WALL_THICKNESS = 0.2;

export function createProject(name = "Untitled project"): Project {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    levels: [
      { id: newId("lvl"), name: "Level 1", elevation: 0 },
      { id: newId("lvl"), name: "Level 2", elevation: 3 },
    ],
    walls: [],
  };
}

export function levelById(project: Project, id: string): Level | undefined {
  return project.levels.find((l) => l.id === id);
}

export function wallsOnLevel(project: Project, levelId: string): Wall[] {
  return project.walls.filter((w) => w.levelId === levelId);
}

export function addLevel(
  project: Project,
  name: string,
  elevation: number,
): { project: Project; level: Level } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Level name is required.");
  if (!Number.isFinite(elevation)) throw new Error("Level elevation must be a number.");
  const level: Level = { id: newId("lvl"), name: trimmed, elevation };
  const levels = [...project.levels, level].sort((a, b) => a.elevation - b.elevation);
  return { project: { ...project, levels }, level };
}

/** Removes a level and every wall hosted on it. The last remaining level cannot be removed. */
export function removeLevel(project: Project, levelId: string): Project {
  if (project.levels.length <= 1) throw new Error("A project must keep at least one level.");
  return {
    ...project,
    levels: project.levels.filter((l) => l.id !== levelId),
    walls: project.walls.filter((w) => w.levelId !== levelId),
  };
}

export function renameLevel(project: Project, levelId: string, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Level name is required.");
  return {
    ...project,
    levels: project.levels.map((l) => (l.id === levelId ? { ...l, name: trimmed } : l)),
  };
}

export function addWall(
  project: Project,
  levelId: string,
  start: Vec2,
  end: Vec2,
  options: { thickness?: number; height?: number } = {},
): { project: Project; wall: Wall } {
  if (!levelById(project, levelId)) throw new Error(`Unknown level: ${levelId}`);
  if (distance(start, end) < MIN_WALL_LENGTH) {
    throw new Error("A wall must be longer than 5 cm.");
  }
  const wall: Wall = {
    id: newId("wall"),
    levelId,
    start: { ...start },
    end: { ...end },
    thickness: options.thickness ?? DEFAULT_WALL_THICKNESS,
    height: options.height ?? DEFAULT_WALL_HEIGHT,
  };
  assertValidWall(wall);
  return { project: { ...project, walls: [...project.walls, wall] }, wall };
}

export type WallPatch = Partial<Pick<Wall, "levelId" | "thickness" | "height" | "start" | "end">>;

export function updateWall(project: Project, wallId: string, patch: WallPatch): Project {
  const existing = project.walls.find((w) => w.id === wallId);
  if (!existing) throw new Error(`Unknown wall: ${wallId}`);
  const updated: Wall = { ...existing, ...patch };
  if (patch.levelId !== undefined && !levelById(project, patch.levelId)) {
    throw new Error(`Unknown level: ${patch.levelId}`);
  }
  assertValidWall(updated);
  return {
    ...project,
    walls: project.walls.map((w) => (w.id === wallId ? updated : w)),
  };
}

export function removeWall(project: Project, wallId: string): Project {
  return { ...project, walls: project.walls.filter((w) => w.id !== wallId) };
}

function assertValidWall(wall: Wall): void {
  const values = [wall.start.x, wall.start.y, wall.end.x, wall.end.y, wall.thickness, wall.height];
  if (!values.every((v) => Number.isFinite(v))) throw new Error("Wall geometry must be finite.");
  if (wall.thickness <= 0) throw new Error("Wall thickness must be positive.");
  if (wall.height <= 0) throw new Error("Wall height must be positive.");
  if (distance(wall.start, wall.end) < MIN_WALL_LENGTH) {
    throw new Error("A wall must be longer than 5 cm.");
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/** Parses and validates a project file. Throws a descriptive error if the file is not a valid project. */
export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  if (!isRecord(data)) throw new Error("File does not contain a project object.");
  if (data.format !== PROJECT_FORMAT) throw new Error("File is not a revit-web project.");
  if (data.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(data.version)}.`);
  }
  if (typeof data.name !== "string") throw new Error("Project name must be a string.");
  if (!Array.isArray(data.levels) || !Array.isArray(data.walls)) {
    throw new Error("Project must contain levels and walls arrays.");
  }

  const levels = data.levels.map((raw, i): Level => {
    if (!isRecord(raw)) throw new Error(`Level ${i} is malformed.`);
    if (typeof raw.id !== "string" || typeof raw.name !== "string") {
      throw new Error(`Level ${i} needs an id and name.`);
    }
    if (!isFiniteNumber(raw.elevation)) throw new Error(`Level ${raw.name} has no valid elevation.`);
    return { id: raw.id, name: raw.name, elevation: raw.elevation };
  });

  const levelIds = new Set(levels.map((l) => l.id));
  if (levels.length === 0) throw new Error("Project must contain at least one level.");
  if (levelIds.size !== levels.length) throw new Error("Level ids must be unique.");

  const walls = data.walls.map((raw, i): Wall => {
    if (!isRecord(raw)) throw new Error(`Wall ${i} is malformed.`);
    const { id, levelId, start, end, thickness, height } = raw;
    if (typeof id !== "string") throw new Error(`Wall ${i} needs an id.`);
    if (typeof levelId !== "string" || !levelIds.has(levelId)) {
      throw new Error(`Wall ${i} refers to an unknown level.`);
    }
    const wall: Wall = {
      id,
      levelId,
      start: parseVec2(start, `Wall ${i} start`),
      end: parseVec2(end, `Wall ${i} end`),
      thickness: thickness as number,
      height: height as number,
    };
    if (!isFiniteNumber(wall.thickness) || !isFiniteNumber(wall.height)) {
      throw new Error(`Wall ${i} needs numeric thickness and height.`);
    }
    assertValidWall(wall);
    return wall;
  });

  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, name: data.name, levels, walls };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseVec2(value: unknown, label: string): Vec2 {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error(`${label} must have numeric x and y.`);
  }
  return { x: value.x, y: value.y };
}
