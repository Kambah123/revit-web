/**
 * Request validation for POST /api/ai/plan. Accepts only compact conversational payloads; anything
 * oversized or malformed is refused before the DeepSeek API is contacted.
 */

export const LIMITS = {
  messageChars: 4_000,
  historyTurns: 30,
  historyContentChars: 2_000,
  contextChars: 40_000,
};

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: { message: string, history: { role: string, content: string }[], context: object | null, selection: object | null } }
 *         | { ok: false, message: string }}
 */
export function validatePlanRequest(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const { message, history, context, selection } = body;

  if (typeof message !== "string" || message.trim() === "") {
    return { ok: false, message: "\"message\" is required and must be a non-empty string." };
  }
  if (message.length > LIMITS.messageChars) {
    return { ok: false, message: `"message" must be at most ${LIMITS.messageChars} characters.` };
  }

  let checkedHistory = [];
  if (history !== undefined && history !== null) {
    if (!Array.isArray(history)) return { ok: false, message: "\"history\" must be an array." };
    if (history.length > LIMITS.historyTurns) {
      return { ok: false, message: `"history" must have at most ${LIMITS.historyTurns} turns.` };
    }
    for (const turn of history) {
      if (turn === null || typeof turn !== "object" || Array.isArray(turn)) {
        return { ok: false, message: "Each history entry must be an object." };
      }
      if (turn.role !== "user" && turn.role !== "assistant") {
        return { ok: false, message: "History roles must be \"user\" or \"assistant\"." };
      }
      if (typeof turn.content !== "string" || turn.content.length > LIMITS.historyContentChars) {
        return { ok: false, message: `History content must be a string of at most ${LIMITS.historyContentChars} characters.` };
      }
      checkedHistory.push({ role: turn.role, content: turn.content });
    }
  }

  const checkObject = (value, label) => {
    if (value === undefined || value === null) return { ok: true, value: null };
    if (typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: `"${label}" must be an object.` };
    }
    const size = JSON.stringify(value).length;
    if (size > LIMITS.contextChars) {
      return { ok: false, message: `"${label}" must serialize to at most ${LIMITS.contextChars} characters.` };
    }
    return { ok: true, value };
  };

  const checkedContext = checkObject(context, "context");
  if (!checkedContext.ok) return checkedContext;
  const checkedSelection = checkObject(selection, "selection");
  if (!checkedSelection.ok) return checkedSelection;

  return {
    ok: true,
    value: {
      message: message.trim(),
      history: checkedHistory,
      context: checkedContext.value,
      selection: checkedSelection.value,
    },
  };
}
