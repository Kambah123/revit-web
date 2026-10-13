import { useEffect, useRef, useState } from "react";
import { requestAiPlanStream, type ChatTurn, type RepairPayload } from "../ai/apiClient";
import { applyPlan, type ApplyResult } from "../ai/applyPlan";
import { buildProjectContext, describeSelection } from "../ai/context";
import { createPartialPlanReader, safeOperationLabel } from "../ai/partialPlan";
import { describeOperation, isQuickApply } from "../ai/planSchema";
import { EMPTY_USAGE, buildRepairPayload, mergeUsage, requestPlanWithAutoRepair, type UsageTotals } from "../ai/repair";
import type { DesignPlan } from "../ai/planTypes";
import type { Project } from "../model/types";

export type AiApplyHandler = (plan: DesignPlan) => ApplyResult;

interface AiArchitectPanelProps {
  project: Project;
  selection: { kind: string; id: string } | null;
  activeView: { kind: "plan" | "3d" | "elevation"; levelName?: string; direction?: string };
  onApply: AiApplyHandler;
  onClose(): void;
}

interface PlanCardEntry {
  kind: "plan";
  plan: DesignPlan;
  validation: ApplyResult;
  demo: boolean;
  model: string;
  usage: UsageTotals;
  state: "pending" | "applied" | "cancelled" | "failed";
  applyError?: string;
  /** Set when the plan in this card is the result of an automatic repair. */
  repair?: { attempts: number; errors: string[] };
  /** Validator feedback, so a retry button is a real repair request rather than a re-roll. */
  repairPayload: RepairPayload | null;
  /** The user message this plan answers: retries must re-ask that question, not a newer one. */
  sourceMessage: string;
}

interface ErrorEntry {
  kind: "error";
  text: string;
  code?: string;
  /** Deterministic validator messages, when the failure was a rejected plan. */
  errors?: string[];
  repairPayload: RepairPayload | null;
  /** The user message that failed. */
  sourceMessage: string;
}

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "status"; text: string }
  | { kind: "progress"; text: string }
  | ErrorEntry
  | PlanCardEntry;

const SUGGESTIONS = [
  "Design a 10 m by 8 m house with 3 rooms and a hip roof",
  "Add a hip roof with a 600 mm overhang",
  "Make the kitchen larger",
  "Add two windows to the front elevation",
  "Generate front, rear and side elevations",
];

function entryKey(entry: Entry, index: number): string {
  return `${index}-${entry.kind}`;
}

function formatTokens(value: number): string {
  return value.toLocaleString("en-US");
}

/** One-line description of what the automatic repair fixed. */
function repairSummary(repair: { attempts: number; errors: string[] }): string {
  const count = repair.errors.length;
  return `Repaired automatically after ${repair.attempts} extra request${repair.attempts === 1 ? "" : "s"} — fixed ${count} validation problem${count === 1 ? "" : "s"}.`;
}

/**
 * The AI Architect: conversational design → validated DesignPlan → preview → transactional apply
 * on the canonical model. This is not a chatbot bolted onto the viewport: every applied plan runs
 * through the same command layer as manual edits (undo/redo, autosave, derived views).
 *
 * Rejected output is not a dead end: the deterministic validator's own messages are sent back to
 * the model once (see src/ai/repair.ts) so a plan that failed on a fixable detail arrives fixed.
 */
export function AiArchitectPanel({ project, selection, activeView, onApply, onClose }: AiArchitectPanelProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [demoMode, setDemoMode] = useState(false);
  const [sessionUsage, setSessionUsage] = useState<UsageTotals>(EMPTY_USAGE);
  /** Live view of the plan being written (streaming transport only). */
  const [streamPreview, setStreamPreview] = useState<{ summary?: string; labels: string[]; chars: number; repairing: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ChatTurn[]>([]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, busy]);

  // Surface the server's configuration state once (demo planner vs real DeepSeek vs unconfigured).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { demo?: boolean; aiConfigured?: boolean; model?: string } | null) => {
        if (cancelled || !data) return;
        if (data.demo) {
          setDemoMode(true);
          setEntries((e) => [
            ...e,
            {
              kind: "status",
              text: "Demo planner active (no DEEPSEEK_API_KEY on this server). Responses come from a small local rule set, clearly labelled — connect the real DeepSeek API for full natural-language design.",
            },
          ]);
        } else if (data.aiConfigured) {
          setEntries((e) => [...e, { kind: "status", text: `Connected to DeepSeek (${data.model}). Describe a building or a change to get a previewed, undoable plan.` }]);
        }
      })
      .catch(() => {
        /* offline: the send path reports the error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Clears the transient "thinking / repairing" lines once a request has finished. */
  function clearProgress() {
    setEntries((e) => e.filter((x) => x.kind !== "progress"));
  }

  /**
   * One user message → one outcome. `echoUser` is false when the same message is being retried, so
   * the transcript does not show duplicate user bubbles.
   */
  async function dispatch(message: string, options: { echoUser: boolean; repair?: RepairPayload | null; note?: string }) {
    const text = message.trim();
    if (text === "" || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus(options.repair ? "Repairing…" : "Thinking…");
    setStreamPreview(null);
    setInput("");

    const history = historyRef.current.slice(-12);
    const context = buildProjectContext(project, {
      selection,
      activeView:
        activeView.kind === "plan" && activeView.levelName
          ? { kind: "plan", levelName: activeView.levelName }
          : { kind: activeView.kind, direction: activeView.direction },
    });

    setEntries((e) => [
      ...e,
      ...(options.echoUser ? [{ kind: "user" as const, text }] : []),
      ...(options.note ? [{ kind: "status" as const, text: options.note }] : []),
      { kind: "progress" as const, text: options.repair ? "Asking the model to fix the reported problems…" : "DeepSeek is thinking…" },
    ]);

    const outcome = await requestPlanWithAutoRepair(
      {
        message: text,
        history,
        context,
        selection: selection ? (describeSelection(project, selection) as unknown as Record<string, unknown> | null) : null,
      },
      {
        // Streaming transport with an automatic fall back to the buffered endpoint; the repair loop
        // never learns which transport was used.
        request: (body) => {
          const reader = createPartialPlanReader();
          let lastPaint = 0;
          let lastCount = 0;
          return requestAiPlanStream(body, {
            signal: controller.signal,
            onDelta: (chunk) => {
              const preview = reader.push(chunk);
              const now = Date.now();
              // Repaint when an operation completes, at most every 200 ms while text flows.
              if (preview.operations.length === lastCount && now - lastPaint < 200) return;
              lastPaint = now;
              lastCount = preview.operations.length;
              setStreamPreview({
                summary: preview.summary,
                labels: preview.operations.slice(-6).map((op) => safeOperationLabel(op, describeOperation)),
                chars: preview.chars,
                repairing: Boolean(body.repair),
              });
            },
          });
        },
        // Dry run only: the plan is never committed here, the user applies it explicitly.
        preview: (plan) => applyPlan(project, plan),
        onStatus: (statusText) => setEntries((e) => [...e, { kind: "progress", text: statusText }]),
      },
    );
    abortRef.current = null;
    setStreamPreview(null);

    // Every request the outcome needed (including automatic repairs) is accounted for here.
    setSessionUsage((totals) => mergeUsage(totals, outcome.usage));
    clearProgress();
    setBusy(false);
    setStatus("Ready");

    if (outcome.status === "error") {
      setEntries((e) => [
        ...e,
        // Cancelling is a user action, not a failure: no error card, nothing was applied.
        outcome.code === "ai_cancelled"
          ? { kind: "status" as const, text: "Cancelled — the request was stopped and nothing was applied." }
          : {
              kind: "error" as const,
              text: outcome.message,
              code: outcome.code,
              repairPayload: outcome.repairPayload,
              sourceMessage: text,
            },
      ]);
      historyRef.current = [...historyRef.current, { role: "user" as const, content: text }].slice(-30);
      return;
    }

    if (outcome.status === "invalid") {
      const repairPayload = outcome.repairPayload;
      // Locals: narrowing does not survive into the state-updater closure.
      const failedPlan = outcome.plan;
      const failedApply = outcome.apply;
      if (failedPlan && failedApply) {
        // The plan parsed but cannot be built: show exactly which operation failed.
        setEntries((e) => [
          ...e,
          {
            kind: "plan",
            plan: failedPlan,
            validation: failedApply,
            demo: outcome.demo,
            model: outcome.model,
            usage: outcome.usage,
            state: "failed",
            applyError: outcome.errors[0] ?? "This plan cannot be applied as proposed.",
            repairPayload,
            sourceMessage: text,
          },
        ]);
      } else {
        setEntries((e) => [
          ...e,
          {
            kind: "error",
            code: "plan_invalid",
            text: `The AI response did not match the design-plan schema after an automatic repair attempt.`,
            errors: outcome.errors,
            repairPayload,
            sourceMessage: text,
          },
        ]);
      }
      historyRef.current = [...historyRef.current, { role: "user" as const, content: text }].slice(-30);
      return;
    }

    const plan = outcome.plan;
    const assistantText =
      plan.summary +
      (plan.assumptions.length > 0 ? `\n\nAssumptions: ${plan.assumptions.join(" · ")}` : "") +
      (plan.clarifications.length > 0 ? `\n\nNeeds input: ${plan.clarifications.map((c) => c.question).join(" · ")}` : "") +
      (plan.unsupported.length > 0
        ? `\n\nNot supported: ${plan.unsupported.map((u) => `${u.request} — ${u.reason}${u.alternative ? ` (alternative: ${u.alternative})` : ""}`).join(" · ")}`
        : "");

    historyRef.current = [
      ...historyRef.current,
      { role: "user" as const, content: text },
      { role: "assistant" as const, content: plan.summary },
    ].slice(-30);

    // Disclose the repair: what was wrong, and how many extra requests it cost.
    const repairNotes: Entry[] = outcome.repair
      ? [
          { kind: "status", text: repairSummary(outcome.repair) },
          ...outcome.repair.errors.slice(0, 3).map((error) => ({ kind: "status" as const, text: `fixed: ${error}` })),
        ]
      : [];

    setEntries((e) => [
      ...e,
      ...repairNotes,
      { kind: "assistant", text: assistantText },
      {
        kind: "plan",
        plan,
        validation: outcome.apply,
        demo: outcome.demo,
        model: outcome.model,
        usage: outcome.usage,
        state: "pending",
        repair: outcome.repair,
        repairPayload: outcome.repairPayload,
        sourceMessage: text,
      },
    ]);
  }

  const send = (text: string) => dispatch(text, { echoUser: true });

  /** Stops the in-flight request: the stream is aborted upstream, so tokens stop being spent. */
  function cancelRequest() {
    abortRef.current?.abort();
  }

  /**
   * Retry after a failure. When validator feedback exists it is sent back (a genuine repair), so the
   * button does what it says; otherwise the original message is simply re-sent.
   */
  function retry(message: string, repairPayload: RepairPayload | null) {
    void dispatch(message, {
      echoUser: false,
      repair: repairPayload,
      note: repairPayload ? "Retrying with the validation problems as feedback…" : "Retrying…",
    });
  }

  function applyPlanEntry(index: number) {
    const entry = entries[index];
    if (!entry || entry.kind !== "plan" || entry.state !== "pending") return;
    // Run the model edit in the event handler (never inside a state updater), then mark the card.
    const result = onApply(entry.plan);
    setEntries((e) =>
      e.map((x, i) =>
        i === index && x.kind === "plan"
          ? {
              ...x,
              state: result.ok ? ("applied" as const) : ("failed" as const),
              applyError: result.ok ? undefined : result.error,
              // A model that changed under the preview is repair feedback too.
              repairPayload: result.ok ? x.repairPayload : buildRepairPayload(x.plan, x.plan, [result.error ?? "apply failed"]),
            }
          : x,
      ),
    );
  }

  function cancelPlan(index: number) {
    setEntries((e) => e.map((x, i) => (i === index && x.kind === "plan" ? { ...x, state: "cancelled" as const } : x)));
  }

  /** Answering a clarification keeps the conversation going with the question in context. */
  function answerClarification(question: string, answer: string) {
    void send(`Answer to "${question}": ${answer}`);
  }

  // Rendered inline so the transcript stays a single, readable map over entries.
  function renderOutcomeActions(entry: PlanCardEntry, index: number) {
    return (
      <>
        {entry.state === "pending" ? (
          <div className="ai-plan-actions">
            <button
              className="ai-apply"
              onClick={() => applyPlanEntry(index)}
              disabled={!entry.validation.ok || !entry.validation.changed}
              title={entry.validation.ok ? "Apply as one undo step" : "Fix or retry the plan first"}
            >
              {isQuickApply(entry.plan) ? "Quick apply" : "Apply changes"}
            </button>
            <button className="ai-cancel" onClick={() => cancelPlan(index)}>
              Cancel
            </button>
          </div>
        ) : null}
        {entry.state === "failed" ? (
          <div className="ai-plan-actions">
            <button className="ai-fix" onClick={() => retry(entry.sourceMessage, entry.repairPayload)} disabled={busy} title="Send the failure back to the model and ask for a corrected plan">
              Try to fix
            </button>
            <button className="ai-cancel" onClick={() => cancelPlan(index)}>
              Dismiss
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <aside className="panel ai-panel" aria-label="AI Architect">
      <div className="ai-header">
        <h2>AI Architect</h2>
        <span className={`ai-status ${busy ? "busy" : ""}`}>{status}</span>
        <button className="link" onClick={onClose} title="Close the AI Architect panel">
          Close
        </button>
      </div>

      {demoMode ? <div className="ai-banner demo">Demo planner — not DeepSeek. Local deterministic plans for preview only.</div> : null}

      <div className="ai-transcript" ref={transcriptRef}>
        {entries.length === 0 ? (
          <div className="ai-empty">
            <p>Describe a building or a change in plain English. You can use metres, millimetres or feet.</p>
            <ul>
              <li>New designs become real walls, rooms, floors, doors, windows and hip roofs.</li>
              <li>Edits target existing elements — “add a hip roof with a 600 mm overhang”, “make the kitchen larger”.</li>
              <li>Every change is previewed first and lands as one undo step.</li>
              <li>If a plan fails validation it is repaired automatically and reported, not silently dropped.</li>
            </ul>
            <p className="muted">Conceptual design support only — not building-code or engineering approval.</p>
          </div>
        ) : null}
        {entries.map((entry, index) => (
          <div key={entryKey(entry, index)} className={`ai-entry ${entry.kind}`}>
            {entry.kind === "user" ? (
              <>
                <div className="ai-bubble user">{entry.text}</div>
              </>
            ) : entry.kind === "assistant" ? (
              <div className="ai-bubble assistant">{entry.text}</div>
            ) : entry.kind === "status" ? (
              <div className="ai-note">{entry.text}</div>
            ) : entry.kind === "progress" ? (
              <div className="ai-note progress">
                <span className="ai-spinner" aria-hidden="true" />
                {entry.text}
              </div>
            ) : entry.kind === "error" ? (
              <div className="ai-bubble error">
                <div>{entry.text}</div>
                {entry.errors && entry.errors.length > 0 ? (
                  <ul className="ai-error-list">
                    {entry.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {entry.errors.length > 5 ? <li className="muted">+{entry.errors.length - 5} more</li> : null}
                  </ul>
                ) : null}
                <div className="ai-plan-actions">
                  <button
                    onClick={() => retry(entry.sourceMessage, entry.repairPayload)}
                    disabled={busy}
                    title={entry.repairPayload ? "Resend with the validator's messages as feedback" : "Send the request again"}
                  >
                    {entry.repairPayload ? "Try to fix" : "Retry"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={`ai-plan ${entry.state}`}>
                <div className="ai-plan-head">
                  <strong>
                    {entry.state === "applied"
                      ? "Applied"
                      : entry.state === "cancelled"
                        ? "Cancelled"
                        : entry.state === "failed"
                          ? "Could not be built"
                          : isQuickApply(entry.plan)
                            ? "Quick proposal"
                            : "Proposed changes"}
                  </strong>
                  {entry.repair ? <span className="ai-repair-tag" title={entry.repair.errors.join("\n")}>auto-repaired</span> : null}
                  {entry.demo ? <span className="ai-demo-tag">demo</span> : null}
                  <span className="ai-plan-meta">
                    {entry.model}
                    {entry.usage.total > 0 ? ` · ${formatTokens(entry.usage.total)} tok` : ""}
                  </span>
                </div>
                <div className="ai-plan-summary">{entry.plan.summary}</div>
                {entry.repair ? <div className="ai-note">{repairSummary(entry.repair)}</div> : null}
                {entry.plan.assumptions.length > 0 ? (
                  <div className="ai-plan-section">
                    <h4>Assumptions</h4>
                    <ul>
                      {entry.plan.assumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {entry.plan.clarifications.length > 0 ? (
                  <div className="ai-plan-section questions">
                    <h4>Needs input</h4>
                    <ul>
                      {entry.plan.clarifications.map((q, i) => (
                        <li key={i}>
                          <div>{q.question}</div>
                          {q.options && q.options.length > 0 ? (
                            <div className="ai-clarify-options">
                              {q.options.map((option) => (
                                <button
                                  key={option}
                                  className="ai-chip small"
                                  disabled={busy}
                                  onClick={() => answerClarification(q.question, option)}
                                  title={`Answer: ${option}`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {!q.options || q.options.length === 0 ? <div className="muted">Answer in the box below to continue.</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {entry.plan.unsupported.length > 0 ? (
                  <div className="ai-plan-section unsupported">
                    <h4>Not supported</h4>
                    <ul>
                      {entry.plan.unsupported.map((u, i) => (
                        <li key={i}>
                          <strong>{u.request}:</strong> {u.reason}
                          {u.alternative ? <div className="muted">Alternative: {u.alternative}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="ai-plan-section">
                  <h4>
                    Operations ({entry.plan.operations.length})
                    {entry.state === "pending" && entry.validation.ok ? " — validated" : ""}
                  </h4>
                  <ol className="ai-ops">
                    {entry.plan.operations.map((op, i) => {
                      const outcome = entry.validation.outcomes[i];
                      return (
                        <li key={i} className={outcome?.status ?? "ok"}>
                          {describeOperation(op)}
                          {outcome && outcome.status === "error" ? <div className="muted">{outcome.detail}</div> : null}
                        </li>
                      );
                    })}
                  </ol>
                </div>
                {entry.state === "failed" && entry.applyError ? <div className="ai-bubble error">{entry.applyError}</div> : null}
                {renderOutcomeActions(entry, index)}
                {entry.state === "applied" ? <div className="ai-note">Applied to the model. Use Undo (Ctrl+Z) to revert this change.</div> : null}
              </div>
            )}
          </div>
        ))}
        {streamPreview ? (
          <div className="ai-entry">
            <div className="ai-stream" aria-live="polite">
              <div className="ai-stream-head">
                <span className="ai-spinner" aria-hidden="true" />
                <strong>{streamPreview.repairing ? "Fixing the reported problems…" : "Writing the plan…"}</strong>
                <span className="ai-plan-meta">{streamPreview.chars.toLocaleString("en-US")} chars</span>
              </div>
              {streamPreview.summary ? <div className="ai-stream-summary">{streamPreview.summary}</div> : null}
              <div className="ai-note">
                {streamPreview.labels.length === 0
                  ? "Waiting for the first operation…"
                  : `${streamPreview.labels.length} operation${streamPreview.labels.length === 1 ? "" : "s"} so far`}
              </div>
              <ol className="ai-ops">
                {streamPreview.labels.map((label, i) => (
                  <li key={i}>{label}</li>
                ))}
              </ol>
              <div className="ai-plan-actions">
                <button className="ai-cancel" onClick={cancelRequest} title="Stop the request (stops token spend; nothing is applied)">
                  Cancel
                </button>
              </div>
              <div className="ai-note muted">Preview only — the plan is validated when it is complete.</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="ai-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="ai-chip" disabled={busy} onClick={() => void send(s)} title={s}>
            {s}
          </button>
        ))}
      </div>

      <div className="ai-composer">
        <textarea
          className="ai-input"
          value={input}
          rows={2}
          placeholder="Describe a building or a change… (Enter to send, Shift+Enter for a new line)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button className="ai-send" onClick={() => void send(input)} disabled={busy || input.trim() === ""}>
          Send
        </button>
      </div>
      <p className="muted ai-footnote">
        Conceptual design only. Not building-code compliance or professional engineering approval.
        {sessionUsage.requests > 0 ? ` Session: ${sessionUsage.requests} request${sessionUsage.requests === 1 ? "" : "s"}${sessionUsage.total > 0 ? ` · ${formatTokens(sessionUsage.total)} tokens` : ""}.` : ""}
      </p>
    </aside>
  );
}
