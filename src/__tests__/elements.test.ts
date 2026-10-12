import { describe, expect, it } from "vitest";
import {
  addColumn,
  addColumnType,
  addFloor,
  addFloorType,
  addMaterial,
  addOpening,
  addRoom,
  addWall,
  deleteColumn,
  deleteColumnType,
  deleteFloor,
  deleteFloorType,
  deleteLevel,
  deleteMaterial,
  deleteRoom,
  updateColumn,
  updateFloor,
  updateMaterial,
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
