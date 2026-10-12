/**
 * Server configuration, read from the process environment. Secrets (DEEPSEEK_API_KEY) never leave
 * this process and are never echoed in responses or logs.
 */

const DEFAULTS = {
  model: "deepseek-flash",
  baseUrl: "https://api.deepseek.com",
  timeoutMs: 60_000,
  maxTokens: 8_000,
  temperature: 0.2,
  rateLimitPerMin: 10,
  port: 8787,
  maxBodyBytes: 256 * 1024,
};

function intFrom(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max} (got ${JSON.stringify(raw)}).`);
  }
  return value;
}

function floatFrom(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max} (got ${JSON.stringify(raw)}).`);
  }
  return value;
}

/**
 * @typedef {ReturnType<typeof loadConfig>} ServerConfig
 */
export function loadConfig(env = process.env) {
  return {
    /** DeepSeek API key. Empty string means "not configured". */
    apiKey: env.DEEPSEEK_API_KEY ?? "",
    model: env.DEEPSEEK_MODEL ?? DEFAULTS.model,
    baseUrl: (env.DEEPSEEK_BASE_URL ?? DEFAULTS.baseUrl).replace(/\/+$/, ""),
    timeoutMs: intFrom(env, "AI_TIMEOUT_MS", DEFAULTS.timeoutMs, 1_000, 600_000),
    maxTokens: intFrom(env, "AI_MAX_TOKENS", DEFAULTS.maxTokens, 256, 100_000),
    rateLimitPerMin: intFrom(env, "AI_RATE_LIMIT_PER_MIN", DEFAULTS.rateLimitPerMin, 1, 10_000),
    temperature: floatFrom(env, "AI_TEMPERATURE", DEFAULTS.temperature, 0, 2),
    /** Serve deterministic demo plans when no API key is configured (clearly labelled). */
    demoPlanner: env.AI_DEMO_PLANNER === "1" || env.AI_DEMO_PLANNER === "true",
    /** Server-sent-events streaming for /api/ai/plan-stream. `AI_STREAM=0` makes clients use the buffered route. */
    stream: env.AI_STREAM !== "0",
    port: intFrom(env, "PORT", DEFAULTS.port, 1, 65_535),
    serveStatic: env.SERVE_STATIC !== "0",
    maxBodyBytes: intFrom(env, "AI_MAX_BODY_BYTES", DEFAULTS.maxBodyBytes, 1_024, 4 * 1024 * 1024),
  };
}
