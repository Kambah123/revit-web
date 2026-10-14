import { describe, expect, it } from "vitest";
import { createProject } from "../model/project";
import {
  addDimension,
  updateDimension,
  deleteDimension,
  deleteLevel,
  addWall,
  updateWall,
} from "../model/commands";
import {
  dimensionGeometry,
  dimensionOffset,
  dimensionLabel,
} from "../geometry/dimensions";
import { serializeProject, parseProject } from "../model/schema";
import { initialHistory, historyReducer } from "../app/history";
import { openProjectStore } from "../studio/projectStore";
import { IDBFactory } from "fake-indexeddb";
const p = () => createProject("Dimensions");
const start = { x: 1000, y: 2000 },
  end = { x: 4000, y: 6000 };
describe("static linear dimensions", () => {
  it("measures diagonal Euclidean distance accurately with explicit display units", () => {
    expect(dimensionLabel({ start, end, unit: "mm" })).toBe("5000 mm");
    expect(dimensionLabel({ start, end, unit: "m" })).toBe("5.000 m");
    expect(
      dimensionLabel({
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        unit: "mm",
      }),
    ).toBe("1.4 mm");
  });
  it.each([800, -800, 0])(
    "derives a perpendicular signed offset %s without changing the measured length",
    (offset) => {
      const g = dimensionGeometry({ start, end, offset });
      expect(g.length).toBe(5000);
      expect(Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)).toBeCloseTo(5000);
      expect(dimensionOffset(start, end, g.a)).toBe(offset);
      expect(g.segments).toHaveLength(5);
    },
  );
  it.each([
    { x: 4000, y: 0 },
    { x: 0, y: 4000 },
  ])("handles horizontal/vertical dimensions %j", (end) => {
    expect(
      dimensionGeometry({ start: { x: 0, y: 0 }, end, offset: 500 }).length,
    ).toBe(4000);
  });
  it("validates zero length, noninteger points, missing levels and invalid units without mutating the model", () => {
    const base = p(),
      level = base.levels[0].id;
    expect(() => addDimension(base, level, start, start, 0)).toThrow(/apart/);
    expect(() => addDimension(base, level, { x: 1.2, y: 0 }, end, 0)).toThrow(
      /integer/,
    );
    expect(() => addDimension(base, "missing", start, end, 0)).toThrow(/level/);
    expect(() =>
      addDimension(base, level, start, end, 0, "ft" as "mm"),
    ).toThrow(/unit/);
    expect(base.dimensions).toEqual([]);
  });
  it("supports property edits, deletion, undo and redo as immutable commands", () => {
    const base = p(),
      r = addDimension(base, base.levels[0].id, start, end, 800);
    const edited = updateDimension(r.project, r.dimension.id, {
      unit: "m",
      offset: -1200,
    });
    expect(edited.dimensions[0].offset).toBe(-1200);
    expect(r.dimension.offset).toBe(800);
    const h = historyReducer(initialHistory(r.project), {
      type: "commit",
      label: "Edit dimension",
      project: edited,
    });
    const undone = historyReducer(h, { type: "undo" });
    expect(undone.present.dimensions[0].offset).toBe(800);
    expect(
      historyReducer(undone, { type: "redo" }).present.dimensions[0].offset,
    ).toBe(-1200);
    expect(deleteDimension(edited, r.dimension.id).dimensions).toEqual([]);
  });
  it("round-trips through JSON with IDs, points, signed offsets and units intact", () => {
    const base = p(),
      r = addDimension(base, base.levels[0].id, start, end, -800, "m");
    expect(parseProject(serializeProject(r.project))).toEqual(r.project);
  });
  it("keeps a static dimension unchanged when a nearby wall moves", () => {
    const base = p();
    const wall = addWall(base, base.levels[0].id, start, end);
    const r = addDimension(wall.project, base.levels[0].id, start, end, 800);
    const edited = updateWall(r.project, wall.wall.id, {
      end: { x: 7000, y: 6000 },
    });
    expect(edited.dimensions).toEqual(r.project.dimensions);
  });
  it("cascades annotations on level deletion", () => {
    const base = p(),
      r = addDimension(base, base.levels[0].id, start, end, 800);
    expect(deleteLevel(r.project, base.levels[0].id).dimensions).toEqual([]);
  });
  it("migrates a v4 file without adding or losing building elements", () => {
    const base = p();
    const { dimensions: _, ...old } = base;
    const migrated = parseProject(
      JSON.stringify({ format: "revit-web/project", ...old, schemaVersion: 4 }),
    );
    expect(migrated).toEqual(base);
    expect(migrated.schemaVersion).toBe(5);
  });
  it("rejects malformed or duplicate dimensions in schema 5", () => {
    const base = p(),
      r = addDimension(base, base.levels[0].id, start, end, 800);
    expect(() =>
      parseProject(
        JSON.stringify({
          format: "revit-web/project",
          ...r.project,
          dimensions: [r.dimension, r.dimension],
        }),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseProject(
        JSON.stringify({
          format: "revit-web/project",
          ...r.project,
          dimensions: undefined,
        }),
      ),
    ).toThrow(/dimensions/);
  });
  it("migrates a pre-existing v4 IndexedDB record on read, preserving its identity and metadata", async () => {
    const factory = new IDBFactory(),
      store = await openProjectStore(factory),
      base = p();
    const { dimensions: _, ...old } = base;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open("contour-projects", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put({
        id: base.id,
        name: base.name,
        updatedAt: 10,
        createdAt: 5,
        project: { ...old, schemaVersion: 4 },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const rows = await store.list();
    expect(rows[0].project).toEqual(base);
    expect(rows[0].createdAt).toBe(5);
    expect(rows[0].updatedAt).toBe(10);
    store.close();
    db.close();
  });
});
