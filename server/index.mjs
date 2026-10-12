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
import { callDeepSeek, DeepSeekError, parsePlanContent } from "./deepseek.mjs";
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

/**
 * Handles one /api/ai/plan call: validate → (DeepSeek | demo planner) → sanity-check → respond.
 * @param {{ config: object, fetchImpl?: typeof fetch }} deps
 */
export async function handlePlanRequest(deps, rawBody, res) {
  const { config, fetchImpl = fetch } = deps;
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return sendError(res, 400, "ai_bad_request", "Request body is not valid JSON.");
  }

  const checked = validatePlanRequest(body);
  if (!checked.ok) return sendError(res, 400, "ai_bad_request", checked.message);

  // Demo planner: clearly-labelled deterministic fallback for environments without an API key.
  if (!config.apiKey && config.demoPlanner) {
    const plan = demoPlanFor(checked.value);
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

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...checked.value.history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: buildUserMessage(checked.value) },
  ];

  let plan;
  let model = config.model;
  let usage = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result;
    try {
      result = await callDeepSeek({ config, messages, fetchImpl });
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

      if (url.pathname === "/api/ai/plan") {
        if (req.method !== "POST") {
          return sendError(res, 405, "method_not_allowed", "Use POST for /api/ai/plan.", { Allow: "POST" });
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
        return handlePlanRequest({ config, fetchImpl }, rawBody, res);
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
