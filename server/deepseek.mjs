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
 *   config: { apiKey: string, model: string, baseUrl: string, timeoutMs: number, maxTokens: number, temperature?: number },
 *   messages: { role: string, content: string }[],
 *   fetchImpl?: typeof fetch,
 *   temperature?: number,
 * }} options `temperature` is a sampling override: repair attempts pass 0 so fixes stay literal.
 * @returns {Promise<{ content: string, model: string, usage: object | null }>}
 */
export async function callDeepSeek({ config, messages, fetchImpl = fetch, temperature }) {
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
          temperature: temperature ?? config.temperature ?? 0.2,
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

    assertUpstreamOk(response);

    let data;
    try {
      data = await response.json();
    } catch {
      throw new DeepSeekError("ai_bad_response", "DeepSeek returned a response that is not JSON.", response.status);
    }
    if (!response.ok) {
      throw upstreamErrorFrom(data, response.status);
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
 * Maps a non-OK upstream response to a typed error. Upstream error bodies may echo request material,
 * so only a short code (never the body or the key) is surfaced.
 * @param {any} data
 * @param {number} status
 */
function upstreamErrorFrom(data, status) {
  const upstreamCode = typeof data?.error?.type === "string" ? data.error.type : `http_${status}`;
  return new DeepSeekError("ai_upstream", `DeepSeek returned an error (${upstreamCode}).`, status);
}

/** Throws the typed error for statuses that are decided before the body is read. */
function assertUpstreamOk(response) {
  if (response.status === 401 || response.status === 403) {
    throw new DeepSeekError("ai_upstream_auth", "DeepSeek rejected the server credentials. Check DEEPSEEK_API_KEY.", response.status);
  }
  if (response.status === 429) {
    throw new DeepSeekError("ai_rate_limited", "DeepSeek is rate limiting this deployment. Try again shortly.", response.status);
  }
}

/**
 * Streams a chat completion, invoking `onDelta` as content arrives, and resolves with the same
 * `{ content, model, usage }` shape as `callDeepSeek`. `signal` aborts the upstream request (client
 * disconnects and cancellations must stop token spend, not just stop rendering).
 *
 * @param {{
 *   config: { apiKey: string, model: string, baseUrl: string, timeoutMs: number, maxTokens: number, temperature?: number },
 *   messages: { role: string, content: string }[],
 *   fetchImpl?: typeof fetch,
 *   temperature?: number,
 *   onDelta?: (text: string) => void,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{ content: string, model: string, usage: object | null }>}
 */
export async function streamDeepSeek({ config, messages, fetchImpl = fetch, temperature, onDelta, signal }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: config.maxTokens,
          temperature: temperature ?? config.temperature ?? 0.2,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });
      assertUpstreamOk(response);
      if (!response.ok) {
        let data = null;
        try {
          data = await response.json();
        } catch {
          /* the typed error below covers it */
        }
        throw upstreamErrorFrom(data, response.status);
      }
    } catch (error) {
      if (error instanceof DeepSeekError) throw error;
      if (error && (error.name === "AbortError" || controller.signal.aborted)) {
        if (signal && signal.aborted) throw new DeepSeekError("ai_cancelled", "The client cancelled the request.");
        throw new DeepSeekError("ai_timeout", `DeepSeek did not respond within ${Math.round(config.timeoutMs / 1000)} s.`);
      }
      throw new DeepSeekError("ai_upstream", "Could not reach the DeepSeek API.");
    }
    if (!response.body) {
      throw new DeepSeekError("ai_bad_response", "DeepSeek returned no stream body.");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let model = config.model;
    let usage = null;
    /** Consumes complete `data:` lines from the buffer; partial lines stay buffered. */
    const consumeLines = () => {
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (line === "" || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // a malformed chunk must not poison an otherwise good stream
        }
        if (typeof parsed?.model === "string") model = parsed.model;
        if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          content += delta;
          onDelta?.(delta);
        }
      }
    };

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      consumeLines();
    }
    buffer += decoder.decode();
    consumeLines();
    return { content, model, usage };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
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
