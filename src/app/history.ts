import type { Project } from "../model/types";

/** Maximum number of undo steps kept in memory. */
export const HISTORY_LIMIT = 200;

export interface HistoryState {
  /** Earlier states. `before` is the project as it was before the command ran. */
  past: { label: string; before: Project }[];
  present: Project;
  /** Undone states. `after` is the project as it was after the command ran. */
  future: { label: string; after: Project }[];
}

export type HistoryAction =
  | { type: "commit"; label: string; project: Project }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; project: Project };

export function initialHistory(project: Project): HistoryState {
  return { past: [], present: project, future: [] };
}

/**
 * Pure undo/redo over immutable project snapshots. Committing a new project clears the redo stack.
 * Undo and redo restore the exact snapshot, so they round-trip without drift.
 * The revision counter increases on commit only.
 */
export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "commit": {
      if (action.project === state.present) return state;
      const next: Project = { ...action.project, revision: state.present.revision + 1 };
      const past = [...state.past, { label: action.label, before: state.present }].slice(-HISTORY_LIMIT);
      return { past, present: next, future: [] };
    }
    case "undo": {
      const entry = state.past[state.past.length - 1];
      if (!entry) return state;
      return {
        past: state.past.slice(0, -1),
        present: entry.before,
        future: [{ label: entry.label, after: state.present }, ...state.future],
      };
    }
    case "redo": {
      const [entry, ...rest] = state.future;
      if (!entry) return state;
      return {
        past: [...state.past, { label: entry.label, before: state.present }],
        present: entry.after,
        future: rest,
      };
    }
    case "reset":
      return initialHistory(action.project);
  }
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}
