import { useEffect, useRef, useState } from "react";
import { requestAiPlan, type ChatTurn } from "../ai/apiClient";
import { applyPlan, type ApplyResult } from "../ai/applyPlan";
import { buildProjectContext, describeSelection } from "../ai/context";
import { describeOperation, isQuickApply, parseDesignPlan } from "../ai/planSchema";
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

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "status"; text: string }
  | { kind: "error"; text: string; code?: string }
  | {
      kind: "plan";
      plan: DesignPlan;
      validation: ApplyResult;
      demo: boolean;
      state: "pending" | "applied" | "cancelled" | "failed";
      applyError?: string;
    };

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

/**
 * The AI Architect: conversational design → validated DesignPlan → preview → transactional apply
 * on the canonical model. This is not a chatbot bolted onto the viewport: every applied plan runs
 * through the same command layer as manual edits (undo/redo, autosave, derived views).
 */
export function AiArchitectPanel({ project, selection, activeView, onApply, onClose }: AiArchitectPanelProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
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

  async function send(text: string, repairNote?: string) {
    const message = text.trim();
    if (message === "" || busy) return;
    const thinkingText = demoMode ? "Demo planner is preparing a proposal…" : "DeepSeek is thinking…";
    setBusy(true);
    setInput("");
    setEntries((e) => [...e, { kind: "user", text: message }, ...(repairNote ? [{ kind: "status" as const, text: repairNote }] : []), { kind: "status" as const, text: thinkingText }]);

    const context = buildProjectContext(project, {
      selection,
      activeView: activeView.kind === "plan" && activeView.levelName ? { kind: "plan", levelName: activeView.levelName } : { kind: activeView.kind, direction: activeView.direction },
    });

    const result = await requestAiPlan({
      message,
      history: historyRef.current.slice(-12),
      context,
      selection: selection ? (describeSelection(project, selection) as unknown as Record<string, unknown> | null) : null,
    });

    setEntries((e) => e.filter((x) => !(x.kind === "status" && x.text === thinkingText)));

    if (!result.ok) {
      setEntries((e) => [
        ...e,
        {
          kind: "error",
          text: result.message,
          code: result.code,
        },
      ]);
      historyRef.current = [...historyRef.current, { role: "user" as const, content: message }].slice(-30);
      setBusy(false);
      return;
    }

    const parsed = parseDesignPlan(result.plan);
    if (!parsed.ok) {
      // The model's json failed our schema: keep the exchange so Retry can repair it.
      historyRef.current = [
        ...historyRef.current,
        { role: "user" as const, content: message },
        { role: "assistant" as const, content: JSON.stringify(result.plan).slice(0, 1800) },
      ].slice(-30);
      setEntries((e) => [
        ...e,
        {
          kind: "error",
          code: "plan_invalid",
          text: `The AI response did not match the design-plan schema: ${parsed.errors.slice(0, 4).join("; ")}${parsed.errors.length > 4 ? ` (+${parsed.errors.length - 4} more)` : ""}. Press Retry to ask again with the validation feedback.`,
        },
      ]);
      setBusy(false);
      return;
    }

    const plan = parsed.plan;
    // Validation pass for the preview list: never committed here.
    const validation = applyPlan(project, plan);

    const assistantText =
      plan.summary +
      (plan.assumptions.length > 0 ? `\n\nAssumptions: ${plan.assumptions.join(" · ")}` : "") +
      (plan.clarifications.length > 0 ? `\n\nNeeds input: ${plan.clarifications.map((c) => c.question).join(" · ")}` : "") +
      (plan.unsupported.length > 0 ? `\n\nNot supported: ${plan.unsupported.map((u) => `${u.request} — ${u.reason}${u.alternative ? ` (alternative: ${u.alternative})` : ""}`).join(" · ")}` : "");

    historyRef.current = [
      ...historyRef.current,
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: plan.summary },
    ].slice(-30);

    setEntries((e) => [
      ...e.filter((x) => x.kind !== "status" || x.text !== thinkingText),
      { kind: "assistant", text: assistantText },
      { kind: "plan", plan, validation, demo: result.demo, state: "pending" },
    ]);
    setBusy(false);
  }

  function applyPlanEntry(index: number) {
    const entry = entries[index];
    if (!entry || entry.kind !== "plan" || entry.state !== "pending") return;
    // Run the model edit in the event handler (never inside a state updater), then mark the card.
    const result = onApply(entry.plan);
    setEntries((e) =>
      e.map((x, i) =>
        i === index && x.kind === "plan"
          ? { ...x, state: result.ok ? ("applied" as const) : ("failed" as const), applyError: result.ok ? undefined : result.error }
          : x,
      ),
    );
  }

  function cancelPlan(index: number) {
    setEntries((e) => e.map((x, i) => (i === index && x.kind === "plan" ? { ...x, state: "cancelled" as const } : x)));
  }

  function retryLast() {
    const lastUser = [...entries].reverse().find((e) => e.kind === "user");
    if (lastUser && lastUser.kind === "user" && !busy) {
      void send(lastUser.text, "Retrying with validation feedback…");
    }
  }

  return (
    <aside className="panel ai-panel" aria-label="AI Architect">
      <div className="ai-header">
        <h2>AI Architect</h2>
        <span className={`ai-status ${busy ? "busy" : ""}`}>{busy ? "Working…" : "Ready"}</span>
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
            ) : entry.kind === "error" ? (
              <div className="ai-bubble error">
                {entry.text}
                <div className="ai-plan-actions">
                  <button onClick={retryLast} disabled={busy}>
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <div className={`ai-plan ${entry.state}`}>
                <div className="ai-plan-head">
                  <strong>{entry.state === "applied" ? "Applied" : entry.state === "cancelled" ? "Cancelled" : entry.state === "failed" ? "Failed" : isQuickApply(entry.plan) ? "Quick proposal" : "Proposed changes"}</strong>
                  {entry.demo ? <span className="ai-demo-tag">demo</span> : null}
                </div>
                <div className="ai-plan-summary">{entry.plan.summary}</div>
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
                          {q.question}
                          {q.options ? <span className="muted"> ({q.options.join(" / ")})</span> : null}
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
                {entry.state === "pending" ? (
                  <>
                    {!entry.validation.ok ? (
                      <div className="ai-bubble error">
                        {entry.validation.error ?? "This plan cannot be applied as proposed."}
                      </div>
                    ) : null}
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
                  </>
                ) : null}
                {entry.state === "failed" && entry.applyError ? <div className="ai-bubble error">{entry.applyError}</div> : null}
                {entry.state === "applied" ? <div className="ai-note">Applied to the model. Use Undo (Ctrl+Z) to revert this change.</div> : null}
              </div>
            )}
          </div>
        ))}
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
      <p className="muted ai-footnote">Conceptual design only. Not building-code compliance or professional engineering approval.</p>
    </aside>
  );
}
