/**
 * Server tests for the AI Architect endpoint (vitest, plain Node — no browser).
 * DeepSeek is mocked with a local HTTP server; the real API is never contacted.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../server/index.mjs";
import { loadConfig } from "../../server/config.mjs";
import { demoPlanFor } from "../../server/demoPlanner.mjs";
import { stripJsonFences } from "../../server/deepseek.mjs";

const SECRET = "sk-test-secret-key-12345";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Minimal mock of api.deepseek.com/chat/completions. */
function startMockDeepSeek(handler) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    seen.push({ url: req.url, auth: req.headers.authorization, body });
    handler(req, res, body);
  });
  return { server, seen };
}

function mockContent(res, content, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      id: "chatcmpl-test",
      model: "deepseek-flash",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
  );
}

const VALID_PLAN = JSON.stringify({
  kind: "design-plan",
  version: 1,
  summary: "Add one wall.",
  assumptions: [],
  clarifications: [],
  unsupported: [],
  operations: [{ op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } }],
});

describe("ai server", () => {
  let mock;
  let mockPort;
  let appServer;
  let appPort;
  let base;
  /** Mutable mock behaviour for the current test. */
  let behaviour;

  beforeAll(async () => {
    mock = startMockDeepSeek((req, res, body) => behaviour(req, res, body));
    mockPort = await listen(mock.server);
    const config = {
      ...loadConfig({ DEEPSEEK_API_KEY: SECRET, DEEPSEEK_MODEL: "deepseek-flash", AI_TIMEOUT_MS: "2000", AI_RATE_LIMIT_PER_MIN: "1000" }),
      baseUrl: `http://127.0.0.1:${mockPort}`,
    };
    appServer = createServer({ config });
    appPort = await listen(appServer);
    base = `http://127.0.0.1:${appPort}`;
  });

  afterAll(async () => {
    await close(appServer);
    await close(mock.server);
  });

  const post = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("health reports configuration without leaking the key", async () => {
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    const res = await fetch(`${base}/api/ai/health`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    const body = JSON.parse(text);
    expect(body.ok).toBe(true);
    expect(body.aiConfigured).toBe(true);
    expect(body.model).toBe("deepseek-flash");
    expect(body.demo).toBe(false);
  });

  it("returns a plan and forwards the key only to DeepSeek with json response_format", async () => {
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    mock.seen.length = 0;
    const res = await post("/api/ai/plan", {
      message: "Add a wall on Level 1 from 0,0 to 4000,0.",
      context: { levels: [{ name: "Level 1", elevation: 0 }] },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.kind).toBe("design-plan");
    expect(body.plan.operations[0].op).toBe("wall.add");
    expect(body.demo).toBe(false);
    expect(body.usage.total_tokens).toBe(30);
    const text = JSON.stringify(body);
    expect(text).not.toContain(SECRET);

    assert.equal(mock.seen.length, 1);
    assert.equal(mock.seen[0].auth, `Bearer ${SECRET}`);
    assert.equal(mock.seen[0].body.response_format.type, "json_object");
    assert.equal(mock.seen[0].body.model, "deepseek-flash");
    assert.ok(mock.seen[0].body.messages[0].role === "system");
    assert.ok(JSON.stringify(mock.seen[0].body.messages).includes("PROJECT CONTEXT"));
  });

  it("rejects malformed and oversized requests before contacting DeepSeek", async () => {
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    mock.seen.length = 0;

    let res = await post("/api/ai/plan", {});
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "ai_bad_request");

    res = await post("/api/ai/plan", { message: "x".repeat(5000) });
    assert.equal(res.status, 400);

    res = await post("/api/ai/plan", { message: "hello", history: [{ role: "wizard", content: "hi" }] });
    assert.equal(res.status, 400);

    res = await post("/api/ai/plan", { message: "hello", context: { blob: "y".repeat(50_000) } });
    assert.equal(res.status, 400);

    res = await fetch(`${base}/api/ai/plan`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" });
    assert.equal(res.status, 415);

    res = await fetch(`${base}/api/ai/plan`, { method: "GET" });
    assert.equal(res.status, 405);

    assert.equal(mock.seen.length, 0);
  });

  it("forwards a validation-repair block to the model and samples it at temperature 0", async () => {
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    mock.seen.length = 0;
    const rejected = {
      kind: "design-plan",
      version: 1,
      summary: "Bad window placement.",
      operations: [
        { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 3000, y: 0 }, height: 2700 },
        { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: 2500, width: 2000, height: 1200, sillHeight: 900 },
      ],
    };
    const res = await post("/api/ai/plan", {
      message: "Add a window to the north wall.",
      repair: {
        plan: rejected,
        errors: ["operation 2 (opening.add): the opening does not fit inside its host wall"],
      },
    });

    expect(res.status).toBe(200);
    assert.equal(mock.seen.length, 1);
    const messages = mock.seen[0].body.messages;
    const userMessage = messages[messages.length - 1].content;
    assert.ok(userMessage.includes("VALIDATION REPAIR REQUEST"));
    assert.ok(userMessage.includes("operation 2 (opening.add)"));
    assert.ok(userMessage.includes('"offset":2500'), "the rejected json is echoed back as data");
    assert.ok(userMessage.includes("USER REQUEST:\nAdd a window to the north wall."));
    // Deterministic fixing, not creative redesign.
    assert.equal(mock.seen[0].body.temperature, 0);
    // The validated system prompt tells the model how to behave on a repair request.
    assert.ok(messages[0].content.includes("REPAIR REQUESTS"));
  });

  it("keeps the configured temperature for ordinary requests", async () => {
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    mock.seen.length = 0;
    const res = await post("/api/ai/plan", { message: "Add a wall." });
    expect(res.status).toBe(200);
    assert.equal(mock.seen[0].body.temperature, 0.2);
  });

  it("rejects malformed repair blocks before contacting DeepSeek", async () => {
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    mock.seen.length = 0;

    let res = await post("/api/ai/plan", { message: "hi", repair: "fix it" });
    assert.equal(res.status, 400);

    res = await post("/api/ai/plan", { message: "hi", repair: { plan: { kind: "design-plan" }, errors: [] } });
    assert.equal(res.status, 400);

    res = await post("/api/ai/plan", { message: "hi", repair: { plan: "not a plan", errors: ["boom"] } });
    assert.equal(res.status, 400);

    res = await post("/api/ai/plan", { message: "hi", repair: { plan: { kind: "design-plan" }, errors: ["", "boom"] } });
    assert.equal(res.status, 400);

    res = await post("/api/ai/plan", { message: "hi", repair: { plan: { kind: "design-plan" }, errors: ["b".repeat(501)] } });
    assert.equal(res.status, 400);

    res = await post("/api/ai/plan", {
      message: "hi",
      repair: { plan: { blob: "x".repeat(40_100) }, errors: ["boom"] },
    });
    assert.equal(res.status, 400);

    assert.equal(mock.seen.length, 0);
    assert.equal((await post("/api/ai/plan", { message: "hi" })).status, 200);
  });

  it("maps upstream failures to safe typed errors and never leaks the key", async () => {
    behaviour = (req, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { type: "invalid_api_key", message: `Invalid API key ${SECRET}` } }));
    };
    let res = await post("/api/ai/plan", { message: "hello" });
    assert.equal(res.status, 502);
    let text = await res.text();
    assert.equal(JSON.parse(text).error.code, "ai_upstream_auth");
    assert.ok(!text.includes(SECRET));

    behaviour = (req, res) => {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { type: "rate_limit_exceeded" } }));
    };
    res = await post("/api/ai/plan", { message: "hello" });
    assert.equal(res.status, 429);
    assert.equal((await res.json()).error.code, "ai_rate_limited");

    behaviour = (req, res) => mockContent(res, "not json at all {{{");
    res = await post("/api/ai/plan", { message: "hello" });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "ai_bad_response");

    behaviour = (req, res) => mockContent(res, JSON.stringify({ kind: "not-a-plan", operations: "no" }));
    res = await post("/api/ai/plan", { message: "hello" });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "ai_bad_response");
  });

  it("retries once when JSON mode returns empty content", async () => {
    let calls = 0;
    behaviour = (req, res) => {
      calls += 1;
      mockContent(res, calls === 1 ? "" : VALID_PLAN);
    };
    const res = await post("/api/ai/plan", { message: "hello" });
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
    assert.equal((await res.json()).plan.summary, "Add one wall.");
  });

  it("times out slow upstreams with ai_timeout", async () => {
    const config = {
      ...loadConfig({ DEEPSEEK_API_KEY: SECRET }),
      baseUrl: `http://127.0.0.1:${mockPort}`,
      timeoutMs: 150,
    };
    const slow = createServer({ config });
    const port = await listen(slow);
    behaviour = () => {
      /* never respond */
    };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ai/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      assert.equal(res.status, 504);
      assert.equal((await res.json()).error.code, "ai_timeout");
    } finally {
      await close(slow);
    }
  });

  it("enforces the per-IP rate limit with Retry-After", async () => {
    const config = {
      ...loadConfig({ DEEPSEEK_API_KEY: SECRET, AI_RATE_LIMIT_PER_MIN: "2" }),
      baseUrl: `http://127.0.0.1:${mockPort}`,
    };
    const limited = createServer({ config });
    const port = await listen(limited);
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    try {
      const call = () =>
        fetch(`http://127.0.0.1:${port}/api/ai/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hello" }),
        });
      assert.equal((await call()).status, 200);
      assert.equal((await call()).status, 200);
      const third = await call();
      assert.equal(third.status, 429);
      assert.ok(Number(third.headers.get("retry-after")) >= 1);
      assert.equal((await third.json()).error.code, "ai_rate_limited");
    } finally {
      await close(limited);
    }
  });

  it("serves 503 with setup instructions when unconfigured, and demo plans only when explicitly enabled", async () => {
    const bare = createServer({ config: loadConfig({}) });
    const barePort = await listen(bare);
    try {
      const res = await fetch(`http://127.0.0.1:${barePort}/api/ai/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).error.code, "ai_not_configured");
    } finally {
      await close(bare);
    }

    const demo = createServer({ config: loadConfig({ AI_DEMO_PLANNER: "1" }) });
    const demoPort = await listen(demo);
    try {
      const res = await fetch(`http://127.0.0.1:${demoPort}/api/ai/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Design a 9 m by 6 m house with a hip roof" }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.demo, true);
      assert.equal(body.model, "demo-planner");
      assert.equal(body.plan.kind, "design-plan");
      assert.ok(body.plan.operations.length > 0);
    } finally {
      await close(demo);
    }
  });

  it("does not serve repository files as static content", async () => {
    behaviour = (req, res) => mockContent(res, VALID_PLAN);
    for (const path of ["/../package.json", "/%2e%2e/package.json", "/server/config.mjs", "/.git/config"]) {
      const res = await fetch(`${base}${path}`);
      const text = await res.text();
      assert.ok(res.status === 404 || res.status === 403, `${path} -> ${res.status}`);
      assert.ok(!text.includes('"revit-web"'), `${path} leaked file content`);
    }
  });
});

describe("demo planner", () => {
  it("generates a labelled building plan with walls, rooms, openings and an optional roof", () => {
    const plan = demoPlanFor({ message: "Design a 12 m by 8 m house with a hip roof" });
    assert.equal(plan.kind, "design-plan");
    const ops = plan.operations.map((o) => o.op);
    assert.ok(ops.includes("wall.add"));
    assert.ok(ops.includes("room.add"));
    assert.ok(ops.includes("opening.add"));
    assert.ok(ops.includes("roof.add"));
    const wall = plan.operations.find((o) => o.op === "wall.add");
    assert.equal(wall.end.x, 12_000);
  });

  it("resizes a named room from context", () => {
    const context = {
      elements: [
        { kind: "room", id: "room-1", name: "Kitchen", boundary: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }] },
      ],
    };
    const plan = demoPlanFor({ message: "make the kitchen larger", context });
    assert.equal(plan.operations[0].op, "room.update");
    assert.equal(plan.operations[0].room.id, "room-1");
    const xs = plan.operations[0].boundary.map((p) => p.x);
    assert.ok(Math.max(...xs) > 3000);
  });

  it("reports sections as unsupported instead of faking them", () => {
    const plan = demoPlanFor({ message: "create a section through the living room" });
    assert.equal(plan.operations.length, 0);
    assert.equal(plan.unsupported.length, 1);
    assert.ok(plan.unsupported[0].alternative.length > 0);
  });

  it("strips markdown json fences", () => {
    assert.equal(stripJsonFences('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(stripJsonFences('{"a":1}'), '{"a":1}');
  });
});

describe("config", () => {
  it("reads env variables with sane defaults and bounds", () => {
    const config = loadConfig({ DEEPSEEK_API_KEY: "k" });
    assert.equal(config.model, "deepseek-flash");
    assert.equal(config.baseUrl, "https://api.deepseek.com");
    assert.equal(config.demoPlanner, false);
    expect(() => loadConfig({ AI_TIMEOUT_MS: "5" })).toThrow(/AI_TIMEOUT_MS/);
    expect(() => loadConfig({ PORT: "nope" })).toThrow(/PORT/);
  });
});
