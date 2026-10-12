/**
 * Compact project context for the AI Architect. Deliberately NOT the whole project file: only the
 * information the model needs to propose targeted operations (identities, levels, types, key
 * dimensions, selection, capabilities). Private or irrelevant data (project id, revision counters,
 * raw autosave state, material library details) is never sent.
 */

import { polygonBounds } from "../geometry/polygon";
import type { Project } from "../model/types";
import type { ElementRef } from "./planTypes";

const CAPABILITIES = {
  lengths: "integer millimetres in the model; user may use mm, cm, m, ft, in",
  elements: ["levels", "walls", "doors", "windows", "floors", "rooms", "columns", "ceilings", "hip roofs"],
  roofs: ["hip (rectangular footprint with overhang and rise)"],
  views: ["floor plan per level", "3D", "elevations: north, south, east, west"],
  notSupported: [
    "section views (not implemented yet)",
    "dimensions and text annotations (not implemented yet)",
    "gable/shed/mansard/free-form roofs",
    "stairs, ramps, railings, curtain walls, terrain",
  ],
} as const;

export interface AiSelection {
  kind: string;
  id: string;
  summary: string;
  element: Record<string, unknown>;
}

/** Builds the compact context object sent to the model for a request. */
export function buildProjectContext(
  project: Project,
  options: {
    selection?: { kind: string; id: string } | null;
    activeView?: { kind: "plan" | "3d" | "elevation"; levelName?: string; direction?: string };
  } = {},
): Record<string, unknown> {
  const levelName = (id: string): string => project.levels.find((l) => l.id === id)?.name ?? id;

  const walls = project.walls.slice(0, 60).map((w) => ({
    kind: "wall",
    id: w.id,
    levelName: levelName(w.levelId),
    start: w.start,
    end: w.end,
    height: w.height,
    wallType: wallTypeLabel(project, w.wallTypeId),
    openings: project.openings
      .filter((o) => o.hostWallId === w.id)
      .map((o) => {
        const type = project.openingTypes.find((t) => t.id === o.openingTypeId);
        return {
          kind: type?.kind ?? "opening",
          id: o.id,
          offset: o.offset,
          width: type?.width,
          height: type?.height,
          sillHeight: type?.sillHeight,
        };
      }),
  }));

  const rooms = project.rooms.slice(0, 60).map((r) => ({
    kind: "room",
    id: r.id,
    name: r.name,
    number: r.number,
    levelName: levelName(r.levelId),
    boundary: r.boundary,
  }));

  const simple = <T extends { levelId: string; id: string }>(
    list: T[],
    kind: string,
    fields: (item: T) => Record<string, unknown>,
  ): Record<string, unknown>[] =>
    list.slice(0, 60).map((item) => ({ kind, id: item.id, levelName: levelName(item.levelId), ...fields(item) }));

  const elements: Record<string, unknown>[] = [
    ...walls,
    ...rooms,
    ...simple(project.floors, "floor", (f) => ({ boundary: f.boundary })),
    ...simple(project.columns, "column", (c) => ({ position: c.position, height: c.height })),
    ...simple(project.ceilings, "ceiling", (c) => ({ boundary: c.boundary, height: c.height })),
    ...simple(project.roofs, "roof", (r) => ({ boundary: r.boundary, overhang: r.overhang, rise: r.rise })),
  ];

  const context: Record<string, unknown> = {
    projectName: project.name,
    units: "mm",
    coordinateSystem: "plan (x, y) in integer millimetres; y up (north), x right (east)",
    levels: project.levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation })),
    types: {
      wall: project.wallTypes.map((t) => ({ id: t.id, name: t.name, thickness: t.thickness })),
      floor: project.floorTypes.map((t) => ({ id: t.id, name: t.name, thickness: t.thickness })),
      column: project.columnTypes.map((t) => ({ id: t.id, name: t.name, width: t.width, depth: t.depth })),
      ceiling: project.ceilingTypes.map((t) => ({ id: t.id, name: t.name, thickness: t.thickness })),
      roof: project.roofTypes.map((t) => ({ id: t.id, name: t.name, thickness: t.thickness })),
      door: project.openingTypes.filter((t) => t.kind === "door").map((t) => ({ id: t.id, name: t.name, width: t.width, height: t.height })),
      window: project.openingTypes
        .filter((t) => t.kind === "window")
        .map((t) => ({ id: t.id, name: t.name, width: t.width, height: t.height, sillHeight: t.sillHeight })),
    },
    elementCounts: {
      walls: project.walls.length,
      openings: project.openings.length,
      floors: project.floors.length,
      rooms: project.rooms.length,
      columns: project.columns.length,
      ceilings: project.ceilings.length,
      roofs: project.roofs.length,
    },
    elements,
    elementsTruncated: project.walls.length + project.rooms.length + project.floors.length + project.columns.length + project.ceilings.length + project.roofs.length > elements.length,
    capabilities: CAPABILITIES,
  };

  const bounds = modelBounds(project);
  if (bounds) context.footprintBounds = bounds;
  if (options.activeView) context.activeView = options.activeView;
  if (options.selection) {
    const detail = describeSelection(project, options.selection);
    if (detail) context.selection = detail;
  }
  return context;
}

function wallTypeLabel(project: Project, id: string): string {
  return project.wallTypes.find((t) => t.id === id)?.name ?? id;
}

function modelBounds(project: Project): Record<string, number> | null {
  const points = [...project.walls.flatMap((w) => [w.start, w.end]), ...project.floors.flatMap((f) => f.boundary), ...project.roofs.flatMap((r) => r.boundary)];
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Detail of the current selection, for "what is this?" questions and property edits. */
export function describeSelection(project: Project, selection: { kind: string; id: string }): AiSelection | null {
  const find = <T extends { id: string }>(list: T[]): T | undefined => list.find((x) => x.id === selection.id);
  const levelName = (id: string): string => project.levels.find((l) => l.id === id)?.name ?? id;

  switch (selection.kind) {
    case "wall": {
      const wall = find(project.walls);
      if (!wall) return null;
      const type = project.wallTypes.find((t) => t.id === wall.wallTypeId);
      return {
        kind: "wall",
        id: wall.id,
        summary: `Wall on ${levelName(wall.levelId)}: ${(Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / 1000).toFixed(2)} m long, ${wall.height} mm high, ${type?.thickness ?? "?"} mm thick (${type?.name ?? "unknown type"})`,
        element: { ...wall, typeName: type?.name, levelName: levelName(wall.levelId) },
      };
    }
    case "opening": {
      const opening = find(project.openings);
      if (!opening) return null;
      const type = project.openingTypes.find((t) => t.id === opening.openingTypeId);
      const host = project.walls.find((w) => w.id === opening.hostWallId);
      return {
        kind: "opening",
        id: opening.id,
        summary: `${type?.kind === "door" ? "Door" : "Window"} (${type?.width} x ${type?.height} mm, sill ${type?.sillHeight} mm) hosted in wall ${host?.id ?? "?"} at ${opening.offset} mm from its start`,
        element: { ...opening, typeName: type?.name, typeKind: type?.kind, width: type?.width, height: type?.height, sillHeight: type?.sillHeight, hostWallId: opening.hostWallId },
      };
    }
    case "room": {
      const room = find(project.rooms);
      if (!room) return null;
      const bounds = polygonBounds(room.boundary);
      return {
        kind: "room",
        id: room.id,
        summary: `Room "${room.name}" (number ${room.number}) on ${levelName(room.levelId)}: ${((bounds.maxX - bounds.minX) / 1000).toFixed(2)} x ${((bounds.maxY - bounds.minY) / 1000).toFixed(2)} m bounding box`,
        element: { ...room, levelName: levelName(room.levelId) },
      };
    }
    case "floor": {
      const floor = find(project.floors);
      if (!floor) return null;
      return { kind: "floor", id: floor.id, summary: `Floor slab on ${levelName(floor.levelId)}`, element: { ...floor, levelName: levelName(floor.levelId) } };
    }
    case "column": {
      const column = find(project.columns);
      if (!column) return null;
      return {
        kind: "column",
        id: column.id,
        summary: `Column on ${levelName(column.levelId)} at (${column.position.x}, ${column.position.y}), ${column.height} mm high`,
        element: { ...column, levelName: levelName(column.levelId) },
      };
    }
    case "ceiling": {
      const ceiling = find(project.ceilings);
      if (!ceiling) return null;
      return {
        kind: "ceiling",
        id: ceiling.id,
        summary: `Ceiling on ${levelName(ceiling.levelId)} at ${ceiling.height} mm above the level`,
        element: { ...ceiling, levelName: levelName(ceiling.levelId) },
      };
    }
    case "roof": {
      const roof = find(project.roofs);
      if (!roof) return null;
      const bounds = polygonBounds(roof.boundary);
      return {
        kind: "roof",
        id: roof.id,
        summary: `Hip roof on ${levelName(roof.levelId)}: ${((bounds.maxX - bounds.minX) / 1000).toFixed(2)} x ${((bounds.maxY - bounds.minY) / 1000).toFixed(2)} m footprint, ${roof.overhang} mm overhang, ${roof.rise} mm rise`,
        element: { ...roof, levelName: levelName(roof.levelId) },
      };
    }
    default:
      return null;
  }
}

/** The selection in ElementRef form, for docs/tests. */
export function selectionRef(selection: { kind: string; id: string }): ElementRef {
  return { id: selection.id };
}
