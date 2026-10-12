/**
 * Safe health/configuration endpoint for the Vercel serverless deployment.
 * Never returns secrets.
 */
import { loadConfig } from "../../server/config.mjs";

const config = loadConfig();

export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ error: { code: "method_not_allowed", message: "Use GET for /api/ai/health." } }));
  }

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return res.end(JSON.stringify({
    ok: true,
    aiConfigured: Boolean(config.apiKey),
    model: config.apiKey ? config.model : config.demoPlanner ? "demo-planner" : null,
    demo: !config.apiKey && config.demoPlanner,
  }));
}
