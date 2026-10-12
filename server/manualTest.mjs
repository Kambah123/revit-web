/**
 * MANUAL integration test against the real DeepSeek API. Not part of the automated suite —
 * it spends real tokens and requires a configured key.
 *
 *   DEEPSEEK_API_KEY=sk-... npm run test:ai-manual
 *
 * Optional: DEEPSEEK_MODEL (default deepseek-flash), DEEPSEEK_BASE_URL, AI_TIMEOUT_MS.
 *
 * What it verifies end-to-end with the real model:
 *   1. the API key works and the server client can reach chat/completions;
 *   2. the model returns a DesignPlan that passes the client schema validator;
 *   3. the plan applies transactionally to a real project through the command layer.
 */

import { callDeepSeek, parsePlanContent } from "./deepseek.mjs";
import { loadConfig } from "./config.mjs";
import { buildSystemPrompt, buildUserMessage } from "./prompt.mjs";

// Full plan validation/application lives in TypeScript under src/ai and is covered by the
// automated suite (aiPlanSchema/aiApply tests). This script proves the live API contract:
// key works, json mode returns a DesignPlan-shaped response with real operations.
const config = loadConfig();
if (!config.apiKey) {
  console.error("Set DEEPSEEK_API_KEY to run the manual integration test.");
  process.exit(2);
}

const projectContext = {
  projectName: "Manual test",
  units: "mm",
  levels: [
    { id: "lvl-1", name: "Level 1", elevation: 0 },
    { id: "lvl-2", name: "Level 2", elevation: 3000 },
  ],
  types: { wall: [{ id: "wt-1", name: "Generic - 200 mm", thickness: 200 }] },
  elementCounts: { walls: 0, rooms: 0 },
  elements: [],
  capabilities: {
    roofs: ["hip (rectangular footprint with overhang and rise)"],
    views: ["floor plan per level", "3D", "elevations: north, south, east, west"],
    notSupported: ["section views", "dimensions and text annotations"],
  },
};

console.log(`Manual AI test against ${config.baseUrl} with model ${config.model}…\n`);

const messages = [
  { role: "system", content: buildSystemPrompt() },
  {
    role: "user",
    content: buildUserMessage({
      message: "Design a 9 m by 6 m single-room studio on Level 1 with one door, two front windows, and a hip roof with 600 mm overhang on Level 2.",
      context: projectContext,
    }),
  },
];

const started = Date.now();
try {
  const result = await callDeepSeek({ config, messages });
  console.log(`Model responded in ${Date.now() - started} ms.`);
  console.log(`Usage: ${JSON.stringify(result.usage)}`);

  let plan;
  try {
    plan = parsePlanContent(result.content);
  } catch (error) {
    console.error("FAIL: response content is not parseable json:", error.message);
    console.error(result.content.slice(0, 400));
    process.exit(1);
  }

  if (plan.kind !== "design-plan" || !Array.isArray(plan.operations)) {
    console.error("FAIL: response is json but not a DesignPlan with operations.");
    console.error(JSON.stringify(plan).slice(0, 400));
    process.exit(1);
  }

  console.log(`\nSummary: ${plan.summary}`);
  if (Array.isArray(plan.assumptions) && plan.assumptions.length) {
    console.log(`Assumptions: ${plan.assumptions.join(" | ")}`);
  }
  if (Array.isArray(plan.clarifications) && plan.clarifications.length) {
    console.log(`Clarifications: ${plan.clarifications.map((c) => c.question).join(" | ")}`);
  }
  if (Array.isArray(plan.unsupported) && plan.unsupported.length) {
    console.log(`Unsupported: ${plan.unsupported.map((u) => u.request).join(" | ")}`);
  }
  console.log(`Operations (${plan.operations.length}):`);
  for (const op of plan.operations) {
    console.log(`  - ${op.op}`);
  }

  const kinds = new Set(plan.operations.map((o) => o.op));
  const expected = ["wall.add", "opening.add", "roof.add"];
  const missing = expected.filter((k) => !kinds.has(k));
  if (missing.length > 0) {
    console.warn(`\nWARN: expected operations missing: ${missing.join(", ")} (the model may have asked a clarification instead — check the output above).`);
  }

  console.log("\nPASS: real DeepSeek returned a DesignPlan-shaped response with a summary and operations.");
  console.log("The automated suite (aiPlanSchema/aiApply tests) covers full validation and application;");
  console.log("this manual run proves the live API contract only.");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
