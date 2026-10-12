import { describe, expect, it } from "vitest";
import { addOpening, addWall, deleteWall, renameLevel } from "../model/commands";
import { canRedo, canUndo, historyReducer, initialHistory, HISTORY_LIMIT } from "../app/history";
import { serializeProject } from "../model/schema";
import { freshProject, ids } from "./helpers";

describe("undo / redo", () => {
  it("undo and redo restore exact earlier and later states", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let state = initialHistory(p0);
    const p1 = addWall(state.present, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 }).project;
    state = historyReducer(state, { type: "commit", label: "Add wall", project: p1 });
    const p2 = addOpening(state.present, p1.walls[0].id, i.door, 2000).project;
    state = historyReducer(state, { type: "commit", label: "Add door", project: p2 });
    // The states as the history recorded them (the revision counter is set on commit).
    const [s0, s1, s2] = [initialHistory(p0).present, state.past[1].before, state.present];

    state = historyReducer(state, { type: "undo" });
    expect(serializeProject(state.present)).toBe(serializeProject(s1));
    state = historyReducer(state, { type: "undo" });
    expect(serializeProject(state.present)).toBe(serializeProject(s0));
    expect(canUndo(state)).toBe(false);

    state = historyReducer(state, { type: "redo" });
    state = historyReducer(state, { type: "redo" });
    expect(serializeProject(state.present)).toBe(serializeProject(s2));
    expect(canRedo(state)).toBe(false);
  });

  it("a new commit after undo discards the redo stack", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let state = initialHistory(p0);
    const p1 = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 }).project;
    state = historyReducer(state, { type: "commit", label: "Add wall", project: p1 });
    state = historyReducer(state, { type: "undo" });
    expect(canRedo(state)).toBe(true);
    const p2 = renameLevel(state.present, i.level1, "Ground");
    state = historyReducer(state, { type: "commit", label: "Rename", project: p2 });
    expect(canRedo(state)).toBe(false);
  });

  it("increments the revision on commit only, and undo restores the earlier revision", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let state = initialHistory(p0);
    expect(state.present.revision).toBe(0);
    const p1 = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 }).project;
    state = historyReducer(state, { type: "commit", label: "Add wall", project: p1 });
    expect(state.present.revision).toBe(1);
    state = historyReducer(state, { type: "undo" });
    expect(state.present.revision).toBe(0);
  });

  it("does not record a commit that did not change the project", () => {
    const p0 = freshProject();
    const state = initialHistory(p0);
    expect(historyReducer(state, { type: "commit", label: "noop", project: p0 })).toBe(state);
  });

  it("deleting a wall is undone together with its openings", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const p1 = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 }).project;
    const p2 = addOpening(p1, p1.walls[0].id, i.door, 2000).project;
    let state = initialHistory(p2);
    state = historyReducer(state, { type: "commit", label: "Delete wall", project: deleteWall(p2, p2.walls[0].id) });
    expect(state.present.openings).toHaveLength(0);
    state = historyReducer(state, { type: "undo" });
    expect(state.present.walls).toHaveLength(1);
    expect(state.present.openings).toHaveLength(1);
  });

  it("keeps at most HISTORY_LIMIT steps", () => {
    const p0 = freshProject();
    let state = initialHistory(p0);
    for (let n = 0; n < HISTORY_LIMIT + 20; n += 1) {
      state = historyReducer(state, {
        type: "commit",
        label: `Rename ${n}`,
        project: renameLevel(state.present, p0.levels[0].id, `Name ${n}`),
      });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it("reset replaces the project and clears history", () => {
    const p0 = freshProject();
    let state = initialHistory(p0);
    state = historyReducer(state, { type: "commit", label: "x", project: renameLevel(p0, p0.levels[0].id, "A") });
    state = historyReducer(state, { type: "reset", project: freshProject() });
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });
});
