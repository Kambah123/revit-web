/**
 * Incremental reader for a DesignPlan as the model writes it.
 *
 * The model streams raw json text; the UI wants "7 operations so far" and the newest labels while
 * the plan is still being written. This is a tolerant, incremental scanner: it tracks the
 * `operations` array, buffers partial frames, and parses each operation object only once it is
 * complete. Anything malformed is skipped — a partial preview must never throw, and it is never
 * trusted: the finished text still goes through the authoritative validator in `planSchema.ts`.
 *
 * Nothing here commits to the model: previews are display-only.
 */

export interface PartialPreview {
  /** Characters of plan json received so far. */
  chars: number;
  /** Complete operation objects seen so far, in order. */
  operations: Record<string, unknown>[];
  /** The plan summary once its string is complete. */
  summary?: string;
}

export interface PartialPlanReader {
  /** Feeds newly received text and returns the current preview. */
  push(chunk: string): PartialPreview;
  /** Everything received so far. */
  text(): string;
  /** The current preview without feeding more text. */
  preview(): PartialPreview;
}

/** Reads a complete json string value that follows `"<key>":`; used for the summary. */
function readStringValue(text: string, key: string): string | undefined {
  const keyIndex = text.indexOf(`"${key}"`);
  if (keyIndex === -1) return undefined;
  const colon = text.indexOf(":", keyIndex + key.length + 2);
  if (colon === -1) return undefined;
  let index = colon + 1;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (text[index] !== '"') return undefined;
  const start = index;
  index += 1;
  let escaped = false;
  while (index < text.length) {
    const char = text[index];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') {
      try {
        return JSON.parse(text.slice(start, index + 1)) as string;
      } catch {
        return undefined;
      }
    }
    index += 1;
  }
  return undefined; // the string is still being written
}

export function createPartialPlanReader(): PartialPlanReader {
  let text = "";
  let cursor = 0;
  /** Set once the opening bracket of the operations array has been found. */
  let inOperations = false;
  /** Brace depth inside the operations array (0 = between operations). */
  let depth = 0;
  /** Start index of the operation object currently being scanned, -1 if none. */
  let opStart = -1;
  let inString = false;
  let escaped = false;
  let operationsStart = -1;
  const operations: Record<string, unknown>[] = [];

  /**
   * Scans forward from the cursor. String-aware, so braces inside model prose (a summary containing
   * "{...}") can never be mistaken for structure.
   */
  function scan(): void {
    while (cursor < text.length) {
      const char = text[cursor];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        cursor += 1;
        continue;
      }

      if (char === '"') {
        inString = true;
        cursor += 1;
        continue;
      }

      if (!inOperations) {
        if (char === "[") {
          // Only the array that directly follows the "operations" key counts.
          const prefix = text.slice(Math.max(0, cursor - 24), cursor);
          if (/"operations"\s*:\s*$/.test(prefix)) {
            inOperations = true;
            operationsStart = cursor;
            depth = 0;
            opStart = -1;
          }
        }
        cursor += 1;
        continue;
      }

      if (char === "{") {
        if (depth === 0) opStart = cursor;
        depth += 1;
        cursor += 1;
        continue;
      }
      if (char === "}") {
        depth -= 1;
        cursor += 1;
        if (depth === 0 && opStart !== -1) {
          const slice = text.slice(opStart, cursor);
          opStart = -1;
          try {
            const parsed = JSON.parse(slice) as unknown;
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
              operations.push(parsed as Record<string, unknown>);
            }
          } catch {
            /* an operation that is not valid json is simply not previewed */
          }
        }
        continue;
      }
      if (char === "]" && depth === 0) {
        // End of the operations array: stop accumulating structure, keep what was parsed.
        inOperations = false;
        cursor += 1;
        continue;
      }
      cursor += 1;
    }
  }

  const preview = (): PartialPreview => {
    const result: PartialPreview = { chars: text.length, operations: [...operations] };
    const header = operationsStart === -1 ? text : text.slice(0, operationsStart);
    const summary = readStringValue(header, "summary");
    if (summary !== undefined) result.summary = summary;
    return result;
  };

  return {
    push(chunk: string): PartialPreview {
      text += chunk;
      scan();
      return preview();
    },
    text: () => text,
    preview,
  };
}

/**
 * A label for an operation that may still be incomplete. `describeOperation` is authoritative but
 * assumes a validated operation, so this falls back to the operation kind rather than throwing
 * mid-stream.
 */
export function safeOperationLabel(operation: Record<string, unknown>, describe: (op: never) => string): string {
  const kind = typeof operation.op === "string" ? operation.op : "operation";
  try {
    return describe(operation as never);
  } catch {
    return kind;
  }
}
