import { describe, expect, it } from "vitest";
import { addColumn, addFloor, addMaterial, addOpening, addRoom, addWall } from "../model/commands";
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
    // The v1 file is migrated through v2 to the current schema (v3).
    expect(p.schemaVersion).toBe(3);
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

  it("migrates schema v2 to v3 with a default material assigned to wall types", () => {
    const v2 = {
      format: "revit-web/project",
      schemaVersion: 2,
      id: "proj-old",
      name: "V2 project",
      units: { length: "mm" },
      revision: 7,
      levels: [{ id: "lvl-a", name: "Ground", elevation: 0 }],
      wallTypes: [{ id: "wt-a", name: "Generic - 200 mm", thickness: 200 }],
      openingTypes: [
        { id: "ot-a", name: "Door 900 x 2100", kind: "door", width: 900, height: 2100, sillHeight: 0 },
      ],
      walls: [
        { id: "w1", levelId: "lvl-a", wallTypeId: "wt-a", start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, height: 3000 },
      ],
      openings: [{ id: "op1", hostWallId: "w1", openingTypeId: "ot-a", offset: 2000 }],
    };
    const p = parseProject(JSON.stringify(v2));
    expect(p.schemaVersion).toBe(3);
    expect(p.revision).toBe(7);
    expect(p.wallTypes[0].thickness).toBe(200);
    expect(p.materials).toHaveLength(1);
    expect(p.wallTypes[0].materialId).toBe(p.materials[0].id);
    expect(p.floorTypes.length).toBeGreaterThan(0);
    expect(p.columnTypes.length).toBeGreaterThan(0);
    expect(p.floors).toEqual([]);
    expect(p.rooms).toEqual([]);
    expect(p.columns).toEqual([]);
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it("round-trips floors, rooms, columns and materials", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const floorType = p0.floorTypes[0];
    const columnType = p0.columnTypes[0];
    const { project: p1, floor } = addFloor(p0, i.level1, floorType.id, [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    const { project: p2 } = addRoom(p1, i.level1, "Living", "101", floor.boundary);
    const { project: p3 } = addColumn(p2, i.level1, columnType.id, { x: 2500, y: 2000 }, { height: 3000 });
    const p4 = addMaterial(p3, "Glass", "#7fd4ff").project;
    const text = serializeProject(p4);
    const reopened = parseProject(text);
    expect(reopened).toEqual(p4);
    expect(reopened.floors[0].boundary).toEqual(floor.boundary);
    expect(reopened.rooms[0].name).toBe("Living");
    expect(reopened.columns[0].position).toEqual({ x: 2500, y: 2000 });
    expect(reopened.materials.map((m) => m.name)).toContain("Glass");
  });

  it("rejects saved files with a self-intersecting floor boundary", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const bowtie = [
      { x: 0, y: 0 },
      { x: 4000, y: 4000 },
      { x: 4000, y: 0 },
      { x: 0, y: 4000 },
    ];
    expect(() => addFloor(p0, i.level1, p0.floorTypes[0].id, bowtie)).toThrow(/cross itself/);
    const text = serializeProject(p0).replace('"floors": []', '"floors": [{"id":"f1","levelId":"x","floorTypeId":"y","boundary":[[1,2]]}]');
    // A malformed floors entry in a file is rejected on load too.
    expect(() => parseProject(text)).toThrow();
  });
});
