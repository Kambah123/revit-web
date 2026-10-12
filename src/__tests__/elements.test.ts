import { describe, expect, it } from "vitest";
import {
  addCeiling,
  addCeilingType,
  addColumn,
  addColumnType,
  addFloor,
  addFloorType,
  addMaterial,
  addOpening,
  addRoom,
  addWall,
  addRoof,
  addRoofType,
  deleteCeiling,
  deleteCeilingType,
  deleteColumn,
  deleteColumnType,
  deleteFloor,
  deleteFloorType,
  deleteLevel,
  deleteMaterial,
  deleteRoof,
  deleteRoofType,
  deleteRoom,
  updateCeiling,
  updateCeilingType,
  updateColumn,
  updateFloor,
  updateMaterial,
  updateRoof,
  updateRoofType,
  updateRoom,
} from "../model/commands";
import { freshProject, ids } from "./helpers";

const square = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 4000 },
  { x: 0, y: 4000 },
];

describe("materials", () => {
  it("adds, renames and recolours materials", () => {
    const p0 = freshProject();
    const { project: p1, material } = addMaterial(p0, "Glass", "#7fd4ff");
    expect(p1.materials).toHaveLength(p0.materials.length + 1);
    const p2 = updateMaterial(p1, material.id, { name: "Glazing", color: "#88ddff" });
    expect(p2.materials.find((m) => m.id === material.id)).toEqual({ id: material.id, name: "Glazing", color: "#88ddff" });
  });

  it("rejects invalid colours and unknown materials", () => {
    const p0 = freshProject();
    expect(() => addMaterial(p0, "Bad", "blue")).toThrow(/colour/);
    expect(() => updateMaterial(p0, "nope", { name: "X" })).toThrow(/Unknown material/);
  });

  it("refuses to delete a material in use and the last material", () => {
    const p0 = freshProject();
    const usedId = p0.wallTypes[0].materialId;
    expect(() => deleteMaterial(p0, usedId)).toThrow(/assigned to a type/);
    const usedByFloor = p0.floorTypes[0].materialId;
    expect(() => deleteMaterial(p0, usedByFloor)).toThrow(/assigned to a type/);
    const { project: p1, material } = addMaterial(p0, "Temp", "#000000");
    expect(deleteMaterial(p1, material.id).materials).toHaveLength(p0.materials.length);
    // Deleting every unused material leaves the in-use ones alone.
    let p = p1;
    for (const m of [...p1.materials]) {
      const used = p.wallTypes.some((t) => t.materialId === m.id)
        || p.floorTypes.some((t) => t.materialId === m.id)
        || p.columnTypes.some((t) => t.materialId === m.id);
      if (!used) p = deleteMaterial(p, m.id);
    }
    expect(p.materials.every((m) =>
      p.wallTypes.some((t) => t.materialId === m.id)
      || p.floorTypes.some((t) => t.materialId === m.id)
      || p.columnTypes.some((t) => t.materialId === m.id),
    )).toBe(true);
  });
});

describe("floors", () => {
  it("adds a floor from a boundary and edits it", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, floor } = addFloor(p0, i.level1, p0.floorTypes[0].id, square);
    expect(p1.floors).toHaveLength(1);
    const bigger = square.map((pt) => ({ x: pt.x * 2, y: pt.y * 2 }));
    const p2 = updateFloor(p1, floor.id, { boundary: bigger });
    expect(p2.floors[0].boundary).toEqual(bigger);
    const p3 = updateFloor(p2, floor.id, { levelId: i.level2 });
    expect(p3.floors[0].levelId).toBe(i.level2);
    expect(deleteFloor(p3, floor.id).floors).toHaveLength(0);
  });

  it("refuses invalid floors", () => {
    const p0 = freshProject();
    const i = ids(p0);
    expect(() => addFloor(p0, i.level1, "nope", square)).toThrow(/Unknown floor type/);
    expect(() => addFloor(p0, i.level1, p0.floorTypes[0].id, square.slice(0, 2))).toThrow(/at least three/);
    expect(() =>
      addFloor(p0, i.level1, p0.floorTypes[0].id, [
        { x: 0, y: 0 },
        { x: 4000, y: 4000 },
        { x: 4000, y: 0 },
        { x: 0, y: 4000 },
      ]),
    ).toThrow(/cross itself/);
    expect(() => deleteFloor(p0, "nope")).toThrow(/Unknown floor/);
  });

  it("adds floor types and refuses to delete types in use", () => {
    const p0 = freshProject();
    const { project: p1, floorType } = addFloorType(p0, "Deck - 150 mm", 150);
    const p2 = addFloor(p1, ids(p1).level1, floorType.id, square).project;
    expect(() => deleteFloorType(p2, floorType.id)).toThrow(/used by a floor/);
    expect(deleteFloorType(p1, floorType.id).floorTypes).toHaveLength(p0.floorTypes.length);
    expect(() => addFloorType(p0, "Bad", -5)).toThrow();
  });
});

describe("rooms", () => {
  it("adds rooms with names and numbers and edits them", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, room } = addRoom(p0, i.level1, "Living", "101", square);
    expect(p1.rooms[0].name).toBe("Living");
    const p2 = updateRoom(p1, room.id, { name: "Living room", number: "102" });
    expect(p2.rooms[0].name).toBe("Living room");
    expect(p2.rooms[0].number).toBe("102");
    expect(deleteRoom(p2, room.id).rooms).toHaveLength(0);
  });

  it("refuses empty names and bad boundaries", () => {
    const p0 = freshProject();
    const i = ids(p0);
    expect(() => addRoom(p0, i.level1, "   ", "101", square)).toThrow(/names cannot be empty/);
    expect(() => addRoom(p0, i.level1, "X", "1", [{ x: 0, y: 0 }])).toThrow(/at least three/);
    expect(() => updateRoom(p0, "nope", { name: "X" })).toThrow(/Unknown room/);
  });
});

describe("columns", () => {
  it("adds, edits and deletes columns", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, column } = addColumn(p0, i.level1, p0.columnTypes[0].id, { x: 1000, y: 1000 }, { height: 4000 });
    expect(p1.columns).toHaveLength(1);
    const p2 = updateColumn(p1, column.id, { position: { x: 2000, y: 2000 }, height: 3500 });
    expect(p2.columns[0].position).toEqual({ x: 2000, y: 2000 });
    expect(p2.columns[0].height).toBe(3500);
    expect(deleteColumn(p2, column.id).columns).toHaveLength(0);
  });

  it("refuses invalid columns and column types", () => {
    const p0 = freshProject();
    const i = ids(p0);
    expect(() => addColumn(p0, i.level1, "nope", { x: 0, y: 0 })).toThrow(/Unknown column type/);
    expect(() => addColumn(p0, i.level1, p0.columnTypes[0].id, { x: 0, y: 0 }, { height: 0 })).toThrow(
      /positive whole-millimetre height/,
    );
    const { project: p1, columnType } = addColumnType(p0, "Round-ish", 200, 200);
    const p2 = addColumn(p1, i.level1, columnType.id, { x: 0, y: 0 }).project;
    expect(() => deleteColumnType(p2, columnType.id)).toThrow(/used by a column/);
    expect(() => addColumnType(p0, "Bad", 0, 100)).toThrow(/positive/);
    expect(() => updateColumn(p0, "nope", { height: 100 })).toThrow(/Unknown column/);
    expect(() => deleteColumn(p0, "nope")).toThrow(/Unknown column/);
  });
});

describe("cascades", () => {
  it("deleting a level removes its walls (with openings), floors, rooms and columns", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let p = addFloor(p0, i.level1, p0.floorTypes[0].id, square).project;
    p = addRoom(p, i.level1, "Living", "101", square).project;
    p = addColumn(p, i.level1, p0.columnTypes[0].id, { x: 0, y: 0 }).project;
    const { project: p1, wall } = addWall(p, i.level1, { x: 0, y: 0 }, { x: 6000, y: 0 });
    const doorType = p1.openingTypes.find((t) => t.kind === "door")!;
    p = addOpening(p1, wall.id, doorType.id, 1500).project;
    // Keep one element on level 2 so the project stays populated.
    p = addFloor(p, i.level2, p.floorTypes[0].id, square).project;

    const after = deleteLevel(p, i.level1);
    expect(after.walls).toHaveLength(0);
    expect(after.openings).toHaveLength(0);
    expect(after.floors).toHaveLength(1);
    expect(after.floors[0].levelId).toBe(i.level2);
    expect(after.rooms).toHaveLength(0);
    expect(after.columns).toHaveLength(0);
    // Level 2 survives.
    expect(after.levels.map((l) => l.id)).toEqual([i.level2]);
  });
});

describe("ceilings", () => {
  it("adds, edits and deletes ceilings", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, ceiling } = addCeiling(p0, i.level1, p0.ceilingTypes[0].id, square, { height: 2700 });
    expect(p1.ceilings).toHaveLength(1);
    expect(p1.ceilings[0].height).toBe(2700);
    const p2 = updateCeiling(p1, ceiling.id, { height: 2400 });
    expect(p2.ceilings[0].height).toBe(2400);
    const p3 = updateCeiling(p2, ceiling.id, { ceilingTypeId: p2.ceilingTypes[0].id });
    expect(p3.ceilings).toHaveLength(1);
    expect(deleteCeiling(p3, ceiling.id).ceilings).toHaveLength(0);
    expect(() => deleteCeiling(p0, "nope")).toThrow(/Unknown ceiling/);
    expect(() => addCeiling(p0, i.level1, "nope", square)).toThrow(/Unknown ceiling type/);
    expect(() => addCeiling(p0, i.level1, p0.ceilingTypes[0].id, square.slice(0, 2))).toThrow(/at least three/);
    expect(() => updateCeiling(p0, "nope", { height: 100 })).toThrow(/Unknown ceiling/);
  });

  it("adds ceiling types and refuses to delete types in use", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, ceilingType } = addCeilingType(p0, "Gypsum - 20 mm", 20);
    const p2 = addCeiling(p1, i.level1, ceilingType.id, square).project;
    expect(() => deleteCeilingType(p2, ceilingType.id)).toThrow(/used by a ceiling/);
    expect(deleteCeilingType(p1, ceilingType.id).ceilingTypes).toHaveLength(p0.ceilingTypes.length);
    expect(() => addCeilingType(p0, "Bad", 0)).toThrow(/positive/);
    expect(() => updateCeilingType(p0, "nope", { name: "X" })).toThrow(/Unknown ceiling type/);
    expect(() => deleteCeilingType(p0, "nope")).toThrow(/Unknown ceiling type/);
  });
});

describe("roofs", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 8000, y: 0 },
    { x: 8000, y: 5000 },
    { x: 0, y: 5000 },
  ];

  it("adds a hip roof with overhang and rise and edits them", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, roof } = addRoof(p0, i.level1, p0.roofTypes[0].id, rect, { overhang: 600, rise: 2000 });
    expect(p1.roofs).toHaveLength(1);
    expect(p1.roofs[0].overhang).toBe(600);
    const p2 = updateRoof(p1, roof.id, { overhang: 900, rise: 2500 });
    expect(p2.roofs[0].overhang).toBe(900);
    expect(p2.roofs[0].rise).toBe(2500);
    expect(deleteRoof(p2, roof.id).roofs).toHaveLength(0);
    expect(() => deleteRoof(p0, "nope")).toThrow(/Unknown roof/);
    expect(() => updateRoof(p0, "nope", { rise: 100 })).toThrow(/Unknown roof/);
    expect(() => addRoof(p0, i.level1, "nope", rect)).toThrow(/Unknown roof type/);
  });

  it("refuses non-rectangular footprints and bad values", () => {
    const p0 = freshProject();
    const i = ids(p0);
    expect(() =>
      addRoof(p0, i.level1, p0.roofTypes[0].id, [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 4000 },
        { x: 2500, y: 6000 },
        { x: 0, y: 4000 },
      ]),
    ).toThrow(/rectangle with four points/);
    expect(() =>
      addRoof(p0, i.level1, p0.roofTypes[0].id, [
        { x: 0, y: 0 },
        { x: 5000, y: 1000 },
        { x: 4000, y: 5000 },
        { x: 500, y: 3000 },
      ]),
    ).toThrow(/axis-aligned rectangle/);
    expect(() => addRoof(p0, i.level1, p0.roofTypes[0].id, rect, { overhang: -1 })).toThrow(/overhang/);
    expect(() => addRoof(p0, i.level1, p0.roofTypes[0].id, rect, { rise: 0 })).toThrow(/positive whole-millimetre rise/);
  });

  it("adds roof types and refuses to delete types in use", () => {
    const p0 = freshProject();
    const i = ids(p0);
    const { project: p1, roofType } = addRoofType(p0, "Tile - 250 mm", 250);
    const p2 = addRoof(p1, i.level1, roofType.id, rect).project;
    expect(() => deleteRoofType(p2, roofType.id)).toThrow(/used by a roof/);
    expect(deleteRoofType(p1, roofType.id).roofTypes).toHaveLength(p0.roofTypes.length);
    expect(() => addRoofType(p0, "Bad", -1)).toThrow(/positive/);
    expect(() => updateRoofType(p0, "nope", { name: "X" })).toThrow(/Unknown roof type/);
    expect(() => deleteRoofType(p0, "nope")).toThrow(/Unknown roof type/);
  });

  it("level delete cascades to ceilings and roofs", () => {
    const p0 = freshProject();
    const i = ids(p0);
    let p = addCeiling(p0, i.level1, p0.ceilingTypes[0].id, square).project;
    p = addRoof(p, i.level1, p0.roofTypes[0].id, rect).project;
    p = addCeiling(p, i.level2, p0.ceilingTypes[0].id, square).project;
    const after = deleteLevel(p, i.level1);
    expect(after.ceilings).toHaveLength(1);
    expect(after.ceilings[0].levelId).toBe(i.level2);
    expect(after.roofs).toHaveLength(0);
  });
});
