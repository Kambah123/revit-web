import { MIN_WALL_LENGTH_MM, distanceMm } from "./geometry";
import { levelById, openingTypeById, wallById, wallTypeById } from "./project";
import type { Project } from "./types";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  entityId?: string;
}

const isInt = (v: number) => Number.isSafeInteger(v);

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

  if (p.schemaVersion !== 2) error("schema", `Unsupported schema version ${String(p.schemaVersion)}.`);
  if (p.units?.length !== "mm") error("units", "Project length unit must be millimetres.");
  if (!isInt(p.revision) || p.revision < 0) error("revision", "Revision must be a non-negative integer.");

  checkUniqueIds(p.levels.map((x) => x.id), "level", error);
  checkUniqueIds(p.wallTypes.map((x) => x.id), "wall type", error);
  checkUniqueIds(p.openingTypes.map((x) => x.id), "opening type", error);
  checkUniqueIds(p.walls.map((x) => x.id), "wall", error);
  checkUniqueIds(p.openings.map((x) => x.id), "opening", error);

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

  for (const type of p.wallTypes) {
    if (type.name.trim() === "") error("wall-type-name", "Wall type names cannot be empty.", type.id);
    if (!isInt(type.thickness) || type.thickness <= 0) {
      error("wall-thickness", `${type.name} needs a positive whole-millimetre thickness.`, type.id);
    }
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
