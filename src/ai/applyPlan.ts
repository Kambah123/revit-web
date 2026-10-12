/**
 * Transactional executor: applies a validated DesignPlan to the canonical model **through the
 * existing command layer** (`src/model/commands.ts`), never by writing entities directly.
 *
 * Atomicity: operations run in order on a working copy; the first failure aborts the whole plan and
 * the caller keeps the original project (no partial application, no corrupted model). Every outcome
 * is reported so the UI can show exactly what ran and what failed.
 *
 * Applied operations are genuine BIM edits: they pass whole-project validation, keep stable element
 * identities on updates, regenerate derived geometry/views via the normal render path, and are
 * committed to undo/redo as a single history entry by the caller.
 */

import {
  addCeiling,
  addColumn,
  addFloor,
  addLevel,
  addOpening,
  addOpeningType,
  addRoof,
  addRoom,
  addWall,
  addWallType,
  deleteCeiling,
  deleteColumn,
  deleteFloor,
  deleteLevel,
  deleteOpening,
  deleteRoof,
  deleteRoom,
  deleteWall,
  renameLevel,
  setLevelElevation,
  updateCeiling,
  updateColumn,
  updateFloor,
  updateOpening,
  updateRoof,
  updateRoom,
  updateWall,
} from "../model/commands";
import {
  ceilingTypeById,
  columnTypeById,
  floorTypeById,
  levelById,
  openingTypeById,
  roofTypeById,
  wallTypeById,
} from "../model/project";
import type { OpeningKind, Point, Polygon, Project } from "../model/types";
import { describeOperation } from "./planSchema";
import type { DesignPlan, ElementRef, PlanOperation, PlanPoint } from "./planTypes";
import { parseLengthMm } from "./units";

export type ViewRequest =
  | { view: "plan"; levelId: string }
  | { view: "3d" }
  | { view: "elevation"; direction: "north" | "south" | "east" | "west" };

export interface OpOutcome {
  index: number;
  op: string;
  label: string;
  status: "ok" | "error";
  detail?: string;
  /** Id of the element this operation created (for selection and later opId references). */
  createdId?: string;
}

export interface ApplyResult {
  ok: boolean;
  /** True when at least one operation modified the model. */
  changed: boolean;
  /** The resulting project when `ok`; the untouched input project when not. */
  project: Project;
  outcomes: OpOutcome[];
  views: ViewRequest[];
  /** Ids of elements created by the plan, in creation order. */
  createdIds: string[];
  /** First failure summary when `ok` is false. */
  error?: string;
}

type EntityKind =
  | "level"
  | "wallType"
  | "wall"
  | "opening"
  | "openingType"
  | "floorType"
  | "floor"
  | "room"
  | "columnType"
  | "column"
  | "ceilingType"
  | "ceiling"
  | "roofType"
  | "roof";

interface Created {
  kind: EntityKind;
  id: string;
}

class PlanApplyError extends Error {}

function findById(p: Project, kind: EntityKind, id: string): { id: string; name?: string } | undefined {
  switch (kind) {
    case "level":
      return levelById(p, id);
    case "wallType":
      return wallTypeById(p, id);
    case "wall":
      return p.walls.find((w) => w.id === id);
    case "opening":
      return p.openings.find((o) => o.id === id);
    case "openingType":
      return openingTypeById(p, id);
    case "floorType":
      return floorTypeById(p, id);
    case "floor":
      return p.floors.find((f) => f.id === id);
    case "room":
      return p.rooms.find((r) => r.id === id);
    case "columnType":
      return columnTypeById(p, id);
    case "column":
      return p.columns.find((c) => c.id === id);
    case "ceilingType":
      return ceilingTypeById(p, id);
    case "ceiling":
      return p.ceilings.find((c) => c.id === id);
    case "roofType":
      return roofTypeById(p, id);
    case "roof":
      return p.roofs.find((r) => r.id === id);
  }
}

function findByName(p: Project, kind: EntityKind, name: string): { id: string } | undefined {
  const lower = name.trim().toLowerCase();
  const match = (list: { id: string; name: string }[]) => list.find((x) => x.name.trim().toLowerCase() === lower);
  switch (kind) {
    case "level":
      return match(p.levels);
    case "wallType":
      return match(p.wallTypes);
    case "openingType":
      return match(p.openingTypes);
    case "floorType":
      return match(p.floorTypes);
    case "columnType":
      return match(p.columnTypes);
    case "ceilingType":
      return match(p.ceilingTypes);
    case "roofType":
      return match(p.roofTypes);
    case "room":
      return match(p.rooms);
    default:
      return undefined;
  }
}

function resolveRef(p: Project, created: Map<string, Created>, ref: ElementRef, kind: EntityKind): string {
  if (ref.opId !== undefined) {
    const entry = created.get(ref.opId);
    if (!entry) throw new PlanApplyError(`references unknown opId "${ref.opId}" (only operations earlier in the same plan can be referenced)`);
    if (entry.kind !== kind) {
      throw new PlanApplyError(`opId "${ref.opId}" is a ${entry.kind}, but a ${kind} is required here`);
    }
    return entry.id;
  }
  if (ref.id !== undefined) {
    const found = findById(p, kind, ref.id);
    if (!found) throw new PlanApplyError(`no ${kind} with id "${ref.id}" exists in the project`);
    return found.id;
  }
  const name = ref.name ?? "";
  const found = findByName(p, kind, name);
  if (!found) throw new PlanApplyError(`no ${kind} named "${name}" exists in the project`);
  return found.id;
}

function point(p: PlanPoint): Point {
  return { x: parseLengthMm(p.x, "x"), y: parseLengthMm(p.y, "y") };
}

function polygon(points: PlanPoint[]): Polygon {
  return points.map(point);
}

function length(value: number | string | undefined, fallback: number, label: string): number {
  return value === undefined ? fallback : parseLengthMm(value, label);
}

/** Finds or creates an opening type for `opening.add`, honouring explicit type refs. */
function ensureOpeningType(
  p: Project,
  op: Extract<PlanOperation, { op: "opening.add" }>,
  created: Map<string, Created>,
): { project: Project; typeId: string; createdType: boolean } {
  if (op.openingType) {
    return { project: p, typeId: resolveRef(p, created, op.openingType, "openingType"), createdType: false };
  }
  const kind: OpeningKind = op.kind;
  if (op.width !== undefined || op.height !== undefined) {
    const width = length(op.width, kind === "door" ? 900 : 1200, "width");
    const height = length(op.height, kind === "door" ? 2100 : 1200, "height");
    const sill = kind === "door" ? 0 : length(op.sillHeight, 900, "sillHeight");
    const existing = p.openingTypes.find(
      (t) => t.kind === kind && t.width === width && t.height === height && t.sillHeight === sill,
    );
    if (existing) return { project: p, typeId: existing.id, createdType: false };
    const noun = kind === "door" ? "Door" : "Window";
    const result = addOpeningType(p, `${noun} ${width} x ${height}`, kind, width, height, sill);
    return { project: result.project, typeId: result.openingType.id, createdType: true };
  }
  const fallback = p.openingTypes.find((t) => t.kind === kind);
  if (!fallback) throw new PlanApplyError(`the project has no ${kind} type; specify width and height so one can be created`);
  return { project: p, typeId: fallback.id, createdType: false };
}

/**
 * Applies `plan` to `project`. Returns the new project on success; on any failure the returned
 * `project` is the untouched input and `ok` is false — nothing is partially applied.
 */
export function applyPlan(project: Project, plan: DesignPlan): ApplyResult {
  let current = project;
  let changed = false;
  const created = new Map<string, Created>();
  const outcomes: OpOutcome[] = [];
  const views: ViewRequest[] = [];
  const createdIds: string[] = [];

  const remember = (op: PlanOperation, kind: EntityKind, id: string): void => {
    const opId = (op as { opId?: string }).opId;
    if (opId !== undefined) created.set(opId, { kind, id });
    createdIds.push(id);
  };

  for (let index = 0; index < plan.operations.length; index += 1) {
    const op = plan.operations[index];
    const label = describeOperation(op);
    try {
      switch (op.op) {
        case "level.add": {
          const result = addLevel(current, op.name, parseLengthMm(op.elevation, "elevation"));
          current = result.project;
          changed = true;
          remember(op, "level", result.level.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.level.id });
          break;
        }
        case "level.rename": {
          const id = resolveRef(current, created, op.level, "level");
          current = renameLevel(current, id, op.name);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "level.setElevation": {
          const id = resolveRef(current, created, op.level, "level");
          current = setLevelElevation(current, id, parseLengthMm(op.elevation, "elevation"));
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "level.delete": {
          const id = resolveRef(current, created, op.level, "level");
          current = deleteLevel(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "wallType.add": {
          const result = addWallType(current, op.name, parseLengthMm(op.thickness, "thickness"));
          current = result.project;
          changed = true;
          remember(op, "wallType", result.wallType.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.wallType.id });
          break;
        }
        case "wall.add": {
          const levelId = resolveRef(current, created, op.level, "level");
          const wallTypeId = op.wallType ? resolveRef(current, created, op.wallType, "wallType") : undefined;
          const result = addWall(current, levelId, point(op.start), point(op.end), {
            wallTypeId,
            height: op.height === undefined ? undefined : parseLengthMm(op.height, "height"),
          });
          current = result.project;
          changed = true;
          remember(op, "wall", result.wall.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.wall.id });
          break;
        }
        case "wall.update": {
          const id = resolveRef(current, created, op.wall, "wall");
          const patch: Parameters<typeof updateWall>[2] = {};
          if (op.start !== undefined) patch.start = point(op.start);
          if (op.end !== undefined) patch.end = point(op.end);
          if (op.height !== undefined) patch.height = parseLengthMm(op.height, "height");
          if (op.wallType !== undefined) patch.wallTypeId = resolveRef(current, created, op.wallType, "wallType");
          current = updateWall(current, id, patch);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "wall.delete": {
          const id = resolveRef(current, created, op.wall, "wall");
          current = deleteWall(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "opening.add": {
          const hostWallId = resolveRef(current, created, op.hostWall, "wall");
          const ensured = ensureOpeningType(current, op, created);
          current = ensured.project;
          const result = addOpening(current, hostWallId, ensured.typeId, parseLengthMm(op.offset, "offset"));
          current = result.project;
          changed = true;
          remember(op, "opening", result.opening.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.opening.id });
          break;
        }
        case "opening.update": {
          const id = resolveRef(current, created, op.opening, "opening");
          const patch: Parameters<typeof updateOpening>[2] = {};
          if (op.offset !== undefined) patch.offset = parseLengthMm(op.offset, "offset");
          if (op.openingType !== undefined) patch.openingTypeId = resolveRef(current, created, op.openingType, "openingType");
          current = updateOpening(current, id, patch);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "opening.delete": {
          const id = resolveRef(current, created, op.opening, "opening");
          current = deleteOpening(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "floor.add": {
          const levelId = resolveRef(current, created, op.level, "level");
          const floorTypeId = op.floorType ? resolveRef(current, created, op.floorType, "floorType") : current.floorTypes[0]?.id;
          if (!floorTypeId) throw new PlanApplyError("the project has no floor type");
          const result = addFloor(current, levelId, floorTypeId, polygon(op.boundary));
          current = result.project;
          changed = true;
          remember(op, "floor", result.floor.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.floor.id });
          break;
        }
        case "floor.update": {
          const id = resolveRef(current, created, op.floor, "floor");
          const patch: Parameters<typeof updateFloor>[2] = {};
          if (op.level !== undefined) patch.levelId = resolveRef(current, created, op.level, "level");
          if (op.floorType !== undefined) patch.floorTypeId = resolveRef(current, created, op.floorType, "floorType");
          if (op.boundary !== undefined) patch.boundary = polygon(op.boundary);
          current = updateFloor(current, id, patch);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "floor.delete": {
          const id = resolveRef(current, created, op.floor, "floor");
          current = deleteFloor(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "room.add": {
          const levelId = resolveRef(current, created, op.level, "level");
          const result = addRoom(current, levelId, op.name, op.number ?? String(current.rooms.length + 1), polygon(op.boundary));
          current = result.project;
          changed = true;
          remember(op, "room", result.room.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.room.id });
          break;
        }
        case "room.update": {
          const id = resolveRef(current, created, op.room, "room");
          const patch: Parameters<typeof updateRoom>[2] = {};
          if (op.name !== undefined) patch.name = op.name;
          if (op.number !== undefined) patch.number = op.number;
          if (op.level !== undefined) patch.levelId = resolveRef(current, created, op.level, "level");
          if (op.boundary !== undefined) patch.boundary = polygon(op.boundary);
          current = updateRoom(current, id, patch);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "room.delete": {
          const id = resolveRef(current, created, op.room, "room");
          current = deleteRoom(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "column.add": {
          const levelId = resolveRef(current, created, op.level, "level");
          const columnTypeId = op.columnType ? resolveRef(current, created, op.columnType, "columnType") : current.columnTypes[0]?.id;
          if (!columnTypeId) throw new PlanApplyError("the project has no column type");
          const result = addColumn(current, levelId, columnTypeId, point(op.position), {
            height: op.height === undefined ? undefined : parseLengthMm(op.height, "height"),
          });
          current = result.project;
          changed = true;
          remember(op, "column", result.column.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.column.id });
          break;
        }
        case "column.update": {
          const id = resolveRef(current, created, op.column, "column");
          const patch: Parameters<typeof updateColumn>[2] = {};
          if (op.position !== undefined) patch.position = point(op.position);
          if (op.height !== undefined) patch.height = parseLengthMm(op.height, "height");
          if (op.columnType !== undefined) patch.columnTypeId = resolveRef(current, created, op.columnType, "columnType");
          current = updateColumn(current, id, patch);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "column.delete": {
          const id = resolveRef(current, created, op.column, "column");
          current = deleteColumn(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "ceiling.add": {
          const levelId = resolveRef(current, created, op.level, "level");
          const ceilingTypeId = op.ceilingType ? resolveRef(current, created, op.ceilingType, "ceilingType") : current.ceilingTypes[0]?.id;
          if (!ceilingTypeId) throw new PlanApplyError("the project has no ceiling type");
          const result = addCeiling(current, levelId, ceilingTypeId, polygon(op.boundary), {
            height: op.height === undefined ? undefined : parseLengthMm(op.height, "height"),
          });
          current = result.project;
          changed = true;
          remember(op, "ceiling", result.ceiling.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.ceiling.id });
          break;
        }
        case "ceiling.update": {
          const id = resolveRef(current, created, op.ceiling, "ceiling");
          const patch: Parameters<typeof updateCeiling>[2] = {};
          if (op.ceilingType !== undefined) patch.ceilingTypeId = resolveRef(current, created, op.ceilingType, "ceilingType");
          if (op.boundary !== undefined) patch.boundary = polygon(op.boundary);
          if (op.height !== undefined) patch.height = parseLengthMm(op.height, "height");
          current = updateCeiling(current, id, patch);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "ceiling.delete": {
          const id = resolveRef(current, created, op.ceiling, "ceiling");
          current = deleteCeiling(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "roof.add": {
          const levelId = resolveRef(current, created, op.level, "level");
          const roofTypeId = op.roofType ? resolveRef(current, created, op.roofType, "roofType") : current.roofTypes[0]?.id;
          if (!roofTypeId) throw new PlanApplyError("the project has no roof type");
          const result = addRoof(current, levelId, roofTypeId, polygon(op.boundary), {
            overhang: op.overhang === undefined ? undefined : parseLengthMm(op.overhang, "overhang"),
            rise: op.rise === undefined ? undefined : parseLengthMm(op.rise, "rise"),
          });
          current = result.project;
          changed = true;
          remember(op, "roof", result.roof.id);
          outcomes.push({ index, op: op.op, label, status: "ok", createdId: result.roof.id });
          break;
        }
        case "roof.update": {
          const id = resolveRef(current, created, op.roof, "roof");
          const patch: Parameters<typeof updateRoof>[2] = {};
          if (op.level !== undefined) patch.levelId = resolveRef(current, created, op.level, "level");
          if (op.roofType !== undefined) patch.roofTypeId = resolveRef(current, created, op.roofType, "roofType");
          if (op.boundary !== undefined) patch.boundary = polygon(op.boundary);
          if (op.overhang !== undefined) patch.overhang = parseLengthMm(op.overhang, "overhang");
          if (op.rise !== undefined) patch.rise = parseLengthMm(op.rise, "rise");
          current = updateRoof(current, id, patch);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "roof.delete": {
          const id = resolveRef(current, created, op.roof, "roof");
          current = deleteRoof(current, id);
          changed = true;
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
        case "view.open": {
          if (op.view === "3d") {
            views.push({ view: "3d" });
          } else if (op.view === "elevation") {
            if (!op.direction) throw new PlanApplyError("elevation views need a direction");
            views.push({ view: "elevation", direction: op.direction });
          } else {
            const levelId = resolveRef(current, created, op.level ?? {}, "level");
            views.push({ view: "plan", levelId });
          }
          outcomes.push({ index, op: op.op, label, status: "ok" });
          break;
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      outcomes.push({ index, op: op.op, label, status: "error", detail });
      return {
        ok: false,
        changed: false,
        project,
        outcomes,
        views: [],
        createdIds: [],
        error: `Operation ${index + 1} of ${plan.operations.length} failed (${label}): ${detail}`,
      };
    }
  }

  return { ok: true, changed, project: current, outcomes, views, createdIds };
}
