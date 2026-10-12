import { boundaryError, rectangleError } from "../geometry/polygon";
import { MIN_WALL_LENGTH_MM, distanceMm } from "./geometry";
import {
  ceilingTypeById,
  columnTypeById,
  floorTypeById,
  levelById,
  materialById,
  openingTypeById,
  roofTypeById,
  wallById,
  wallTypeById,
} from "./project";
import type { Project } from "./types";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  entityId?: string;
}

const isInt = (v: number) => Number.isSafeInteger(v);
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Checks every invariant of the canonical model. Errors make a project invalid: commands refuse to
 * produce them, and loading refuses to accept them. Warnings are informational.
 */
export function validateProject(p: Project): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, message: string, entityId?: string) =>
    issues.push({ severity: "error", code, message, entityId });
  const warning = (code: string, message: string, entityId?: string) =>
    issues.push({ severity: "warning", code, message, entityId });

  if (p.schemaVersion !== 4) error("schema", `Unsupported schema version ${String(p.schemaVersion)}.`);
  if (p.units?.length !== "mm") error("units", "Project length unit must be millimetres.");
  if (!isInt(p.revision) || p.revision < 0) error("revision", "Revision must be a non-negative integer.");

  checkUniqueIds(p.levels.map((x) => x.id), "level", error);
  checkUniqueIds(p.materials.map((x) => x.id), "material", error);
  checkUniqueIds(p.wallTypes.map((x) => x.id), "wall type", error);
  checkUniqueIds(p.floorTypes.map((x) => x.id), "floor type", error);
  checkUniqueIds(p.columnTypes.map((x) => x.id), "column type", error);
  checkUniqueIds(p.openingTypes.map((x) => x.id), "opening type", error);
  checkUniqueIds(p.walls.map((x) => x.id), "wall", error);
  checkUniqueIds(p.openings.map((x) => x.id), "opening", error);
  checkUniqueIds(p.floors.map((x) => x.id), "floor", error);
  checkUniqueIds(p.rooms.map((x) => x.id), "room", error);
  checkUniqueIds(p.columns.map((x) => x.id), "column", error);
  checkUniqueIds(p.ceilingTypes.map((x) => x.id), "ceiling type", error);
  checkUniqueIds(p.roofTypes.map((x) => x.id), "roof type", error);
  checkUniqueIds(p.ceilings.map((x) => x.id), "ceiling", error);
  checkUniqueIds(p.roofs.map((x) => x.id), "roof", error);

  if (p.levels.length === 0) error("no-levels", "A project must keep at least one level.");
  for (const level of p.levels) {
    if (level.name.trim() === "") error("level-name", "Level names cannot be empty.", level.id);
    if (!isInt(level.elevation)) error("level-elevation", `${level.name} needs a whole-millimetre elevation.`, level.id);
  }
  const elevations = new Map<number, string>();
  for (const level of p.levels) {
    const other = elevations.get(level.elevation);
    if (other !== undefined) warning("level-elevation-shared", `${level.name} shares an elevation with another level.`, level.id);
    elevations.set(level.elevation, level.name);
  }

  if (p.materials.length === 0) error("no-materials", "A project must keep at least one material.");
  for (const material of p.materials) {
    if (material.name.trim() === "") error("material-name", "Material names cannot be empty.", material.id);
    if (!COLOR_PATTERN.test(material.color)) {
      error("material-color", `${material.name} needs a colour like "#a1b2c3".`, material.id);
    }
  }

  for (const type of p.wallTypes) {
    if (type.name.trim() === "") error("wall-type-name", "Wall type names cannot be empty.", type.id);
    if (!isInt(type.thickness) || type.thickness <= 0) {
      error("wall-thickness", `${type.name} needs a positive whole-millimetre thickness.`, type.id);
    }
    if (!materialById(p, type.materialId)) error("wall-type-material", `${type.name} refers to a missing material.`, type.id);
  }

  for (const type of p.floorTypes) {
    if (type.name.trim() === "") error("floor-type-name", "Floor type names cannot be empty.", type.id);
    if (!isInt(type.thickness) || type.thickness <= 0) {
      error("floor-thickness", `${type.name} needs a positive whole-millimetre thickness.`, type.id);
    }
    if (!materialById(p, type.materialId)) error("floor-type-material", `${type.name} refers to a missing material.`, type.id);
  }

  for (const type of p.columnTypes) {
    if (type.name.trim() === "") error("column-type-name", "Column type names cannot be empty.", type.id);
    if (!isInt(type.width) || type.width <= 0) {
      error("column-width", `${type.name} needs a positive whole-millimetre width.`, type.id);
    }
    if (!isInt(type.depth) || type.depth <= 0) {
      error("column-depth", `${type.name} needs a positive whole-millimetre depth.`, type.id);
    }
    if (!materialById(p, type.materialId)) error("column-type-material", `${type.name} refers to a missing material.`, type.id);
  }

  for (const type of p.openingTypes) {
    if (type.kind !== "door" && type.kind !== "window") error("opening-kind", `${type.name} has an unknown kind.`, type.id);
    if (!isInt(type.width) || type.width <= 0) error("opening-width", `${type.name} needs a positive width.`, type.id);
    if (!isInt(type.height) || type.height <= 0) error("opening-height", `${type.name} needs a positive height.`, type.id);
    if (!isInt(type.sillHeight) || type.sillHeight < 0) error("opening-sill", `${type.name} needs a sill height of 0 or more.`, type.id);
    if (type.kind === "door" && type.sillHeight !== 0) error("door-sill", `${type.name}: doors must have a zero sill height.`, type.id);
  }

  for (const wall of p.walls) {
    const label = `Wall ${wall.id}`;
    if (!levelById(p, wall.levelId)) error("wall-level", `${label} refers to a missing level.`, wall.id);
    if (!wallTypeById(p, wall.wallTypeId)) error("wall-type", `${label} refers to a missing wall type.`, wall.id);
    if (!isInt(wall.start.x) || !isInt(wall.start.y) || !isInt(wall.end.x) || !isInt(wall.end.y)) {
      error("wall-geometry", `${label} needs whole-millimetre endpoints.`, wall.id);
    } else if (distanceMm(wall.start, wall.end) < MIN_WALL_LENGTH_MM) {
      error("wall-too-short", `A wall must be at least ${MIN_WALL_LENGTH_MM} mm long.`, wall.id);
    }
    if (!isInt(wall.height) || wall.height <= 0) error("wall-height", `${label} needs a positive whole-millimetre height.`, wall.id);
  }

  for (const opening of p.openings) {
    const host = wallById(p, opening.hostWallId);
    const type = openingTypeById(p, opening.openingTypeId);
    const name = type ? `${type.name}` : "Opening";
    if (!host) {
      error("opening-host", `${name} refers to a missing wall.`, opening.id);
      continue;
    }
    if (!type) {
      error("opening-type", `${name} refers to a missing opening type.`, opening.id);
      continue;
    }
    if (!isInt(opening.offset)) {
      error("opening-offset", `${name} needs a whole-millimetre offset.`, opening.id);
      continue;
    }
    // Doubled coordinates keep the fit check in integer arithmetic.
    const length = distanceMm(host.start, host.end);
    if (2 * opening.offset - type.width < 0 || 2 * opening.offset + type.width > 2 * length + 1e-9) {
      error("opening-outside-wall", `${name} would fall outside its host wall.`, opening.id);
    }
    if (type.sillHeight + type.height > host.height) {
      error("opening-above-wall", `${name} is taller than its host wall.`, opening.id);
    }
  }

  // Openings in the same wall must not overlap. Compare doubled intervals [2o - w, 2o + w].
  const byHost = new Map<string, typeof p.openings>();
  for (const opening of p.openings) {
    const list = byHost.get(opening.hostWallId) ?? [];
    list.push(opening);
    byHost.set(opening.hostWallId, list);
  }
  for (const [hostId, list] of byHost) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const ta = openingTypeById(p, a.openingTypeId);
        const tb = openingTypeById(p, b.openingTypeId);
        if (!ta || !tb) continue;
        const aStart = 2 * a.offset - ta.width;
        const aEnd = 2 * a.offset + ta.width;
        const bStart = 2 * b.offset - tb.width;
        const bEnd = 2 * b.offset + tb.width;
        if (aStart < bEnd && bStart < aEnd) {
          error("opening-overlap", "Doors and windows in the same wall cannot overlap.", hostId);
        }
      }
    }
  }

  for (const floor of p.floors) {
    const label = `Floor ${floor.id}`;
    if (!levelById(p, floor.levelId)) error("floor-level", `${label} refers to a missing level.`, floor.id);
    if (!floorTypeById(p, floor.floorTypeId)) error("floor-type", `${label} refers to a missing floor type.`, floor.id);
    const boundaryMessage = boundaryError(floor.boundary);
    if (boundaryMessage) error("floor-boundary", `${label}: ${boundaryMessage}`, floor.id);
  }

  for (const room of p.rooms) {
    const label = room.name.trim() === "" ? `Room ${room.id}` : `Room "${room.name}"`;
    if (!levelById(p, room.levelId)) error("room-level", `${label} refers to a missing level.`, room.id);
    if (room.name.trim() === "") error("room-name", "Room names cannot be empty.", room.id);
    const boundaryMessage = boundaryError(room.boundary);
    if (boundaryMessage) error("room-boundary", `${label}: ${boundaryMessage}`, room.id);
  }

  for (const column of p.columns) {
    const label = `Column ${column.id}`;
    if (!levelById(p, column.levelId)) error("column-level", `${label} refers to a missing level.`, column.id);
    if (!columnTypeById(p, column.columnTypeId)) error("column-type", `${label} refers to a missing column type.`, column.id);
    if (!isInt(column.position.x) || !isInt(column.position.y)) {
      error("column-position", `${label} needs a whole-millimetre position.`, column.id);
    }
    if (!isInt(column.height) || column.height <= 0) {
      error("column-height", `${label} needs a positive whole-millimetre height.`, column.id);
    }
  }

  for (const type of p.ceilingTypes) {
    if (type.name.trim() === "") error("ceiling-type-name", "Ceiling type names cannot be empty.", type.id);
    if (!isInt(type.thickness) || type.thickness <= 0) {
      error("ceiling-thickness", `${type.name} needs a positive whole-millimetre thickness.`, type.id);
    }
    if (!materialById(p, type.materialId)) error("ceiling-type-material", `${type.name} refers to a missing material.`, type.id);
  }

  for (const type of p.roofTypes) {
    if (type.name.trim() === "") error("roof-type-name", "Roof type names cannot be empty.", type.id);
    if (!isInt(type.thickness) || type.thickness <= 0) {
      error("roof-thickness", `${type.name} needs a positive whole-millimetre thickness.`, type.id);
    }
    if (!materialById(p, type.materialId)) error("roof-type-material", `${type.name} refers to a missing material.`, type.id);
  }

  for (const ceiling of p.ceilings) {
    const label = `Ceiling ${ceiling.id}`;
    if (!levelById(p, ceiling.levelId)) error("ceiling-level", `${label} refers to a missing level.`, ceiling.id);
    if (!ceilingTypeById(p, ceiling.ceilingTypeId)) error("ceiling-type", `${label} refers to a missing ceiling type.`, ceiling.id);
    const boundaryMessage = boundaryError(ceiling.boundary);
    if (boundaryMessage) error("ceiling-boundary", `${label}: ${boundaryMessage}`, ceiling.id);
    if (!isInt(ceiling.height) || ceiling.height <= 0) {
      error("ceiling-height", `${label} needs a positive whole-millimetre height.`, ceiling.id);
    }
  }

  for (const roof of p.roofs) {
    const label = `Roof ${roof.id}`;
    if (!levelById(p, roof.levelId)) error("roof-level", `${label} refers to a missing level.`, roof.id);
    if (!roofTypeById(p, roof.roofTypeId)) error("roof-type", `${label} refers to a missing roof type.`, roof.id);
    const boundaryMessage = rectangleError(roof.boundary);
    if (boundaryMessage) error("roof-boundary", `${label}: ${boundaryMessage}`, roof.id);
    if (!isInt(roof.overhang) || roof.overhang < 0) {
      error("roof-overhang", `${label} needs a whole-millimetre overhang of 0 or more.`, roof.id);
    }
    if (!isInt(roof.rise) || roof.rise <= 0) {
      error("roof-rise", `${label} needs a positive whole-millimetre rise.`, roof.id);
    }
  }

  return issues;
}

function checkUniqueIds(ids: string[], label: string, error: (code: string, message: string, id?: string) => void) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id === "") error("id", `Every ${label} needs an id.`);
    else if (seen.has(id)) error("duplicate-id", `Duplicate ${label} id: ${id}.`, id);
    seen.add(id);
  }
}

export function firstError(p: Project): string | null {
  const issue = validateProject(p).find((i) => i.severity === "error");
  return issue ? issue.message : null;
}
