/**
 * Runtime validation for the AI DesignPlan. This is the authoritative check between DeepSeek's
 * untrusted json and the canonical model: nothing reaches `src/model/commands.ts` unless it parses
 * here. Lengths are converted to integer millimetres during parsing (unit conversion is explicit
 * and tested in aiUnits.test.ts); geometry fit is re-checked by the command layer on apply.
 */

import {
  parseLengthMm,
  describeMm,
  DimensionError,
  roundToMm,
} from "./units";
import {
  PLAN_OP_KINDS,
  type Clarification,
  type DesignPlan,
  type ElementRef,
  type PlanOpKind,
  type PlanOperation,
  type PlanPoint,
  type UnsupportedFeature,
} from "./planTypes";

export { PLAN_OP_KINDS };

export type PlanParseResult = { ok: true; plan: DesignPlan } | { ok: false; errors: string[] };

export const MAX_PLAN_OPERATIONS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Collector {
  errors: string[] = [];
  add(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }
}

function str(value: unknown, path: string, c: Collector, options: { max?: number; allowEmpty?: boolean } = {}): string | null {
  if (typeof value !== "string") {
    c.add(path, "must be a string");
    return null;
  }
  const text = value.trim();
  if (text === "" && !options.allowEmpty) {
    c.add(path, "must not be empty");
    return null;
  }
  if (text.length > (options.max ?? 200)) {
    c.add(path, `must be at most ${options.max ?? 200} characters`);
    return null;
  }
  return text;
}

function parseRef(value: unknown, path: string, c: Collector): ElementRef | null {
  if (!isRecord(value)) {
    c.add(path, 'must be a reference object like {"id": "..."} , {"opId": "..."} or {"name": "..."}');
    return null;
  }
  const entries = (["id", "opId", "name"] as const).filter((key) => value[key] !== undefined);
  if (entries.length !== 1) {
    c.add(path, 'must set exactly one of "id", "opId" or "name"');
    return null;
  }
  const key = entries[0];
  const text = str(value[key], `${path}.${key}`, c);
  if (text === null) return null;
  return { [key]: text };
}

function parseLengthField(value: unknown, path: string, c: Collector, opts: { min?: number; max?: number } = {}): number | null {
  if (value === undefined || value === null) return null;
  try {
    const mm = parseLengthMm(value as number | string, path);
    if (opts.min !== undefined && mm < opts.min) {
      c.add(path, `must be at least ${opts.min} mm (got ${mm} mm)`);
      return null;
    }
    if (opts.max !== undefined && mm > opts.max) {
      c.add(path, `must be at most ${opts.max} mm (got ${mm} mm)`);
      return null;
    }
    return mm;
  } catch (error) {
    c.add(path, error instanceof DimensionError ? error.message : "is not a valid length");
    return null;
  }
}

function parsePoint(value: unknown, path: string, c: Collector): PlanPoint | null {
  if (!isRecord(value)) {
    c.add(path, 'must be a point like {"x": 0, "y": 0}');
    return null;
  }
  const x = parseLengthField(value.x, `${path}.x`, c, { min: -50_000_000, max: 50_000_000 });
  const y = parseLengthField(value.y, `${path}.y`, c, { min: -50_000_000, max: 50_000_000 });
  if (x === null || y === null) return null;
  // Normalised to integer millimetres.
  return { x: roundToMm(x), y: roundToMm(y) };
}

function parseBoundary(value: unknown, path: string, c: Collector): PlanPoint[] | null {
  if (!Array.isArray(value)) {
    c.add(path, "must be an array of at least 3 points");
    return null;
  }
  if (value.length < 3 || value.length > 200) {
    c.add(path, `must have 3..200 points (got ${value.length})`);
    return null;
  }
  const points: PlanPoint[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const point = parsePoint(value[i], `${path}[${i}]`, c);
    if (point === null) return null;
    points.push(point);
  }
  return points;
}

function optionalStringArray(value: unknown, path: string, c: Collector): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    c.add(path, "must be an array of strings");
    return null;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const text = str(value[i], `${path}[${i}]`, c, { max: 500, allowEmpty: true });
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

function parseClarifications(value: unknown, path: string, c: Collector): Clarification[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    c.add(path, "must be an array");
    return null;
  }
  const out: Clarification[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    const p = `${path}[${i}]`;
    if (!isRecord(item)) {
      c.add(p, 'must be an object like {"question": "..."}');
      return null;
    }
    const question = str(item.question, `${p}.question`, c, { max: 500 });
    if (question === null) return null;
    const options = optionalStringArray(item.options, `${p}.options`, c);
    if (options === null) return null;
    out.push(options.length > 0 ? { question, options } : { question });
  }
  return out;
}

function parseUnsupported(value: unknown, path: string, c: Collector): UnsupportedFeature[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    c.add(path, "must be an array");
    return null;
  }
  const out: UnsupportedFeature[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    const p = `${path}[${i}]`;
    if (!isRecord(item)) {
      c.add(p, 'must be an object like {"request": "...", "reason": "..."}');
      return null;
    }
    const request = str(item.request, `${p}.request`, c, { max: 500 });
    const reason = str(item.reason, `${p}.reason`, c, { max: 500 });
    if (request === null || reason === null) return null;
    if (item.alternative === undefined) {
      out.push({ request, reason });
    } else {
      const alternative = str(item.alternative, `${p}.alternative`, c, { max: 500 });
      if (alternative === null) return null;
      out.push({ request, reason, alternative });
    }
  }
  return out;
}

/** Parses one operation. Returns the typed op (lengths normalised to integer mm) or null. */
function parseOperation(raw: unknown, path: string, c: Collector): PlanOperation | null {
  if (!isRecord(raw)) {
    c.add(path, "must be an object");
    return null;
  }
  const op = raw.op;
  if (typeof op !== "string" || !(PLAN_OP_KINDS as readonly string[]).includes(op)) {
    c.add(`${path}.op`, `unknown operation "${String(op)}". Supported: ${PLAN_OP_KINDS.join(", ")}`);
    return null;
  }
  const before = c.errors.length;
  const result: Record<string, unknown> = { op };

  const ref = (key: string, required: boolean): void => {
    const value = raw[key];
    if (value === undefined) {
      if (required) c.add(`${path}.${key}`, "is required");
      return;
    }
    const parsed = parseRef(value, `${path}.${key}`, c);
    if (parsed) result[key] = parsed;
  };
  const length = (key: string, opts: { min?: number; max?: number; required?: boolean } = {}): void => {
    const value = raw[key];
    if (value === undefined) {
      if (opts.required) c.add(`${path}.${key}`, "is required");
      return;
    }
    const parsed = parseLengthField(value, `${path}.${key}`, c, opts);
    if (parsed !== null) result[key] = parsed;
  };
  const text = (key: string, opts: { required?: boolean; max?: number } = {}): void => {
    const value = raw[key];
    if (value === undefined) {
      if (opts.required) c.add(`${path}.${key}`, "is required");
      return;
    }
    const parsed = str(value, `${path}.${key}`, c, { max: opts.max });
    if (parsed !== null) result[key] = parsed;
  };
  const boundary = (key: string, required: boolean): void => {
    const value = raw[key];
    if (value === undefined) {
      if (required) c.add(`${path}.${key}`, "is required");
      return;
    }
    const parsed = parseBoundary(value, `${path}.${key}`, c);
    if (parsed) result[key] = parsed;
  };
  const point = (key: string, required: boolean): void => {
    const value = raw[key];
    if (value === undefined) {
      if (required) c.add(`${path}.${key}`, "is required");
      return;
    }
    const parsed = parsePoint(value, `${path}.${key}`, c);
    if (parsed) result[key] = parsed;
  };

  if (raw.opId !== undefined) {
    const parsed = str(raw.opId, `${path}.opId`, c, { max: 64 });
    if (parsed !== null) result.opId = parsed;
  }

  switch (op as PlanOpKind) {
    case "level.add":
      text("name", { required: true });
      length("elevation", { required: true });
      break;
    case "level.rename":
      ref("level", true);
      text("name", { required: true });
      break;
    case "level.setElevation":
      ref("level", true);
      length("elevation", { required: true });
      break;
    case "level.delete":
      ref("level", true);
      break;
    case "wallType.add":
      text("name", { required: true });
      length("thickness", { required: true, min: 1, max: 5000 });
      break;
    case "wall.add":
      ref("level", true);
      point("start", true);
      point("end", true);
      length("height", { min: 100, max: 100_000 });
      ref("wallType", false);
      break;
    case "wall.update":
      ref("wall", true);
      point("start", false);
      point("end", false);
      length("height", { min: 100, max: 100_000 });
      ref("wallType", false);
      break;
    case "wall.delete":
      ref("wall", true);
      break;
    case "opening.add": {
      ref("hostWall", true);
      ref("openingType", false);
      length("offset", { required: true, min: 0, max: 200_000 });
      length("width", { min: 100, max: 10_000 });
      length("height", { min: 100, max: 10_000 });
      length("sillHeight", { min: 0, max: 10_000 });
      const kind = raw.kind;
      if (kind !== "door" && kind !== "window") {
        c.add(`${path}.kind`, 'must be "door" or "window"');
      } else {
        result.kind = kind;
        if (kind === "door" && typeof raw.sillHeight === "number" && raw.sillHeight > 0) {
          c.add(`${path}.sillHeight`, "doors must have sill height 0");
        }
      }
      break;
    }
    case "opening.update":
      ref("opening", true);
      ref("openingType", false);
      length("offset", { min: 0, max: 200_000 });
      break;
    case "opening.delete":
      ref("opening", true);
      break;
    case "floor.add":
      ref("level", true);
      ref("floorType", false);
      boundary("boundary", true);
      break;
    case "floor.update":
      ref("floor", true);
      ref("level", false);
      ref("floorType", false);
      boundary("boundary", false);
      break;
    case "floor.delete":
      ref("floor", true);
      break;
    case "room.add":
      ref("level", true);
      text("name", { required: true });
      text("number", { max: 32 });
      boundary("boundary", true);
      break;
    case "room.update":
      ref("room", true);
      ref("level", false);
      text("name", { max: 100 });
      text("number", { max: 32 });
      boundary("boundary", false);
      break;
    case "room.delete":
      ref("room", true);
      break;
    case "column.add":
      ref("level", true);
      ref("columnType", false);
      point("position", true);
      length("height", { min: 100, max: 100_000 });
      break;
    case "column.update":
      ref("column", true);
      ref("columnType", false);
      point("position", false);
      length("height", { min: 100, max: 100_000 });
      break;
    case "column.delete":
      ref("column", true);
      break;
    case "ceiling.add":
      ref("level", true);
      ref("ceilingType", false);
      boundary("boundary", true);
      length("height", { min: 100, max: 100_000 });
      break;
    case "ceiling.update":
      ref("ceiling", true);
      ref("ceilingType", false);
      boundary("boundary", false);
      length("height", { min: 100, max: 100_000 });
      break;
    case "ceiling.delete":
      ref("ceiling", true);
      break;
    case "roof.add":
      ref("level", true);
      ref("roofType", false);
      boundary("boundary", true);
      length("overhang", { min: 0, max: 10_000 });
      length("rise", { min: 1, max: 50_000 });
      break;
    case "roof.update":
      ref("roof", true);
      ref("roofType", false);
      boundary("boundary", false);
      length("overhang", { min: 0, max: 10_000 });
      length("rise", { min: 1, max: 50_000 });
      break;
    case "roof.delete":
      ref("roof", true);
      break;
    case "view.open": {
      const view = raw.view;
      if (view !== "plan" && view !== "3d" && view !== "elevation") {
        c.add(`${path}.view`, 'must be "plan", "3d" or "elevation"');
      } else {
        result.view = view;
        if (view === "plan") {
          ref("level", true);
        }
        if (view === "elevation") {
          const direction = raw.direction;
          if (direction !== "north" && direction !== "south" && direction !== "east" && direction !== "west") {
            c.add(`${path}.direction`, 'must be "north", "south", "east" or "west"');
          } else {
            result.direction = direction;
          }
        }
      }
      break;
    }
  }

  if (c.errors.length > before) return null;
  return result as unknown as PlanOperation;
}

/**
 * Parses and validates an untrusted plan-shaped value (a raw model response or a server payload).
 * Accepts either a bare plan object or a `{ plan: ... }` wrapper. Never throws.
 */
export function parseDesignPlan(input: unknown): PlanParseResult {
  const c = new Collector();
  let raw: unknown = input;
  if (isRecord(raw) && raw.plan !== undefined && !Array.isArray(raw.operations)) {
    raw = raw.plan;
  }
  if (!isRecord(raw)) {
    return { ok: false, errors: ["plan: must be a json object"] };
  }

  if (raw.kind !== undefined && raw.kind !== "design-plan") {
    return { ok: false, errors: [`plan.kind: must be "design-plan" (got ${JSON.stringify(raw.kind)})`] };
  }
  if (raw.version !== undefined && raw.version !== 1) {
    return { ok: false, errors: [`plan.version: unsupported plan version ${JSON.stringify(raw.version)}`] };
  }
  if (!Array.isArray(raw.operations)) {
    return { ok: false, errors: ['plan.operations: must be an array (a plan without operations cannot be applied)'] };
  }
  if (raw.operations.length > MAX_PLAN_OPERATIONS) {
    return { ok: false, errors: [`plan.operations: must have at most ${MAX_PLAN_OPERATIONS} operations (got ${raw.operations.length})`] };
  }

  const summary = raw.summary === undefined ? "AI proposed changes." : str(raw.summary, "plan.summary", c, { max: 500 });
  const assumptions = optionalStringArray(raw.assumptions, "plan.assumptions", c);
  const clarifications = parseClarifications(raw.clarifications, "plan.clarifications", c);
  const unsupported = parseUnsupported(raw.unsupported, "plan.unsupported", c);
  if (summary === null || assumptions === null || clarifications === null || unsupported === null) {
    return { ok: false, errors: c.errors };
  }

  const operations: PlanOperation[] = [];
  const seenOpIds = new Set<string>();
  for (let i = 0; i < raw.operations.length; i += 1) {
    const parsed = parseOperation(raw.operations[i], `plan.operations[${i}]`, c);
    if (parsed === null) continue;
    const opId = (parsed as { opId?: string }).opId;
    if (opId !== undefined) {
      if (seenOpIds.has(opId)) {
        c.add(`plan.operations[${i}].opId`, `duplicate opId "${opId}"`);
        continue;
      }
      seenOpIds.add(opId);
    }
    operations.push(parsed);
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  return {
    ok: true,
    plan: {
      kind: "design-plan",
      version: 1,
      summary,
      assumptions,
      clarifications,
      unsupported,
      operations,
    },
  };
}

function refLabel(ref: ElementRef | undefined): string {
  if (!ref) return "?";
  return ref.name ?? ref.opId ?? ref.id ?? "?";
}

function pointLabel(p: PlanPoint): string {
  return `(${describeMm(parseLengthMm(p.x))}, ${describeMm(parseLengthMm(p.y))})`;
}

/** Human-readable one-line label for an operation, used in the plan preview list. */
export function describeOperation(op: PlanOperation): string {
  switch (op.op) {
    case "level.add":
      return `Add level "${op.name}" at ${describeMm(parseLengthMm(op.elevation))}`;
    case "level.rename":
      return `Rename level ${refLabel(op.level)} to "${op.name}"`;
    case "level.setElevation":
      return `Move level ${refLabel(op.level)} to ${describeMm(parseLengthMm(op.elevation))}`;
    case "level.delete":
      return `Delete level ${refLabel(op.level)}`;
    case "wallType.add":
      return `Add wall type "${op.name}" (${describeMm(parseLengthMm(op.thickness))} thick)`;
    case "wall.add":
      return `Add wall ${pointLabel(op.start)} → ${pointLabel(op.end)} on ${refLabel(op.level)}`;
    case "wall.update":
      return `Edit wall ${refLabel(op.wall)}`;
    case "wall.delete":
      return `Delete wall ${refLabel(op.wall)}`;
    case "opening.add":
      return `Add ${op.kind} in wall ${refLabel(op.hostWall)} at ${describeMm(parseLengthMm(op.offset))} from its start`;
    case "opening.update":
      return `Edit ${"opening"} ${refLabel(op.opening)}`;
    case "opening.delete":
      return `Delete opening ${refLabel(op.opening)}`;
    case "floor.add":
      return `Add floor on ${refLabel(op.level)}`;
    case "floor.update":
      return `Edit floor ${refLabel(op.floor)}`;
    case "floor.delete":
      return `Delete floor ${refLabel(op.floor)}`;
    case "room.add":
      return `Add room "${op.name}" on ${refLabel(op.level)}`;
    case "room.update":
      return `Edit room ${refLabel(op.room)}`;
    case "room.delete":
      return `Delete room ${refLabel(op.room)}`;
    case "column.add":
      return `Add column at ${pointLabel(op.position)} on ${refLabel(op.level)}`;
    case "column.update":
      return `Edit column ${refLabel(op.column)}`;
    case "column.delete":
      return `Delete column ${refLabel(op.column)}`;
    case "ceiling.add":
      return `Add ceiling on ${refLabel(op.level)}`;
    case "ceiling.update":
      return `Edit ceiling ${refLabel(op.ceiling)}`;
    case "ceiling.delete":
      return `Delete ceiling ${refLabel(op.ceiling)}`;
    case "roof.add":
      return `Add hip roof on ${refLabel(op.level)}${op.overhang !== undefined ? `, overhang ${describeMm(parseLengthMm(op.overhang))}` : ""}`;
    case "roof.update":
      return `Edit roof ${refLabel(op.roof)}`;
    case "roof.delete":
      return `Delete roof ${refLabel(op.roof)}`;
    case "view.open":
      return op.view === "elevation"
        ? `Open ${op.direction} elevation`
        : op.view === "plan"
          ? `Open plan of ${refLabel(op.level)}`
          : "Open 3D view";
  }
}

/** True when a plan is small and non-destructive enough for a one-click quick apply. */
export function isQuickApply(plan: DesignPlan): boolean {
  if (plan.operations.length === 0 || plan.operations.length > 3) return false;
  return plan.operations.every((op) => !op.op.endsWith(".delete") && op.op !== "level.setElevation");
}
