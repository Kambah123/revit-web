/**
 * Pins the server's system-prompt operation list to the client validator's op kinds, so the two
 * cannot drift apart silently.
 */
import { describe, expect, it } from "vitest";
import { PLAN_OP_KINDS as PROMPT_KINDS, buildRepairSection, buildSystemPrompt, buildUserMessage } from "../../server/prompt.mjs";
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

  it("tells the model how to answer a repair request", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("REPAIR REQUESTS");
    expect(prompt).toContain("VALIDATION REPAIR REQUEST");
  });

  it("builds a repair block that numbers the problems and echoes the rejected json", () => {
    const rejected = { kind: "design-plan", version: 1, operations: [{ op: "wall.add" }] };
    const section = buildRepairSection({ plan: rejected, errors: ["plan json: bad", "operation 2 (opening.add): does not fit"] });

    expect(section).toContain("PROBLEMS (2):");
    expect(section).toContain("1. plan json: bad");
    expect(section).toContain("2. operation 2 (opening.add): does not fit");
    expect(section).toContain(JSON.stringify(rejected));
    expect(section).toMatch(/COMPLETE corrected json/);

    // The block sits between the project context and the request, and never drops the request.
    const message = buildUserMessage({
      message: "Add a window.",
      context: { levels: [] },
      selection: null,
      repair: { plan: rejected, errors: ["boom"] },
    });
    expect(message.indexOf("PROJECT CONTEXT")).toBeLessThan(message.indexOf("VALIDATION REPAIR REQUEST"));
    expect(message.indexOf("VALIDATION REPAIR REQUEST")).toBeLessThan(message.indexOf("USER REQUEST:"));
    expect(message).toContain("Add a window.");
  });

  it("omits the repair block for ordinary requests", () => {
    const message = buildUserMessage({ message: "Add a wall.", context: null, selection: null });
    expect(message).not.toContain("VALIDATION REPAIR REQUEST");
    expect(message).toBe("USER REQUEST:\nAdd a wall.");
  });
});
