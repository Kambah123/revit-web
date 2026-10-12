import { newId } from "./ids";
import { createProject } from "./project";
import { firstError } from "./validation";
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
  type Point,
  type Polygon,
  type Project,
  type Room,
  type Wall,
  type WallType,
} from "./types";

export const PROJECT_FORMAT = "revit-web/project" as const;

/**
 * Serializes a project deterministically: object keys are sorted recursively and array order is
 * preserved, so the same model always produces the same bytes. Invalid projects are not saved.
 */
export function serializeProject(p: Project): string {
  const message = firstError(p);
  if (message !== null) throw new Error(`Cannot save an invalid project: ${message}`);
  return `${JSON.stringify({ format: PROJECT_FORMAT, ...(sortKeys(p) as object) }, null, 2)}\n`;
}

/** Parses, migrates and validates a project file. Throws a readable error for anything it cannot accept. */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  if (!isRecord(raw)) throw new Error("File does not contain a project object.");
  if (raw.format !== PROJECT_FORMAT) throw new Error("File is not a revit-web project.");

  let project: Project;
  if (raw.schemaVersion === SCHEMA_VERSION) project = readCurrent(raw);
  else if (raw.schemaVersion === 2) project = migrateV2(raw);
  else if (raw.version === 1) project = migrateV2(migrateV1ToV2(raw));
  else throw new Error(`Unsupported project version: ${String(raw.schemaVersion ?? raw.version)}.`);

  const message = firstError(project);
  if (message !== null) throw new Error(`Invalid project: ${message}`);
  return project;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

function readCurrent(raw: Record<string, unknown>): Project {
  const levels = array(raw, "levels").map((item, i): Level => {
    const r = record(item, `Level ${i}`);
    return { id: str(r, "id"), name: str(r, "name"), elevation: int(r, "elevation") };
  });
  const materials = array(raw, "materials").map((item, i): Material => {
    const r = record(item, `Material ${i}`);
    return { id: str(r, "id"), name: str(r, "name"), color: str(r, "color") };
  });
  const wallTypes = array(raw, "wallTypes").map((item, i): WallType => {
    const r = record(item, `Wall type ${i}`);
    return {
      id: str(r, "id"),
      name: str(r, "name"),
      thickness: int(r, "thickness"),
      materialId: str(r, "materialId"),
    };
  });
  const floorTypes = array(raw, "floorTypes").map((item, i): FloorType => {
    const r = record(item, `Floor type ${i}`);
    return {
      id: str(r, "id"),
      name: str(r, "name"),
      thickness: int(r, "thickness"),
      materialId: str(r, "materialId"),
    };
  });
  const columnTypes = array(raw, "columnTypes").map((item, i): ColumnType => {
    const r = record(item, `Column type ${i}`);
    return {
      id: str(r, "id"),
      name: str(r, "name"),
      width: int(r, "width"),
      depth: int(r, "depth"),
      materialId: str(r, "materialId"),
    };
  });
  const openingTypes = array(raw, "openingTypes").map((item, i): OpeningType => {
    const r = record(item, `Opening type ${i}`);
    const kind = str(r, "kind");
    if (kind !== "door" && kind !== "window") throw new Error(`Opening type ${i} has an unknown kind.`);
    return {
      id: str(r, "id"),
      name: str(r, "name"),
      kind,
      width: int(r, "width"),
      height: int(r, "height"),
      sillHeight: int(r, "sillHeight"),
    };
  });
  const walls = array(raw, "walls").map((item, i): Wall => {
    const r = record(item, `Wall ${i}`);
    return {
      id: str(r, "id"),
      levelId: str(r, "levelId"),
      wallTypeId: str(r, "wallTypeId"),
      start: point(r, "start"),
      end: point(r, "end"),
      height: int(r, "height"),
    };
  });
  const openings = array(raw, "openings").map((item, i): Opening => {
    const r = record(item, `Opening ${i}`);
    return {
      id: str(r, "id"),
      hostWallId: str(r, "hostWallId"),
      openingTypeId: str(r, "openingTypeId"),
      offset: int(r, "offset"),
    };
  });
  const floors = array(raw, "floors").map((item, i): Floor => {
    const r = record(item, `Floor ${i}`);
    return {
      id: str(r, "id"),
      levelId: str(r, "levelId"),
      floorTypeId: str(r, "floorTypeId"),
      boundary: polygon(r, "boundary"),
    };
  });
  const rooms = array(raw, "rooms").map((item, i): Room => {
    const r = record(item, `Room ${i}`);
    return {
      id: str(r, "id"),
      levelId: str(r, "levelId"),
      name: str(r, "name"),
      number: str(r, "number"),
      boundary: polygon(r, "boundary"),
    };
  });
  const columns = array(raw, "columns").map((item, i): Column => {
    const r = record(item, `Column ${i}`);
    return {
      id: str(r, "id"),
      levelId: str(r, "levelId"),
      columnTypeId: str(r, "columnTypeId"),
      position: point(r, "position"),
      height: int(r, "height"),
    };
  });
  const units = record(raw.units, "Units");
  if (units.length !== "mm") throw new Error("Project length unit must be millimetres.");
  return {
    schemaVersion: SCHEMA_VERSION,
    id: str(raw, "id"),
    name: str(raw, "name"),
    units: { length: "mm" },
    revision: int(raw, "revision"),
    levels,
    materials,
    wallTypes,
    floorTypes,
    columnTypes,
    openingTypes,
    walls,
    openings,
    floors,
    rooms,
    columns,
  };
}

/** The v2 shape: no materials, floors, rooms or columns; wall types have no material. */
interface ProjectV2 {
  id: string;
  name: string;
  revision: number;
  levels: Level[];
  wallTypes: { id: string; name: string; thickness: number }[];
  openingTypes: OpeningType[];
  walls: Wall[];
  openings: Opening[];
}

/**
 * Migrates schema v2 to v3 (DECISIONS.md D7): seeds one generic material, assigns it to every wall
 * type, and seeds one floor type and one column type. New element collections start empty.
 */
function migrateV2(raw: Record<string, unknown>): Project {
  const levels = array(raw, "levels").map((item, i): Level => {
    const r = record(item, `Level ${i}`);
    return { id: str(r, "id"), name: str(r, "name"), elevation: int(r, "elevation") };
  });
  const wallTypes: ProjectV2["wallTypes"] = array(raw, "wallTypes").map((item, i) => {
    const r = record(item, `Wall type ${i}`);
    return { id: str(r, "id"), name: str(r, "name"), thickness: int(r, "thickness") };
  });
  const openingTypes = array(raw, "openingTypes").map((item, i): OpeningType => {
    const r = record(item, `Opening type ${i}`);
    const kind = str(r, "kind");
    if (kind !== "door" && kind !== "window") throw new Error(`Opening type ${i} has an unknown kind.`);
    return {
      id: str(r, "id"),
      name: str(r, "name"),
      kind,
      width: int(r, "width"),
      height: int(r, "height"),
      sillHeight: int(r, "sillHeight"),
    };
  });
  const walls = array(raw, "walls").map((item, i): Wall => {
    const r = record(item, `Wall ${i}`);
    return {
      id: str(r, "id"),
      levelId: str(r, "levelId"),
      wallTypeId: str(r, "wallTypeId"),
      start: point(r, "start"),
      end: point(r, "end"),
      height: int(r, "height"),
    };
  });
  const openings = array(raw, "openings").map((item, i): Opening => {
    const r = record(item, `Opening ${i}`);
    return {
      id: str(r, "id"),
      hostWallId: str(r, "hostWallId"),
      openingTypeId: str(r, "openingTypeId"),
      offset: int(r, "offset"),
    };
  });
  const units = record(raw.units, "Units");
  if (units.length !== "mm") throw new Error("Project length unit must be millimetres.");
  const v2: ProjectV2 = {
    id: str(raw, "id"),
    name: str(raw, "name"),
    revision: int(raw, "revision"),
    levels,
    wallTypes,
    openingTypes,
    walls,
    openings,
  };
  return v2ToV3(v2);
}

function v2ToV3(v2: ProjectV2): Project {
  const base = createProject(v2.name);
  const material: Material = { id: newId("mat"), name: "Generic", color: "#b0a89a" };
  const wallTypes: WallType[] =
    v2.wallTypes.length > 0
      ? v2.wallTypes.map((t) => ({ ...t, materialId: material.id }))
      : base.wallTypes.map((t) => ({ ...t, materialId: material.id }));
  return {
    schemaVersion: SCHEMA_VERSION,
    id: v2.id,
    name: v2.name,
    units: { length: "mm" },
    revision: v2.revision,
    levels: v2.levels,
    materials: [material],
    wallTypes,
    floorTypes: base.floorTypes.map((t) => ({ ...t, materialId: material.id })),
    columnTypes: base.columnTypes.map((t) => ({ ...t, materialId: material.id })),
    openingTypes: v2.openingTypes,
    walls: v2.walls,
    openings: v2.openings,
    floors: [],
    rooms: [],
    columns: [],
  };
}

/**
 * Migrates the first format (metres as floats, no types or openings) to the v2 shape. Lengths are
 * rounded to whole millimetres, and each distinct thickness becomes a wall type.
 */
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const toMm = (value: unknown, label: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a number.`);
    return Math.round(value * 1000);
  };
  const wallTypes: { id: string; name: string; thickness: number }[] = [];
  const typeByThickness = new Map<number, string>();
  const typeFor = (thickness: number): string => {
    const existing = typeByThickness.get(thickness);
    if (existing) return existing;
    const id = newId("wt");
    typeByThickness.set(thickness, id);
    wallTypes.push({ id, name: `Migrated - ${thickness} mm`, thickness });
    return id;
  };

  const levels = array(raw, "levels").map((item, i): Level => {
    const r = record(item, `Level ${i}`);
    return { id: str(r, "id"), name: str(r, "name"), elevation: toMm(r.elevation, `Level ${i} elevation`) };
  });
  const walls = array(raw, "walls").map((item, i): Wall => {
    const r = record(item, `Wall ${i}`);
    const start = record(r.start, `Wall ${i} start`);
    const end = record(r.end, `Wall ${i} end`);
    return {
      id: str(r, "id"),
      levelId: str(r, "levelId"),
      wallTypeId: typeFor(toMm(r.thickness, `Wall ${i} thickness`)),
      start: { x: toMm(start.x, "start x"), y: toMm(start.y, "start y") },
      end: { x: toMm(end.x, "end x"), y: toMm(end.y, "end y") },
      height: toMm(r.height, `Wall ${i} height`),
    };
  });
  return {
    schemaVersion: 2,
    id: typeof raw.id === "string" ? raw.id : newId("proj"),
    name: typeof raw.name === "string" ? raw.name : "Untitled project",
    units: { length: "mm" },
    revision: typeof raw.revision === "number" && Number.isSafeInteger(raw.revision) ? raw.revision : 0,
    levels,
    wallTypes,
    openingTypes: [],
    walls,
    openings: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} is malformed.`);
  return value;
}

function array(r: Record<string, unknown>, key: string): unknown[] {
  const value = r[key];
  if (!Array.isArray(value)) throw new Error(`Project field "${key}" must be an array.`);
  return value;
}

function str(r: Record<string, unknown>, key: string): string {
  const value = r[key];
  if (typeof value !== "string") throw new Error(`Field "${key}" must be a string.`);
  return value;
}

function int(r: Record<string, unknown>, key: string): number {
  const value = r[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Field "${key}" must be a whole number of millimetres.`);
  }
  return value;
}

function point(r: Record<string, unknown>, key: string): Point {
  const p = record(r[key], `Field "${key}"`);
  return { x: int(p, "x"), y: int(p, "y") };
}

function polygon(r: Record<string, unknown>, key: string): Polygon {
  return array(r, key).map((item, i) => {
    const p = record(item, `${key}[${i}]`);
    return { x: int(p, "x"), y: int(p, "y") };
  });
}
