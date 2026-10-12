import { parseProject, serializeProject } from "../model/schema";
import type { Project } from "../model/types";

export const AUTOSAVE_KEY = "revit-web:autosave:v2";

/** The subset of the Web Storage API that autosave needs. Tests pass an in-memory implementation. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function writeAutosave(storage: KeyValueStorage, project: Project): void {
  storage.setItem(AUTOSAVE_KEY, serializeProject(project));
}

export type AutosaveRead =
  | { status: "empty" }
  | { status: "ok"; project: Project }
  | { status: "invalid"; message: string; raw: string };

/**
 * Reads the autosaved project. A corrupt or invalid autosave is reported, not silently discarded,
 * so the caller can tell the user and fall back to a new project.
 */
export function readAutosave(storage: KeyValueStorage): AutosaveRead {
  const text = storage.getItem(AUTOSAVE_KEY);
  if (text === null) return { status: "empty" };
  try {
    return { status: "ok", project: parseProject(text) };
  } catch (error) {
    return {
      status: "invalid",
      message: error instanceof Error ? error.message : "Unreadable autosave.",
      raw: text,
    };
  }
}

export function clearAutosave(storage: KeyValueStorage): void {
  storage.removeItem(AUTOSAVE_KEY);
}
