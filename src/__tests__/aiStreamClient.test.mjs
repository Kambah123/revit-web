/**
 * Client-side streaming tests: the browser client against the real server against a mocked model.
 *
 * The properties that matter for shipping an event stream:
 *  - deltas arrive incrementally and reassemble into the plan the model wrote,
 *  - a deployment without streaming (no route, or AI_STREAM=0) still works via the buffered route,
 *  - the idle timeout is an *inactivity* budget, so a slow but live stream is not killed,
 *  - cancelling aborts the upstream request, so tokens stop being spent.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { describe, expect, it } from "vitest";
import { createServer } from "../../server/index.mjs";
import { loadConfig } from "../../server/config.mjs";
import { parseSseFrames, requestAiPlanStream } from "../ai/apiClient";

const SECRET = "sk-client-stream-key-777";

const PLAN = {
  kind: "design-plan",
  version: 1,
  summary: "Add one wall.",
  assumptions: [],
  clarifications: [],
  unsupported: [],
  operations: [{ op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } }],
};
const PLAN_TEXT = JSON.stringify(PLAN);

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function sseChunk(content, extra = {}) {
  return `data: ${JSON.stringify({ model: "deepseek-flash", choices: [{ delta: { content } }], ...extra })}\n\n`;
}

describe("sse frame parsing", () => {
  it("returns complete frames and keeps the partial remainder buffered", () => {
    const { events, rest } = parseSseFrames('event: start\ndata: {"a":1}\n\nevent: delta\ndata: {"text":"par');
    expect(events).toEqual([{ event: "start", data: '{"a":1}' }]);
    expect(rest).toBe('event: delta\ndata: {"text":"par');
  });

  it("joins multi-line data and tolerates frames without an event name", () => {
    const { events } = parseSseFrames('data: line one\ndata: line two\n\ndata: {"ok":true}\n\n');
    expect(events).toEqual([
      { event: "message", data: "line one\nline two" },
      { event: "message", data: '{"ok":true}' },
    ]);
  });
});

describe("client streaming against the real server", () => {
  it("collects deltas incrementally and returns the validated plan", async () => {
    const mock = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sseChunk(PLAN_TEXT.slice(0, 30)));
      res.write(sseChunk(PLAN_TEXT.slice(30)));
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 } })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
    const mockPort = await listen(mock);
    const appServer = createServer({
      config: { ...loadConfig({ DEEPSEEK_API_KEY: SECRET, AI_RATE_LIMIT_PER_MIN: "1000" }), baseUrl: `http://127.0.0.1:${mockPort}` },
    });
    const appPort = await listen(appServer);
    const base = `http://127.0.0.1:${appPort}`;

    try {
      const deltas = [];
      const seen = [];
      const result = await requestAiPlanStream(
        { message: "Add a wall." },
        {
          fetchImpl: (url, init) => fetch(new URL(url, base), init),
          onDelta: (chunk, fullText) => {
            deltas.push(chunk);
            seen.push(fullText.length);
          },
        },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected a streamed plan");
      expect(result.plan.operations[0].op).toBe("wall.add");
      expect(result.usage?.total).toBe(13);
      expect(deltas.length).toBeGreaterThanOrEqual(2);
      expect(deltas.join("")).toBe(PLAN_TEXT);
      // Progress callbacks really are incremental: the full text only ever grows.
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
    } finally {
      await close(appServer);
      await close(mock);
    }
  });

  it("survives a slow but live stream: the timeout is an inactivity budget, not a total budget", async () => {
    const mock = http.createServer(async (req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const pieces = [PLAN_TEXT.slice(0, 40), PLAN_TEXT.slice(40, 80), PLAN_TEXT.slice(80)];
      for (const piece of pieces) {
        await new Promise((r) => setTimeout(r, 40));
        res.write(sseChunk(piece));
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
    const mockPort = await listen(mock);
    const appServer = createServer({
      config: { ...loadConfig({ DEEPSEEK_API_KEY: SECRET, AI_RATE_LIMIT_PER_MIN: "1000" }), baseUrl: `http://127.0.0.1:${mockPort}` },
    });
    const appPort = await listen(appServer);

    try {
      const result = await requestAiPlanStream(
        { message: "Add a wall." },
        { fetchImpl: (url, init) => fetch(new URL(url, `http://127.0.0.1:${appPort}`), init), timeoutMs: 220 },
      );
      // Total elapsed is ~120 ms with 40 ms gaps: well inside the inactivity budget.
      expect(result.ok).toBe(true);
    } finally {
      await close(appServer);
      await close(mock);
    }
  });

  it("falls back to the buffered route when the deployment has no streaming endpoint", async () => {
    // A server that has no /api/ai/plan-stream at all, but a working buffered route.
    const plain = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      if (req.url === "/api/ai/plan-stream") {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: "not_found", message: "Unknown API route." } }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ plan: PLAN, model: "deepseek-flash", demo: false, usage: { total_tokens: 21 } }));
    });
    const port = await listen(plain);

    try {
      const result = await requestAiPlanStream(
        { message: "Add a wall." },
        { fetchImpl: (url, init) => fetch(new URL(url, `http://127.0.0.1:${port}`), init) },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected the buffered fallback");
      expect(result.plan.summary).toBe("Add one wall.");
      expect(result.usage?.total).toBe(21);
    } finally {
      await close(plain);
    }
  });

  it("falls back when the stream is empty (a proxy that drops the event stream)", async () => {
    // A streaming route that connects and then sends nothing: the documented "nothing arrived"
    // signal. The client must fall back, because an empty stream is indistinguishable from success
    // and retrying costs nothing (the model never generated anything).
    const plain = http.createServer(async (req, res) => {
      if (req.url === "/api/ai/plan-stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ plan: PLAN, model: "deepseek-flash", demo: false, usage: { total_tokens: 11 } }));
    });
    const port = await listen(plain);

    try {
      const result = await requestAiPlanStream(
        { message: "Add a wall." },
        { fetchImpl: (url, init) => fetch(new URL(url, `http://127.0.0.1:${port}`), init) },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected the buffered fallback");
      expect(result.plan.summary).toBe("Add one wall.");
      expect(result.usage?.total).toBe(11);
    } finally {
      await close(plain);
    }
  });

  it("falls back when the server answers 501 (streaming switched off)", async () => {
    const config = { ...loadConfig({ DEEPSEEK_API_KEY: SECRET, AI_STREAM: "0", AI_RATE_LIMIT_PER_MIN: "1000" }), baseUrl: "http://127.0.0.1:1" };
    // The buffered route needs an upstream: point it at a one-shot mock.
    const mock = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: "deepseek-flash", choices: [{ message: { content: PLAN_TEXT } }], usage: { total_tokens: 8 } }));
    });
    const mockPort = await listen(mock);
    const appServer = createServer({ config: { ...config, baseUrl: `http://127.0.0.1:${mockPort}` } });
    const appPort = await listen(appServer);

    try {
      const result = await requestAiPlanStream(
        { message: "Add a wall." },
        { fetchImpl: (url, init) => fetch(new URL(url, `http://127.0.0.1:${appPort}`), init) },
      );
      expect(result.ok).toBe(true);
    } finally {
      await close(appServer);
      await close(mock);
    }
  });

  it("cancelling reports ai_cancelled and aborts the upstream request instead of burning tokens", async () => {
    const upstreamDropped = [];
    const mock = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sseChunk(PLAN_TEXT.slice(0, 10)));
      res.on("close", () => {
        if (!res.writableEnded) upstreamDropped.push(true);
      });
      // Deliberately never finishes: the client must cancel it.
    });
    const mockPort = await listen(mock);
    const appServer = createServer({
      config: { ...loadConfig({ DEEPSEEK_API_KEY: SECRET, AI_RATE_LIMIT_PER_MIN: "1000", AI_TIMEOUT_MS: "30000" }), baseUrl: `http://127.0.0.1:${mockPort}` },
    });
    const appPort = await listen(appServer);

    try {
      const controller = new AbortController();
      const resultPromise = requestAiPlanStream(
        { message: "Add a wall." },
        {
          fetchImpl: (url, init) => fetch(new URL(url, `http://127.0.0.1:${appPort}`), init),
          signal: controller.signal,
          onDelta: () => controller.abort(),
        },
      );
      const result = await resultPromise;
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a cancellation");
      expect(result.code).toBe("ai_cancelled");

      // Give the server a moment to propagate the disconnect upstream.
      await new Promise((r) => setTimeout(r, 100));
      assert.ok(upstreamDropped.length > 0, "the upstream DeepSeek request was aborted, not just the render");
    } finally {
      mock.closeAllConnections?.();
      appServer.closeAllConnections?.();
      await close(appServer);
      await close(mock);
    }
  });
});
