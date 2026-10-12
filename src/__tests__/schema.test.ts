import { describe, expect, it } from "vitest";
import { addOpening, addWall } from "../model/commands";
import { parseProject, serializeProject } from "../model/schema";
import { freshProject, ids } from "./helpers";

function sampleProject() {
  const p0 = freshProject();
  const i = ids(p0);
  const { project: p1, wall } = addWall(p0, i.level1, { x: 0, y: 0 }, { x: 6000, y: 0 }, { wallTypeId: i.thickWall });
  const { project: p2 } = addOpening(p1, wall.id, i.door, 2000);
  const { project: p3 } = addOpening(p2, wall.id, i.window, 4500);
  return p3;
}

describe("schema", () => {
  it("round-trips a project exactly", () => {
    const p = sampleProject();
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it("serializes deterministically: the same model gives the same bytes", () => {
    const p = sampleProject();
    const a = serializeProject(p);
    const b = serializeProject(parseProject(a));
    expect(b).toBe(a);
    expect(a.endsWith("\n")).toBe(true);
    expect(a).toContain('"format": "revit-web/project"');
  });

  it("rejects non-integer lengths in saved files", () => {
    const text = serializeProject(sampleProject()).replace('"height": 3000', '"height": 3000.5');
    expect(() => parseProject(text)).toThrow(/whole number of millimetres/);
  });

  it("rejects a file with an opening that points at a missing wall", () => {
    const p = sampleProject();
    const bad = { ...p, openings: [{ ...p.openings[0], hostWallId: "nope" }] };
    expect(() => parseProject(JSON.stringify({ format: "revit-web/project", ...bad }))).toThrow(/missing wall/);
  });

  it("rejects non-JSON, foreign files and unknown versions with clear messages", () => {
    expect(() => parseProject("nope")).toThrow(/not valid JSON/);
    expect(() => parseProject("[]")).toThrow(/project object/);
    expect(() => parseProject(JSON.stringify({ format: "other" }))).toThrow(/not a revit-web project/);
    expect(() => parseProject(JSON.stringify({ format: "revit-web/project", schemaVersion: 99 }))).toThrow(
      /Unsupported project version/,
    );
  });

  it("migrates the version 1 format (metres as floats) to millimetres with wall types", () => {
    const v1 = {
      format: "revit-web/project",
      version: 1,
      name: "Old",
      levels: [
        { id: "lvl-a", name: "Ground", elevation: 0 },
        { id: "lvl-b", name: "First", elevation: 3.2 },
      ],
      walls: [
        { id: "w1", levelId: "lvl-a", start: { x: 0, y: 0 }, end: { x: 4.1, y: 0 }, thickness: 0.2, height: 3 },
        { id: "w2", levelId: "lvl-a", start: { x: 4.1, y: 0 }, end: { x: 4.1, y: 3 }, thickness: 0.2, height: 3 },
        { id: "w3", levelId: "lvl-b", start: { x: 0, y: 0 }, end: { x: 0, y: 3 }, thickness: 0.1, height: 2.8 },
      ],
    };
    const p = parseProject(JSON.stringify(v1));
    expect(p.schemaVersion).toBe(2);
    expect(p.name).toBe("Old");
    expect(p.levels.map((l) => l.elevation)).toEqual([0, 3200]);
    expect(p.walls[0].end).toEqual({ x: 4100, y: 0 });
    expect(p.walls[2].height).toBe(2800);
    // Walls with the same thickness share a type; a different thickness gets its own.
    expect(p.walls[0].wallTypeId).toBe(p.walls[1].wallTypeId);
    expect(p.wallTypes.map((t) => t.thickness).sort()).toEqual([100, 200]);
    expect(p.openings).toEqual([]);
    // The migrated project is itself valid and saves in the current format.
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
});
