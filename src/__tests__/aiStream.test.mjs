/**
 * Server tests for the streaming (SSE) plan endpoint. DeepSeek is mocked with a local HTTP server
 * that writes server-sent events; the real API is never contacted and no key is ever leaked.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../server/index.mjs";
import { loadConfig } from "../../server/config.mjs";

const SECRET = "sk-stream-secret-key-555";

const PLAN = {
  kind: "design-plan",
  version: 1,
  summary: "Add one wall.",
  assumptions: [],
  clarifications: [],
  unsupported: [],
  operations: [{ op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } }],
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Writes the plan as OpenAI-compatible SSE chunks, split mid-value to exercise buffering. */
function writePlanStream(res, content, { usage = { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 } } = {}) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const pieces = [content.slice(0, 11), content.slice(11, 40), content.slice(40, 70), content.slice(70)];
  for (const piece of pieces) {
    if (piece.length === 0) continue;
    res.write(`data: ${JSON.stringify({ id: "chatcmpl-x", model: "deepseek-flash", choices: [{ index: 0, delta: { content: piece } }] })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ id: "chatcmpl-x", choices: [], usage })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

/** Splits an SSE response body into {event, data} frames. */
function framesOf(text) {
  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const event = /event: (.*)/.exec(frame)?.[1] ?? "message";
      const data = /data: (.*)/.exec(frame)?.[1] ?? "";
      return { event, data: data === "" ? null : JSON.parse(data) };
    });
}

describe("ai server — streaming endpoint", () => {
  let mock;
  let appPort;
  let appServer;
  let base;
  let behaviour;
  const seen = [];

  beforeAll(async () => {
    mock = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      seen.push({ auth: req.headers.authorization, body });
      behaviour(req, res, body);
    });
    const mockPort = await listen(mock);
    const config = {
      ...loadConfig({ DEEPSEEK_API_KEY: SECRET, DEEPSEEK_MODEL: "deepseek-flash", AI_RATE_LIMIT_PER_MIN: "1000" }),
      baseUrl: `http://127.0.0.1:${mockPort}`,
    };
    appServer = createServer({ config });
    appPort = await listen(appServer);
    base = `http://127.0.0.1:${appPort}`;
  });

  afterAll(async () => {
    await close(appServer);
    await close(mock);
  });

  const post = (body, path = "/api/ai/plan-stream") =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("streams start/delta/done frames and ends with the same envelope as the buffered route", async () => {
    behaviour = (req, res) => writePlanStream(res, JSON.stringify(PLAN));
    seen.length = 0;

    const res = await post({ message: "Add a wall.", context: { levels: [{ name: "Level 1" }] } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    const frames = framesOf(text);
    const events = frames.map((f) => f.event);
    expect(events[0]).toBe("start");
    expect(events).toContain("delta");
    expect(events[events.length - 1]).toBe("done");
    expect(events).not.toContain("error");

    // The deltas reassemble into exactly the plan the model wrote.
    const streamed = frames.filter((f) => f.event === "delta").map((f) => f.data.text).join("");
    expect(streamed).toBe(JSON.stringify(PLAN));

    const done = frames[frames.length - 1].data;
    expect(done.plan.operations[0].op).toBe("wall.add");
    expect(done.model).toBe("deepseek-flash");
    expect(done.demo).toBe(false);
    expect(done.usage.total_tokens).toBe(12);

    // The streaming request really streams, asks for usage, and keeps the key server-side.
    expect(seen).toHaveLength(1);
    assert.equal(seen[0].body.stream, true);
    assert.equal(seen[0].body.stream_options.include_usage, true);
    assert.equal(seen[0].body.response_format.type, "json_object");
    assert.equal(seen[0].auth, `Bearer ${SECRET}`);
    expect(text).not.toContain(SECRET);
  });

  it("streams a repair attempt with the validation feedback and temperature 0", async () => {
    behaviour = (req, res) => writePlanStream(res, JSON.stringify(PLAN));
    seen.length = 0;

    const res = await post({
      message: "Add a wall.",
      repair: { plan: { kind: "design-plan", operations: [{ op: "wall.add" }] }, errors: ["plan json: wall.add is missing start"] },
    });
    expect(res.status).toBe(200);
    const frames = framesOf(await res.text());

    expect(frames[0].data.repairing).toBe(true);
    const userTurn = seen[0].body.messages[seen[0].body.messages.length - 1].content;
    expect(userTurn).toContain("VALIDATION REPAIR REQUEST");
    expect(userTurn).toContain("wall.add is missing start");
    assert.equal(seen[0].body.temperature, 0);
  });

  it("reports a mid-stream plan error as an error frame, not a broken done frame", async () => {
    behaviour = (req, res) => writePlanStream(res, "this is not json at all");
    const frames = framesOf(await (await post({ message: "hi" })).text());
    const last = frames[frames.length - 1];
    expect(last.event).toBe("error");
    expect(last.data.code).toBe("ai_bad_response");
  });

  it("maps upstream failures to error frames", async () => {
    behaviour = (req, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { type: "invalid_api_key", message: `nope ${SECRET}` } }));
    };
    const text = await (await post({ message: "hi" })).text();
    expect(text).toContain("ai_upstream_auth");
    expect(text).not.toContain(SECRET);
  });

  it("validates requests before opening a stream", async () => {
    behaviour = (req, res) => writePlanStream(res, JSON.stringify(PLAN));
    seen.length = 0;

    let res = await post({});
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "ai_bad_request");

    res = await post({ message: "x".repeat(5000) });
    assert.equal(res.status, 400);

    res = await post({ message: "hi", repair: { plan: { a: 1 }, errors: [] } });
    assert.equal(res.status, 400);

    res = await fetch(`${base}/api/ai/plan-stream`, { method: "GET" });
    assert.equal(res.status, 405);

    assert.equal(seen.length, 0);
  });

  it("falls back to a buffered retry when the stream produces no content at all", async () => {
    let calls = 0;
    behaviour = (req, res) => {
      calls += 1;
      if (calls === 1) {
        // An empty stream (a known intermittent JSON-mode behaviour) is not a user-visible failure.
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: "deepseek-flash", choices: [{ message: { content: JSON.stringify(PLAN) } }], usage: { total_tokens: 3 } }));
    };
    const frames = framesOf(await (await post({ message: "hi" })).text());
    expect(frames.map((f) => f.event)).not.toContain("error");
    expect(frames[frames.length - 1].data.plan.summary).toBe("Add one wall.");
    assert.equal(calls, 2, "one streamed attempt plus one buffered retry");
  });

  it("answers 501 when streaming is switched off so clients use the buffered route", async () => {
    const config = {
      ...loadConfig({ DEEPSEEK_API_KEY: SECRET, AI_STREAM: "0", AI_RATE_LIMIT_PER_MIN: "1000" }),
      baseUrl: `http://127.0.0.1:1`,
    };
    const offServer = createServer({ config });
    const port = await listen(offServer);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ai/plan-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      });
      assert.equal(res.status, 501);
      assert.equal((await res.json()).error.code, "ai_streaming_disabled");
    } finally {
      await close(offServer);
    }
  });

  it("serves the demo planner as a single done frame when no key is configured", async () => {
    const config = { ...loadConfig({ AI_DEMO_PLANNER: "1", AI_RATE_LIMIT_PER_MIN: "1000" }), baseUrl: "http://127.0.0.1:1" };
    const demoServer = createServer({ config });
    const port = await listen(demoServer);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ai/plan-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Design a 9 m by 6 m studio" }),
      });
      const frames = framesOf(await res.text());
      expect(frames).toHaveLength(1);
      expect(frames[0].event).toBe("done");
      expect(frames[0].data.demo).toBe(true);
      expect(frames[0].data.model).toBe("demo-planner");
    } finally {
      await close(demoServer);
    }
  });
});
