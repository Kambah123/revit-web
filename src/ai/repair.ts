/**
 * Automatic repair loop for the AI Architect.
 *
 * The model's json is rejected by a deterministic validator in two places: `planSchema.ts` (shape)
 * and `applyPlan.ts` (geometry against the real model). Previously a rejection was a dead end for
 * the user. Instead, the validator's own messages are now fed back to the model once, with the json
 * that produced them, and the corrected plan replaces the failed one in place.
 *
 * This module is deliberately free of React and of the model: the request function and the dry-run
 * preview are injected, so the loop is unit-testable without a browser or an API key.
 */

import type { ApplyResult } from "./applyPlan";
import type { PlanRequestBody, PlanRequestResult, RepairPayload, TokenUsage } from "./apiClient";
import { parseDesignPlan } from "./planSchema";
import type { DesignPlan } from "./planTypes";

/** How many extra requests a single user message may trigger to fix its own output. */
export const MAX_AUTO_REPAIRS = 1;
/** Repair feedback is bounded: the model gets the first failures, not an unbounded error dump. */
export const MAX_REPAIR_ERRORS = 12;
export const MAX_REPAIR_ERROR_CHARS = 300;

export interface UsageTotals {
  requests: number;
  prompt: number;
  completion: number;
  total: number;
}

export const EMPTY_USAGE: UsageTotals = { requests: 0, prompt: 0, completion: 0, total: 0 };

/** Counts one request and adds its token usage (a request with no usage object still counts). */
export function addUsage(totals: UsageTotals, usage: TokenUsage | null): UsageTotals {
  return {
    requests: totals.requests + 1,
    prompt: totals.prompt + (usage?.prompt ?? 0),
    completion: totals.completion + (usage?.completion ?? 0),
    total: totals.total + (usage?.total ?? 0),
  };
}

/** Adds one outcome's usage to a session total. */
export function mergeUsage(totals: UsageTotals, delta: UsageTotals): UsageTotals {
  return {
    requests: totals.requests + delta.requests,
    prompt: totals.prompt + delta.prompt,
    completion: totals.completion + delta.completion,
    total: totals.total + delta.total,
  };
}

/** Bounds, trims and de-duplicates validator messages before they are echoed to the model. */
export function boundRepairErrors(errors: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of errors) {
    const text = String(raw).replace(/\s+/g, " ").trim().slice(0, MAX_REPAIR_ERROR_CHARS);
    if (text === "" || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= MAX_REPAIR_ERRORS) break;
  }
  return out;
}

/** Schema (shape) failures, as reported by `parseDesignPlan`. */
export function parseRepairErrors(errors: string[]): string[] {
  return boundRepairErrors(errors.map((error) => `plan json: ${error}`));
}

/** Geometry failures, as reported by the transactional dry run in `applyPlan`. */
export function applyRepairErrors(result: ApplyResult): string[] {
  const failed = result.outcomes
    .filter((outcome) => outcome.status === "error")
    .map((outcome) => `operation ${outcome.index + 1} (${outcome.op}): ${outcome.detail ?? "failed"}`);
  if (failed.length === 0 && result.error) failed.push(result.error);
  return boundRepairErrors(failed);
}

/**
 * Builds the repair payload. The json echoed back is the value the validator actually saw: the
 * parsed plan (lengths normalized to integer millimetres) when it parsed, otherwise the raw
 * response. Either way it stays data — the server never executes it.
 */
export function buildRepairPayload(validated: unknown, raw: unknown, errors: string[]): RepairPayload | null {
  const bounded = boundRepairErrors(errors);
  if (bounded.length === 0) return null;
  const plan = validated ?? raw;
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) return null;
  return { plan, errors: bounded };
}

export type AutoRepairOutcome =
  | {
      status: "plan";
      plan: DesignPlan;
      apply: ApplyResult;
      /** Present when at least one repair request produced this plan. */
      repair?: { attempts: number; errors: string[] };
      repairPayload: RepairPayload | null;
      usage: UsageTotals;
      model: string;
      demo: boolean;
    }
  | {
      status: "invalid";
      errors: string[];
      /** The plan when it parsed (so the UI can show which operation failed), otherwise null. */
      plan: DesignPlan | null;
      apply: ApplyResult | null;
      /** Enough feedback for a user-initiated retry to be a genuine repair attempt. */
      repairPayload: RepairPayload | null;
      usage: UsageTotals;
      model: string;
      demo: boolean;
    }
  | {
      status: "error";
      code: string;
      message: string;
      repairPayload: RepairPayload | null;
      usage: UsageTotals;
    };

export interface AutoRepairDeps {
  /** Sends one request to the server (`requestAiPlan` in the app, a fake in tests). */
  request(body: PlanRequestBody): Promise<PlanRequestResult>;
  /** Dry-runs a parsed plan against the real model without committing (`applyPlan` in the app). */
  preview(plan: DesignPlan): ApplyResult;
  /** Progress text for the UI ("Repairing 3 validation errors…"). */
  onStatus?(text: string): void;
  /** Extra requests allowed to fix the model's own output. Defaults to `MAX_AUTO_REPAIRS`. */
  maxAutoRepairs?: number;
}

/**
 * Requests a plan and, when the deterministic validator rejects it, asks the model once more with
 * the validator's messages and its own json attached. Never throws; every exit is an
 * `AutoRepairOutcome` the UI can render.
 */
export async function requestPlanWithAutoRepair(
  body: PlanRequestBody,
  deps: AutoRepairDeps,
): Promise<AutoRepairOutcome> {
  const maxRepairs = deps.maxAutoRepairs ?? MAX_AUTO_REPAIRS;
  let usage = EMPTY_USAGE;
  let model = "unknown";
  let demo = false;
  let attempts = 0;
  let firstErrors: string[] = [];
  let repairPayload: RepairPayload | null = null;
  let requestBody: PlanRequestBody = { ...body, repair: null };

  for (;;) {
    const result = await deps.request(requestBody);
    usage = addUsage(usage, result.ok ? result.usage : null);

    if (!result.ok) {
      return { status: "error", code: result.code, message: result.message, repairPayload, usage };
    }
    model = result.model;
    demo = result.demo;

    const parsed = parseDesignPlan(result.plan);
    if (!parsed.ok) {
      const errors = parseRepairErrors(parsed.errors);
      repairPayload = buildRepairPayload(null, result.plan, errors);
      if (repairPayload && attempts < maxRepairs) {
        if (attempts === 0) firstErrors = errors;
        attempts += 1;
        deps.onStatus?.(`The json was rejected (${errors.length} problem${errors.length === 1 ? "" : "s"}); asking the model to fix it…`);
        requestBody = { ...body, repair: repairPayload };
        continue;
      }
      return { status: "invalid", errors, plan: null, apply: null, repairPayload, usage, model, demo };
    }

    const apply = deps.preview(parsed.plan);
    if (!apply.ok) {
      const errors = applyRepairErrors(apply);
      repairPayload = buildRepairPayload(parsed.plan, result.plan, errors);
      if (repairPayload && attempts < maxRepairs) {
        if (attempts === 0) firstErrors = errors;
        attempts += 1;
        deps.onStatus?.(
          `The plan cannot be built (${errors.length} problem${errors.length === 1 ? "" : "s"}); asking the model to fix it…`,
        );
        requestBody = { ...body, repair: repairPayload };
        continue;
      }
      return { status: "invalid", errors, plan: parsed.plan, apply, repairPayload, usage, model, demo };
    }

    return {
      status: "plan",
      plan: parsed.plan,
      apply,
      ...(attempts > 0 ? { repair: { attempts, errors: firstErrors } } : {}),
      repairPayload,
      usage,
      model,
      demo,
    };
  }
}
