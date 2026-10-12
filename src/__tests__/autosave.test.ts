import { describe, expect, it } from "vitest";
import { addWall } from "../model/commands";
import { clearAutosave, AUTOSAVE_KEY, readAutosave, writeAutosave } from "../persistence/autosave";
import { serializeProject } from "../model/schema";
import { freshProject, ids, MemoryStorage } from "./helpers";

describe("autosave", () => {
  it("writes and recovers the project", () => {
    const storage = new MemoryStorage();
    const p0 = freshProject();
    const i = ids(p0);
    const p1 = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 4000, y: 0 }).project;
    writeAutosave(storage, p1);
    const result = readAutosave(storage);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(serializeProject(result.project)).toBe(serializeProject(p1));
  });

  it("reports an empty store without error", () => {
    expect(readAutosave(new MemoryStorage())).toEqual({ status: "empty" });
  });

  it("reports a corrupt autosave instead of silently discarding it", () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTOSAVE_KEY, "{not json");
    const result = readAutosave(storage);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.message).toMatch(/not valid JSON/);
  });

  it("can be cleared", () => {
    const storage = new MemoryStorage();
    writeAutosave(storage, freshProject());
    clearAutosave(storage);
    expect(readAutosave(storage)).toEqual({ status: "empty" });
  });
});
