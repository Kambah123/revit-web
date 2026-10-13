/**
 * Vercel serverless entry point for the streaming (server-sent events) AI planner.
 *
 * Same pipeline, validation, rate limit and error mapping as the buffered handler — it only adds the
 * `start`/`delta`/`done` transport. If this function is not deployed (or streaming is disabled with
 * `AI_STREAM=0`), the browser client transparently falls back to `POST /api/ai/plan`.
 */
import { loadConfig } from "../../server/config.mjs";
import { handlePlanStreamRequest } from "../../server/index.mjs";
import { createRateLimiter } from "../../server/rateLimit.mjs";

const config = loadConfig();
const limiter = createRateLimiter({ perMinute: config.rateLimitPerMin });

function sendError(res, status, code, message, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify({ error: { code, message } }));
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "method_not_allowed", "Use POST for /api/ai/plan-stream.");
  }

  if (!String(req.headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
    return sendError(res, 415, "ai_bad_request", "Content-Type must be application/json.");
  }

  const rate = limiter.check(clientIp(req));
  if (!rate.allowed) {
    return sendError(res, 429, "ai_rate_limited", "Too many AI requests. Try again shortly.", {
      "Retry-After": String(rate.retryAfterSec),
    });
  }

  let rawBody;
  try {
    rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  } catch {
    return sendError(res, 400, "ai_bad_request", "Request body is not valid JSON.");
  }

  if (Buffer.byteLength(rawBody, "utf8") > config.maxBodyBytes) {
    return sendError(res, 413, "ai_bad_request", "Request body is too large.");
  }

  try {
    return await handlePlanStreamRequest({ config }, rawBody, res, req);
  } catch {
    if (!res.headersSent) return sendError(res, 500, "internal", "Internal server error.");
    return res.end();
  }
}
