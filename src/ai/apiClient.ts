/**
 * Browser client for the server-side AI endpoint. Talks only to same-origin /api — the DeepSeek key
 * never reaches the browser. Errors are mapped to the typed codes documented in docs/AI_ARCHITECT.md.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PlanRequestBody {
  message: string;
  history?: ChatTurn[];
  context?: Record<string, unknown> | null;
  selection?: Record<string, unknown> | null;
}

export type PlanRequestResult =
  | { ok: true; plan: unknown; model: string; demo: boolean }
  | { ok: false; code: string; message: string };

const FALLBACK_MESSAGES: Record<string, string> = {
  ai_not_configured: "The AI Architect is not configured on this server. Set DEEPSEEK_API_KEY on the server (see docs/AI_ARCHITECT.md).",
  ai_rate_limited: "Too many AI requests right now. Wait a moment and try again.",
  ai_timeout: "The AI service timed out. Try again, or simplify the request.",
  ai_upstream: "The AI service returned an error. Try again shortly.",
  ai_upstream_auth: "The server's DeepSeek credentials were rejected. Check DEEPSEEK_API_KEY.",
  ai_bad_response: "The AI returned an unusable response. Press Retry.",
  ai_bad_request: "The request was rejected by the server. Try a shorter description.",
  network: "Could not reach the AI server. Check that it is running (npm run server).",
};

export async function requestAiPlan(
  body: PlanRequestBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PlanRequestResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
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
    const payload = data as { plan?: unknown; model?: string; demo?: boolean };
    if (!payload || typeof payload !== "object" || payload.plan === undefined) {
      return { ok: false, code: "ai_bad_response", message: FALLBACK_MESSAGES.ai_bad_response };
    }
    return { ok: true, plan: payload.plan, model: payload.model ?? "unknown", demo: Boolean(payload.demo) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, code: "ai_timeout", message: FALLBACK_MESSAGES.ai_timeout };
    }
    return { ok: false, code: "network", message: FALLBACK_MESSAGES.network };
  } finally {
    window.clearTimeout(timer);
  }
}

export function friendlyError(code: string, message?: string): string {
  return message && message.length > 0 ? message : FALLBACK_MESSAGES[code] ?? "The AI request failed.";
}
