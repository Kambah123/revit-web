/**
 * Tests for the incremental partial-plan reader used by the streaming progress display. The reader
 * is display-only, so the emphasis is on tolerance: partial frames, prose containing braces, and
 * malformed fragments must never throw or invent operations.
 */
import { describe, expect, it } from "vitest";
import { createPartialPlanReader, safeOperationLabel } from "../ai/partialPlan";
import { describeOperation } from "../ai/planSchema";

const PLAN_JSON = JSON.stringify({
  kind: "design-plan",
  version: 1,
  summary: "New studio with a hip roof.",
  assumptions: [],
  clarifications: [],
  unsupported: [],
  operations: [
    { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: 9000, y: 0 }, height: 2700 },
    { op: "opening.add", opId: "d1", kind: "door", hostWall: { opId: "w1" }, offset: 4500, width: 900, height: 2100 },
    { op: "view.open", view: "3d" },
  ],
});

/** Feeds text one character at a time, as a real byte stream often does. */
function pushByCharacter(reader: ReturnType<typeof createPartialPlanReader>, text: string) {
  let last = reader.preview();
  for (const char of text) last = reader.push(char);
  return last;
}

describe("partial plan reader", () => {
  it("reports operations only once each one is complete", () => {
    const reader = createPartialPlanReader();
    const firstOpStart = PLAN_JSON.indexOf('{"op":"wall.add"');

    // Mid-way through the first operation: nothing is complete yet.
    const partial = reader.push(PLAN_JSON.slice(0, firstOpStart + 20));
    expect(partial.operations).toHaveLength(0);

    const complete = reader.push(PLAN_JSON.slice(firstOpStart + 20));
    expect(complete.operations).toHaveLength(3);
    expect(complete.operations[0].op).toBe("wall.add");
    expect(complete.operations[2].op).toBe("view.open");
  });

  it("survives being fed one character at a time and agrees with the whole-string parse", () => {
    const reader = createPartialPlanReader();
    const preview = pushByCharacter(reader, PLAN_JSON);

    expect(preview.operations).toHaveLength(3);
    expect(preview.operations).toEqual(JSON.parse(PLAN_JSON).operations);
    expect(preview.summary).toBe("New studio with a hip roof.");
    expect(preview.chars).toBe(PLAN_JSON.length);
    expect(reader.text()).toBe(PLAN_JSON);
  });

  it("is not fooled by braces or the word operations inside string values", () => {
    const reader = createPartialPlanReader();
    // The braces and the word "operations" are inside an escaped string value.
    reader.push('{"summary":"Rebuild the {\\"operations\\": [} facade","operations":[');
    const preview = reader.push('{"op":"wall.add"},');
    expect(preview.operations).toHaveLength(1);
    expect(preview.summary).toBe('Rebuild the {"operations": [} facade');
  });

  it("skips an operation that never becomes valid json instead of throwing", () => {
    const reader = createPartialPlanReader();
    const preview = reader.push('{"operations":[{"op":"wall.add","bogus":}, {"op":"view.open","view":"3d"}]}');
    expect(preview.operations).toHaveLength(1);
    expect(preview.operations[0].op).toBe("view.open");
  });

  it("stops accumulating after the operations array closes", () => {
    const reader = createPartialPlanReader();
    const preview = reader.push('{"operations":[{"op":"view.open","view":"3d"}],"extra":[{"op":"roof.add"}]}');
    expect(preview.operations).toHaveLength(1);
  });

  it("reports no summary until the string is complete", () => {
    const reader = createPartialPlanReader();
    expect(reader.push('{"summary":"Half a sen').summary).toBeUndefined();
    expect(reader.push('tence"}').summary).toBe("Half a sentence");
  });

  it("produces labels for incomplete operations without throwing", () => {
    const reader = createPartialPlanReader();
    const preview = reader.push('{"operations":[{"op":"wall.add"},{"op":"opening.add","kind":"door"}]}');
    // Real describeOperation would throw on the missing geometry: the safe wrapper must not.
    const labels = preview.operations.map((op) => safeOperationLabel(op, describeOperation));
    expect(labels).toEqual(["wall.add", "opening.add"]);

    const complete = reader.push("");
    expect(complete.operations).toHaveLength(2);
  });
});
