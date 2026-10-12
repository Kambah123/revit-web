/**
 * DeepSeek API client (OpenAI-compatible chat completions). The API key is read from server config
 * only and is never included in errors, logs or responses.
 */

/** Typed upstream failure. `code` matches the codes documented in docs/AI_ARCHITECT.md. */
export class DeepSeekError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status) {
    super(message);
    this.name = "DeepSeekError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Strips markdown code fences that models sometimes add around json_object output.
 * @param {string} text
 */
export function stripJsonFences(text) {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Calls DeepSeek chat completions with a hard timeout.
 *
 * @param {{
 *   config: { apiKey: string, model: string, baseUrl: string, timeoutMs: number, maxTokens: number },
 *   messages: { role: string, content: string }[],
 *   fetchImpl?: typeof fetch,
 * }} options
 * @returns {Promise<{ content: string, model: string, usage: object | null }>}
 */
export async function callDeepSeek({ config, messages, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: config.maxTokens,
          temperature: 0.2,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error && (error.name === "AbortError" || controller.signal.aborted)) {
        throw new DeepSeekError("ai_timeout", `DeepSeek did not respond within ${Math.round(config.timeoutMs / 1000)} s.`);
      }
      throw new DeepSeekError("ai_upstream", "Could not reach the DeepSeek API.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new DeepSeekError("ai_upstream_auth", "DeepSeek rejected the server credentials. Check DEEPSEEK_API_KEY.", response.status);
    }
    if (response.status === 429) {
      throw new DeepSeekError("ai_rate_limited", "DeepSeek is rate limiting this deployment. Try again shortly.", response.status);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new DeepSeekError("ai_bad_response", "DeepSeek returned a response that is not JSON.", response.status);
    }
    if (!response.ok) {
      // Upstream error body may echo request material; only surface a short code.
      const upstreamCode = typeof data?.error?.type === "string" ? data.error.type : `http_${response.status}`;
      throw new DeepSeekError("ai_upstream", `DeepSeek returned an error (${upstreamCode}).`, response.status);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new DeepSeekError("ai_bad_response", "DeepSeek returned no message content.");
    }
    return {
      content,
      model: typeof data.model === "string" ? data.model : config.model,
      usage: data.usage && typeof data.usage === "object" ? data.usage : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parses the model's message content into a JSON object. Throws DeepSeekError("ai_bad_response").
 * @param {string} content
 */
export function parsePlanContent(content) {
  const text = stripJsonFences(content);
  if (text.trim() === "") {
    throw new DeepSeekError("ai_bad_response", "DeepSeek returned empty content (a known intermittent issue with JSON mode). Retry the request.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DeepSeekError("ai_bad_response", "DeepSeek returned content that is not valid json.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DeepSeekError("ai_bad_response", "DeepSeek returned json that is not a plan object.");
  }
  return parsed;
}
