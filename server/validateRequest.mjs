/**
 * Request validation for POST /api/ai/plan. Accepts only compact conversational payloads; anything
 * oversized or malformed is refused before the DeepSeek API is contacted.
 */

export const LIMITS = {
  messageChars: 4_000,
  historyTurns: 30,
  historyContentChars: 2_000,
  contextChars: 40_000,
  repairErrors: 20,
  repairErrorChars: 500,
  repairPlanChars: 40_000,
};

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: { message: string, history: { role: string, content: string }[], context: object | null, selection: object | null, repair: { plan: object, errors: string[] } | null } }
 *         | { ok: false, message: string }}
 */
export function validatePlanRequest(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const { message, history, context, selection, repair } = body;

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

  const checkedRepair = checkRepair(repair);
  if (!checkedRepair.ok) return checkedRepair;

  return {
    ok: true,
    value: {
      message: message.trim(),
      history: checkedHistory,
      context: checkedContext.value,
      selection: checkedSelection.value,
      repair: checkedRepair.value,
    },
  };
}

/**
 * Validates the optional repair block: the model's own rejected json plus the deterministic
 * validator's messages, echoed back so the model can fix exactly those problems. The json is
 * echoed as data — it is never executed and never trusted.
 *
 * @param {unknown} repair
 * @returns {{ ok: true, value: { plan: object, errors: string[] } | null } | { ok: false, message: string }}
 */
function checkRepair(repair) {
  if (repair === undefined || repair === null) return { ok: true, value: null };
  if (typeof repair !== "object" || Array.isArray(repair)) {
    return { ok: false, message: '"repair" must be an object with "plan" and "errors".' };
  }
  const plan = repair.plan;
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    return { ok: false, message: '"repair.plan" must be the json object the model returned.' };
  }
  if (JSON.stringify(plan).length > LIMITS.repairPlanChars) {
    return { ok: false, message: `"repair.plan" must serialize to at most ${LIMITS.repairPlanChars} characters.` };
  }
  if (!Array.isArray(repair.errors) || repair.errors.length === 0) {
    return { ok: false, message: '"repair.errors" must be a non-empty array of validation messages.' };
  }
  if (repair.errors.length > LIMITS.repairErrors) {
    return { ok: false, message: `"repair.errors" must have at most ${LIMITS.repairErrors} entries.` };
  }
  const errors = [];
  for (const entry of repair.errors) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return { ok: false, message: '"repair.errors" entries must be non-empty strings.' };
    }
    if (entry.length > LIMITS.repairErrorChars) {
      return { ok: false, message: `"repair.errors" entries must be at most ${LIMITS.repairErrorChars} characters.` };
    }
    errors.push(entry.trim());
  }
  return { ok: true, value: { plan, errors } };
}
