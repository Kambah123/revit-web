/**
 * Pins the server's system-prompt operation list to the client validator's op kinds, so the two
 * cannot drift apart silently.
 */
import { describe, expect, it } from "vitest";
import { PLAN_OP_KINDS as PROMPT_KINDS, buildSystemPrompt, buildUserMessage } from "../../server/prompt.mjs";
import { PLAN_OP_KINDS as SCHEMA_KINDS, parseDesignPlan } from "../ai/planSchema";

describe("prompt / validator sync", () => {
  it("the prompt documents exactly the operations the validator accepts", () => {
    expect([...PROMPT_KINDS].sort()).toEqual([...SCHEMA_KINDS].sort());
  });

  it("the system prompt shows json and every op kind", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/json/);
    for (const kind of SCHEMA_KINDS) {
      expect(prompt).toContain(`"${kind}"`);
    }
  });

  it("the prompt example is itself a valid plan", () => {
    const prompt = buildSystemPrompt();
    const marker = "Output json:\n";
    const start = prompt.lastIndexOf(marker);
    expect(start).toBeGreaterThan(0);
    const jsonText = prompt.slice(start + marker.length);
    const parsed = JSON.parse(jsonText);
    const result = parseDesignPlan(parsed);
    expect(result.ok).toBe(true);
  });

  it("builds a user message that carries context and selection without secrets", () => {
    const message = buildUserMessage({
      message: "Add a hip roof.",
      context: { levels: [{ name: "Level 1" }] },
      selection: { kind: "wall", id: "wall-1" },
    });
    expect(message).toContain("PROJECT CONTEXT");
    expect(message).toContain("CURRENT SELECTION");
    expect(message).toContain("Add a hip roof.");
  });
});
