import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openProjectStore, migrateLegacyProject } from "../studio/projectStore";
import { createSampleProject } from "../studio/sampleProject";
import { createProject } from "../model/project";
import { serializeProject, parseProject } from "../model/schema";
import { AUTOSAVE_KEY } from "../persistence/autosave";

describe("Contour project library", () => {
  it.each([false, true])(
    "creates a valid editable example (compact=%s)",
    (compact) => {
      const p = createSampleProject(compact);
      expect(p.walls.length).toBeGreaterThan(4);
      expect(p.openings.length).toBeGreaterThan(3);
      expect(p.rooms.length).toBeGreaterThan(2);
      expect(parseProject(serializeProject(p))).toEqual(p);
    },
  );
  it("round-trips two separate projects and updates without creating duplicates", async () => {
    const store = await openProjectStore(new IDBFactory());
    const a = createSampleProject(),
      b = createSampleProject(true);
    await store.put(a);
    await store.put(b);
    expect(await store.list()).toHaveLength(2);
    await store.put({ ...a, name: "Updated house" });
    const rows = await store.list();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === a.id)?.project.name).toBe("Updated house");
    expect(rows.find((r) => r.id === b.id)?.project).toEqual(b);
    await store.remove(a.id);
    expect((await store.list()).map((r) => r.id)).toEqual([b.id]);
    store.close();
  });
  it("preserves the legacy backup and imports only once by identity", async () => {
    const store = await openProjectStore(new IDBFactory());
    const p = createProject("Legacy");
    const data = new Map([[AUTOSAVE_KEY, serializeProject(p)]]);
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
    await migrateLegacyProject(store, storage);
    await store.put({ ...p, name: "Newer library edit" });
    await migrateLegacyProject(store, storage);
    expect(await store.list()).toHaveLength(1);
    expect((await store.list())[0].name).toBe("Newer library edit");
    expect(data.get(AUTOSAVE_KEY)).toBe(serializeProject(p));
    store.close();
  });
  it("does not erase invalid legacy recovery data", async () => {
    const store = await openProjectStore(new IDBFactory());
    const raw = "broken";
    const storage = {
      getItem: () => raw,
      setItem: () => {
        throw Error("Must not mutate");
      },
      removeItem: () => {
        throw Error("Must not delete");
      },
    };
    await expect(migrateLegacyProject(store, storage)).rejects.toThrow(
      "preserved",
    );
    expect(await store.list()).toHaveLength(0);
    store.close();
  });
  it("does not reseed an intentionally empty initialized library", async () => {
    const factory = new IDBFactory();
    const store = await openProjectStore(factory);
    expect(await store.initialized()).toBe(false);
    await store.markInitialized();
    store.close();
    const reopened = await openProjectStore(factory);
    expect(await reopened.initialized()).toBe(true);
    expect(await reopened.list()).toHaveLength(0);
    reopened.close();
  });
  it("rejects invalid models before overwriting stored data", async () => {
    const store = await openProjectStore(new IDBFactory());
    const p = createSampleProject();
    await store.put(p);
    await expect(store.put({ ...p, levels: [] })).rejects.toThrow();
    expect((await store.list())[0].project).toEqual(p);
    store.close();
  });
});
