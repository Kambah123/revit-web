/**
 * revit-web AI server: the smallest backend that fits this deployment.
 *
 * - POST /api/ai/plan — validated DeepSeek proxy that returns a DesignPlan JSON payload.
 * - GET  /api/ai/health — liveness + configuration status (never secrets).
 * - Static SPA hosting from dist/ in production (same origin as the API).
 *
 * The DeepSeek API key is read from DEEPSEEK_API_KEY in the server environment only.
 * Run: node server/index.mjs   (see docs/AI_ARCHITECT.md for configuration)
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { callDeepSeek, DeepSeekError, parsePlanContent, streamDeepSeek } from "./deepseek.mjs";
import { demoPlanFor } from "./demoPlanner.mjs";
import { buildSystemPrompt, buildUserMessage } from "./prompt.mjs";
import { createRateLimiter } from "./rateLimit.mjs";
import { validatePlanRequest } from "./validateRequest.mjs";

const DIST_DIR = resolve(fileURLToPath(new URL("../dist", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function sendJson(res, status, body, extraHeaders = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  });
  res.end(text);
}

function sendError(res, status, code, message, extraHeaders = {}) {
  sendJson(res, status, { error: { code, message } }, extraHeaders);
}

function readBody(req, maxBytes) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        rejectPromise(new DeepSeekError("ai_bad_request", "Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rejectPromise);
  });
}

/** Parses and validates a plan request body. Returns null after answering the request itself. */
function checkedRequestBody(rawBody, res) {
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    sendError(res, 400, "ai_bad_request", "Request body is not valid JSON.");
    return null;
  }
  const checked = validatePlanRequest(body);
  if (!checked.ok) {
    sendError(res, 400, "ai_bad_request", checked.message);
    return null;
  }
  return checked.value;
}

/**
 * Assembles the DeepSeek chat messages for a validated request: the system prompt, the prior turns,
 * and the user turn (project context + selection + optional repair block + request).
 */
export function buildMessages(request) {
  return [
    { role: "system", content: buildSystemPrompt() },
    ...request.history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: buildUserMessage(request) },
  ];
}

/**
 * Handles one /api/ai/plan call: validate → (DeepSeek | demo planner) → sanity-check → respond.
 * @param {{ config: object, fetchImpl?: typeof fetch }} deps
 */
export async function handlePlanRequest(deps, rawBody, res) {
  const { config, fetchImpl = fetch } = deps;
  const request = checkedRequestBody(rawBody, res);
  if (request === null) return undefined;

  // Demo planner: clearly-labelled deterministic fallback for environments without an API key.
  if (!config.apiKey && config.demoPlanner) {
    const plan = demoPlanFor(request);
    return sendJson(res, 200, { plan, model: "demo-planner", demo: true, usage: null });
  }
  if (!config.apiKey) {
    return sendError(
      res,
      503,
      "ai_not_configured",
      "The AI Architect is not configured on this server. Set DEEPSEEK_API_KEY (see docs/AI_ARCHITECT.md), or enable AI_DEMO_PLANNER=1 for a labelled local demo.",
    );
  }

  const messages = buildMessages(request);

  let plan;
  let model = config.model;
  let usage = null;
  const repairing = Boolean(request.repair);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result;
    try {
      // Repair attempts sample at temperature 0: the model must satisfy the listed problems, not
      // redesign. The empty-content retry keeps the caller's temperature.
      result = await callDeepSeek({ config, messages, fetchImpl, temperature: repairing ? 0 : undefined });
    } catch (error) {
      if (error instanceof DeepSeekError) {
        const status = error.code === "ai_rate_limited" ? 429 : error.code === "ai_timeout" ? 504 : error.code === "ai_bad_response" ? 502 : error.status === 401 || error.status === 403 ? 502 : 502;
        return sendError(res, status, error.code, error.message);
      }
      return sendError(res, 502, "ai_upstream", "Unexpected AI service failure.");
    }
    model = result.model;
    usage = result.usage;
    try {
      plan = parsePlanContent(result.content);
      break;
    } catch (error) {
      // JSON mode can return empty content intermittently (official docs); retry once.
      const retriable = error instanceof DeepSeekError && error.code === "ai_bad_response" && /empty content/i.test(error.message);
      if (!retriable || attempt === 1) {
        const code = error instanceof DeepSeekError ? error.code : "ai_bad_response";
        return sendError(res, 502, code, error instanceof Error ? error.message : "The AI returned an unusable response.");
      }
    }
  }

  if (plan.kind !== undefined && plan.kind !== "design-plan") {
    return sendError(res, 502, "ai_bad_response", "The AI returned json that is not a design plan.");
  }
  if (!Array.isArray(plan.operations)) {
    return sendError(res, 502, "ai_bad_response", "The AI returned a plan without an operations list.");
  }

  return sendJson(res, 200, { plan, model, demo: false, usage });
}

/**
 * Server-sent-events variant of the plan endpoint: `start` → `delta`* → `done` | `error`.
 *
 * The `done` payload is byte-for-byte the same envelope as the buffered route (plan, model, demo,
 * usage), so the client validates exactly one shape however it received the plan. Streaming is a
 * transport optimisation, never a second code path for trust: the plan is parsed and sanity-checked
 * here exactly as it is for a buffered response.
 *
 * Client disconnects abort the upstream DeepSeek request, so cancelling stops token spend.
 *
 * @param {{ config: object, fetchImpl?: typeof fetch }} deps
 */
export async function handlePlanStreamRequest(deps, rawBody, res, req) {
  const { config, fetchImpl = fetch } = deps;
  const request = checkedRequestBody(rawBody, res);
  if (request === null) return undefined;

  // Demo planner (no key, demo enabled): answer as a single done event so clients see one protocol.
  if (!config.apiKey && config.demoPlanner) {
    const plan = demoPlanFor(request);
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform" });
    res.write(`event: done\ndata: ${JSON.stringify({ plan, model: "demo-planner", demo: true, usage: null })}\n\n`);
    return res.end();
  }
  if (!config.apiKey) {
    return sendError(
      res,
      503,
      "ai_not_configured",
      "The AI Architect is not configured on this server. Set DEEPSEEK_API_KEY (see docs/AI_ARCHITECT.md), or enable AI_DEMO_PLANNER=1 for a labelled local demo.",
    );
  }
  if (!config.stream) {
    // Clients treat this as "streaming unavailable" and use the buffered route instead.
    return sendError(res, 501, "ai_streaming_disabled", "Streaming is disabled on this server (AI_STREAM=0).");
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    // Proxies must not buffer an event stream (nginx honours this).
    "X-Accel-Buffering": "no",
  });
  // A disconnect must stop the upstream request, not just the rendering.
  const upstream = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) upstream.abort();
  });
  const send = (event, payload) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      /* the connection is gone; the close handler aborts upstream */
    }
  };

  const repairing = Boolean(request.repair);
  const temperature = repairing ? 0 : undefined;
  const messages = buildMessages(request);
  send("start", { model: config.model, repairing });

  let result;
  try {
    result = await streamDeepSeek({
      config,
      messages,
      fetchImpl,
      temperature,
      signal: upstream.signal,
      onDelta: (text) => send("delta", { text }),
    });
  } catch (error) {
    const code = error instanceof DeepSeekError ? error.code : "ai_upstream";
    const message = error instanceof Error ? error.message : "The AI service failed.";
    // A cancelled or timed-out stream is reported as an error event; the client decides what to do.
    send("error", { code, message });
    return res.end();
  }

  // JSON mode can return empty content intermittently (official docs); retry once, buffered, only
  // when nothing at all was generated — never re-charge for a half-written plan.
  let { content, model, usage } = result;
  if (content.trim() === "") {
    try {
      const retry = await callDeepSeek({ config, messages, fetchImpl, temperature });
      content = retry.content;
      model = retry.model;
      usage = retry.usage ?? usage;
    } catch (error) {
      const code = error instanceof DeepSeekError ? error.code : "ai_bad_response";
      send("error", { code, message: error instanceof Error ? error.message : "The AI returned an unusable response." });
      return res.end();
    }
  }

  let plan;
  try {
    plan = parsePlanContent(content);
  } catch (error) {
    const code = error instanceof DeepSeekError ? error.code : "ai_bad_response";
    send("error", { code, message: error instanceof Error ? error.message : "The AI returned an unusable response." });
    return res.end();
  }
  if (plan.kind !== undefined && plan.kind !== "design-plan") {
    send("error", { code: "ai_bad_response", message: "The AI returned json that is not a design plan." });
    return res.end();
  }
  if (!Array.isArray(plan.operations)) {
    send("error", { code: "ai_bad_response", message: "The AI returned a plan without an operations list." });
    return res.end();
  }

  send("done", { plan, model, demo: false, usage });
  return res.end();
}

function serveStatic(req, res, pathname) {
  if (!existsSync(DIST_DIR)) {
    return sendError(res, 404, "not_found", "No production build found. Run `npm run build`, or use the Vite dev server.");
  }
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  // Never serve or fall back for sensitive segments (.git, .env, dotfiles) or source trees.
  const segments = rel.split(/[/\\]+/).filter(Boolean);
  const blocked = segments.some((seg) => seg.startsWith(".")) || ["server", "src", "node_modules", "docs", "e2e", "scripts", "api"].includes(segments[0]);
  if (blocked) {
    return sendError(res, 404, "not_found", "Not found.");
  }
  const filePath = resolve(join(DIST_DIR, rel));
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + sep)) {
    return sendError(res, 403, "forbidden", "Forbidden.");
  }
  let target = filePath;
  if (!existsSync(target) || statSync(target).isDirectory()) {
    // SPA fallback for client routes; unknown files with an extension 404.
    if (extname(pathname) !== "") return sendError(res, 404, "not_found", "Not found.");
    target = join(DIST_DIR, "index.html");
    if (!existsSync(target)) return sendError(res, 404, "not_found", "Not found.");
  }
  const type = MIME[extname(target).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  createReadStream(target).pipe(res);
}

/**
 * Creates the HTTP server (not yet listening) so tests can bind it to an ephemeral port.
 * @param {{ config: object, fetchImpl?: typeof fetch, now?: () => number }} deps
 */
export function createServer({ config, fetchImpl = fetch, now = () => Date.now() }) {
  const limiter = createRateLimiter({ perMinute: config.rateLimitPerMin, now });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/api/ai/health") {
        return sendJson(res, 200, {
          ok: true,
          aiConfigured: Boolean(config.apiKey),
          model: config.apiKey ? config.model : config.demoPlanner ? "demo-planner" : null,
          demo: !config.apiKey && config.demoPlanner,
        });
      }

      const isPlanRoute = url.pathname === "/api/ai/plan" || url.pathname === "/api/ai/plan-stream";
      if (isPlanRoute) {
        if (req.method !== "POST") {
          return sendError(res, 405, "method_not_allowed", `Use POST for ${url.pathname}.`, { Allow: "POST" });
        }
        const rate = limiter.check(clientIp(req));
        if (!rate.allowed) {
          return sendError(res, 429, "ai_rate_limited", "Too many AI requests. Try again shortly.", {
            "Retry-After": String(rate.retryAfterSec),
          });
        }
        if (!String(req.headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
          return sendError(res, 415, "ai_bad_request", "Content-Type must be application/json.");
        }
        let rawBody;
        try {
          rawBody = await readBody(req, config.maxBodyBytes);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not read the request body.";
          return sendError(res, error instanceof DeepSeekError ? 413 : 400, "ai_bad_request", message);
        }
        return url.pathname === "/api/ai/plan-stream"
          ? handlePlanStreamRequest({ config, fetchImpl }, rawBody, res, req)
          : handlePlanRequest({ config, fetchImpl }, rawBody, res);
      }

      if (url.pathname.startsWith("/api/")) {
        return sendError(res, 404, "not_found", "Unknown API route.");
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        return sendError(res, 405, "method_not_allowed", "Only GET is allowed for static files.");
      }
      return serveStatic(req, res, url.pathname);
    } catch {
      if (!res.headersSent) return sendError(res, 500, "internal", "Internal server error.");
      res.end();
    }
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { loadConfig } = await import("./config.mjs");
  const config = loadConfig();
  const server = createServer({ config });
  server.listen(config.port, "0.0.0.0", () => {
    const mode = config.apiKey ? `DeepSeek model ${config.model}` : config.demoPlanner ? "demo planner (no API key)" : "AI disabled (no API key)";
    console.log(`revit-web server listening on http://0.0.0.0:${config.port} — ${mode}`);
    if (config.serveStatic && !existsSync(DIST_DIR)) {
      console.log("Note: dist/ not found yet; run `npm run build` to serve the production build.");
    }
  });
}
