/**
 * Browser client for the server-side AI endpoint. Talks only to same-origin /api — the DeepSeek key
 * never reaches the browser. Errors are mapped to the typed codes documented in docs/AI_ARCHITECT.md.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** The model's rejected json plus the validator's messages, echoed back for one repair attempt. */
export interface RepairPayload {
  plan: unknown;
  errors: string[];
}

export interface PlanRequestBody {
  message: string;
  history?: ChatTurn[];
  context?: Record<string, unknown> | null;
  selection?: Record<string, unknown> | null;
  /** Present only on a repair attempt (see src/ai/repair.ts). */
  repair?: RepairPayload | null;
}

/** Token accounting for one response (normalized from the provider's usage object). */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export type PlanRequestResult =
  | { ok: true; plan: unknown; model: string; demo: boolean; usage: TokenUsage | null }
  | { ok: false; code: string; message: string };

/** Normalizes a provider usage object (`{prompt_tokens, completion_tokens, total_tokens}`). */
export function normalizeUsage(raw: unknown): TokenUsage | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const prompt = num(record.prompt_tokens);
  const completion = num(record.completion_tokens);
  const total = num(record.total_tokens) || prompt + completion;
  if (total <= 0 && prompt <= 0 && completion <= 0) return null;
  return { prompt, completion, total };
}

const FALLBACK_MESSAGES: Record<string, string> = {
  ai_not_configured: "The AI Architect is not configured on this server. Set DEEPSEEK_API_KEY on the server (see docs/AI_ARCHITECT.md).",
  ai_rate_limited: "Too many AI requests right now. Wait a moment and try again.",
  ai_timeout: "The AI service timed out. Try again, or simplify the request.",
  ai_upstream: "The AI service returned an error. Try again shortly.",
  ai_upstream_auth: "The server's DeepSeek credentials were rejected. Check DEEPSEEK_API_KEY.",
  ai_bad_response: "The AI returned an unusable response. Press Retry.",
  ai_bad_request: "The request was rejected by the server. Try a shorter description.",
  ai_cancelled: "Cancelled.",
  network: "Could not reach the AI server. Check that it is running (npm run server).",
};

export async function requestAiPlan(
  body: PlanRequestBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PlanRequestResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const controller = new AbortController();
  // globalThis (not window): the same client is exercised from Node in the integration tests.
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const response = await fetchImpl("/api/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      /* handled below */
    }
    if (!response.ok) {
      const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
      const code = error?.code ?? `http_${response.status}`;
      return { ok: false, code, message: error?.message ?? FALLBACK_MESSAGES[code] ?? "The AI request failed." };
    }
    const payload = data as { plan?: unknown; model?: string; demo?: boolean; usage?: unknown };
    if (!payload || typeof payload !== "object" || payload.plan === undefined) {
      return { ok: false, code: "ai_bad_response", message: FALLBACK_MESSAGES.ai_bad_response };
    }
    return {
      ok: true,
      plan: payload.plan,
      model: payload.model ?? "unknown",
      demo: Boolean(payload.demo),
      usage: normalizeUsage(payload.usage),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      // Distinguish "the user cancelled" from "the server was too slow".
      if (options.signal?.aborted) return { ok: false, code: "ai_cancelled", message: FALLBACK_MESSAGES.ai_cancelled };
      return { ok: false, code: "ai_timeout", message: FALLBACK_MESSAGES.ai_timeout };
    }
    return { ok: false, code: "network", message: FALLBACK_MESSAGES.network };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export interface StreamOptions {
  /** Called with each content delta as the model writes the plan. */
  onDelta?(text: string, fullText: string): void;
  fetchImpl?: typeof fetch;
  /** Inactivity budget: reset on every delta, so a long but live stream is never killed. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Typed result of a streaming attempt, before the buffered fallback is considered. */
type StreamOutcome =
  | { ok: true; plan: unknown; model: string; demo: boolean; usage: TokenUsage | null }
  | { ok: false; code: string; message: string }
  | { fallback: true; reason: string };

/**
 * Parses `event:`/`data:` server-sent-event frames out of a growing text buffer. Pure, so the
 * protocol handling is unit-testable without a network. Returns the complete frames and the
 * remainder that is still partial.
 */
export function parseSseFrames(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  for (;;) {
    const boundary = rest.indexOf("\n\n");
    if (boundary === -1) break;
    const frame = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

/** One streaming attempt against /api/ai/plan-stream. */
async function streamOnce(
  body: PlanRequestBody,
  options: StreamOptions,
  protocol: { accept: string; contentType: string },
): Promise<StreamOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const idleMs = options.timeoutMs ?? 90_000;
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  /** Inactivity timeout: re-armed on every delta, so a live stream is never cut for being long. */
  const armIdleTimer = () => {
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleMs);
  };
  armIdleTimer();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetchImpl("/api/ai/plan-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: protocol.accept },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (response.status === 404 || response.status === 405 || response.status === 501 || !contentType.includes(protocol.contentType)) {
      // No streaming route on this deployment (or streaming switched off): use the buffered endpoint.
      return { fallback: true, reason: `http_${response.status}` };
    }
    if (!response.ok) {
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        /* handled below */
      }
      const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
      const code = error?.code ?? `http_${response.status}`;
      return { ok: false, code, message: error?.message ?? FALLBACK_MESSAGES[code] ?? "The AI request failed." };
    }
    if (!response.body) return { fallback: true, reason: "no_body" };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let result: StreamOutcome | null = null;

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseFrames(buffer);
      buffer = rest;
      for (const frame of events) {
        let payload: unknown = null;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          continue; // a malformed frame must not poison an otherwise good stream
        }
        if (frame.event === "delta") {
          const chunk = (payload as { text?: unknown }).text;
          if (typeof chunk === "string" && chunk.length > 0) {
            text += chunk;
            armIdleTimer();
            options.onDelta?.(chunk, text);
          }
        } else if (frame.event === "done") {
          const data = payload as { plan?: unknown; model?: string; demo?: boolean; usage?: unknown };
          if (data.plan === undefined) {
            result = { ok: false, code: "ai_bad_response", message: FALLBACK_MESSAGES.ai_bad_response };
          } else {
            result = {
              ok: true,
              plan: data.plan,
              model: data.model ?? "unknown",
              demo: Boolean(data.demo),
              usage: normalizeUsage(data.usage),
            };
          }
        } else if (frame.event === "error") {
          const error = payload as { code?: string; message?: string };
          const code = error?.code ?? "ai_upstream";
          result = { ok: false, code, message: error?.message ?? FALLBACK_MESSAGES[code] ?? "The AI request failed." };
        }
      }
      if (result) break;
    }

    if (result) return result;
    // The stream ended without a done/error frame. Nothing was received: retry buffered.
    if (text.trim() === "") return { fallback: true, reason: "empty_stream" };
    return { ok: false, code: "ai_upstream", message: "The AI stream ended unexpectedly. Press Retry." };
  } catch (error) {
    if (options.signal?.aborted) return { ok: false, code: "ai_cancelled", message: "Request cancelled." };
    if (error instanceof DOMException && error.name === "AbortError") {
      return timedOut
        ? { ok: false, code: "ai_timeout", message: FALLBACK_MESSAGES.ai_timeout }
        : { ok: false, code: "ai_upstream", message: "The AI stream was interrupted. Press Retry." };
    }
    // The streaming route may simply not be reachable (proxy, offline): fall back when nothing arrived.
    return { fallback: true, reason: "network" };
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}

/**
 * Requests a plan over server-sent events, falling back to the buffered endpoint when the
 * deployment has no streaming route. Both paths return the same `PlanRequestResult`, so callers
 * (including the repair loop) never branch on transport.
 */
export async function requestAiPlanStream(
  body: PlanRequestBody,
  options: StreamOptions = {},
): Promise<PlanRequestResult> {
  const outcome = await streamOnce(body, options, { accept: "text/event-stream", contentType: "text/event-stream" });
  if ("fallback" in outcome) {
    return requestAiPlan(body, { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs, signal: options.signal });
  }
  return outcome;
}

export function friendlyError(code: string, message?: string): string {
  return message && message.length > 0 ? message : FALLBACK_MESSAGES[code] ?? "The AI request failed.";
}
