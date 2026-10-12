/**
 * Deterministic demo planner — NOT DeepSeek.
 *
 * When `AI_DEMO_PLANNER=1` and no DEEPSEEK_API_KEY is configured, the server answers with a small
 * rule-based plan so the full pipeline (plan → validation → transactional apply → views) can be
 * exercised in demo/preview environments. Responses are labelled `demo: true` and the UI shows a
 * banner so nobody mistakes this for the language model.
 */

const MM_PER = { mm: 1, cm: 10, m: 1000, ft: 304.8, in: 25.4, '"': 25.4, "'": 304.8 };

/** Parses a length from a regex match like ["3.5 m", "3.5", "m"]. Returns integer mm or null. */
function toMm(value, unit) {
  const factor = MM_PER[(unit ?? "mm").toLowerCase()];
  if (factor === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * factor);
}

function findDims(text) {
  const m = /(\d+(?:\.\d+)?)\s*(mm|cm|m|ft|feet|in|inch|inches|'|")?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|ft|feet|in|inch|inches|'|")?/i.exec(text);
  if (!m) return null;
  const unitA = m[2] === "feet" || m[2] === "inch" || m[2] === "inches" ? (m[2].startsWith("f") ? "ft" : "in") : m[2];
  const unitB = m[4] === "feet" || m[4] === "inch" || m[4] === "inches" ? (m[4].startsWith("f") ? "ft" : "in") : m[4];
  const a = toMm(m[1], unitA ?? "m");
  const b = toMm(m[3], unitB ?? unitA ?? "m");
  if (a === null || b === null || a < 2000 || b < 2000 || a > 200_000 || b > 200_000) return null;
  return [a, b];
}

function rect(x0, y0, x1, y1) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function plan(operations, fields = {}) {
  return {
    kind: "design-plan",
    version: 1,
    summary: fields.summary ?? "Demo planner change.",
    assumptions: fields.assumptions ?? [],
    clarifications: fields.clarifications ?? [],
    unsupported: fields.unsupported ?? [],
    operations,
  };
}

function newBuildingPlan(text) {
  const dims = findDims(text) ?? [9000, 6000];
  const [w, d] = dims;
  const withRoof = /roof/i.test(text);
  const ops = [
    { op: "wall.add", opId: "w1", level: { name: "Level 1" }, start: { x: 0, y: 0 }, end: { x: w, y: 0 }, height: 2700 },
    { op: "wall.add", opId: "w2", level: { name: "Level 1" }, start: { x: w, y: 0 }, end: { x: w, y: d }, height: 2700 },
    { op: "wall.add", opId: "w3", level: { name: "Level 1" }, start: { x: w, y: d }, end: { x: 0, y: d }, height: 2700 },
    { op: "wall.add", opId: "w4", level: { name: "Level 1" }, start: { x: 0, y: d }, end: { x: 0, y: 0 }, height: 2700 },
    { op: "floor.add", opId: "f1", level: { name: "Level 1" }, boundary: rect(0, 0, w, d) },
    { op: "room.add", opId: "r1", level: { name: "Level 1" }, name: "Main Room", number: "1", boundary: rect(0, 0, w, d) },
    { op: "opening.add", opId: "d1", kind: "door", hostWall: { opId: "w1" }, offset: Math.round(w / 2), width: 900, height: 2100 },
    { op: "opening.add", opId: "win1", kind: "window", hostWall: { opId: "w1" }, offset: Math.round(w / 6), width: 1200, height: 1200, sillHeight: 900 },
    { op: "opening.add", opId: "win2", kind: "window", hostWall: { opId: "w1" }, offset: Math.round((w * 5) / 6), width: 1200, height: 1200, sillHeight: 900 },
  ];
  if (withRoof) {
    const oh = 600;
    ops.push({
      op: "roof.add",
      opId: "rf1",
      level: { name: "Level 2" },
      boundary: rect(-oh, -oh, w + oh, d + oh),
      overhang: oh,
      rise: 1800,
    });
    ops.push({ op: "view.open", view: "3d" });
    return plan(ops, {
      summary: `Demo: new ${w / 1000} x ${d / 1000} m building with walls, floor, room, door, two windows and a hip roof.`,
      assumptions: ["Demo planner: wall height 2.7 m, roof on Level 2."],
    });
  }
  ops.push({ op: "view.open", view: "plan", level: { name: "Level 1" } });
  return plan(ops, {
    summary: `Demo: new ${w / 1000} x ${d / 1000} m building with walls, floor, room, door and two windows.`,
    assumptions: ["Demo planner: wall height 2.7 m."],
  });
}

function roofPlan(text, context) {
  const walls = (context?.elements ?? []).filter((e) => e.kind === "wall" && e.levelName === "Level 1");
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const wall of walls) {
    for (const p of [wall.start, wall.end]) {
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return plan([], {
      summary: "Demo planner needs a building first.",
      clarifications: [{ question: "There are no walls on Level 1 to size a roof from. Should I generate a building first?", options: ["Yes, generate a simple building", "No"] }],
    });
  }
  const ohMatch = /(\d+(?:\.\d+)?)\s*(mm|cm|m|ft|in|'|")\s*overhang/i.exec(text);
  const overhang = ohMatch ? (toMm(ohMatch[1], ohMatch[2]) ?? 600) : 600;
  const levelName = context?.levels?.some((l) => l.name === "Level 2") ? "Level 2" : (context?.levels?.[0]?.name ?? "Level 1");
  return plan(
    [
      {
        op: "roof.add",
        opId: "rf1",
        level: { name: levelName },
        boundary: rect(minX, minY, maxX, maxY),
        overhang,
        rise: 1800,
      },
      { op: "view.open", view: "3d" },
    ],
    { summary: `Demo: hip roof over the existing footprint with ${overhang} mm overhang.`, assumptions: ["Demo planner: rise 1.8 m, roof on " + levelName + "."] },
  );
}

function enlargeRoomPlan(text, context) {
  const rooms = (context?.elements ?? []).filter((e) => e.kind === "room");
  const nameMatch = rooms.find((r) => r.name && text.toLowerCase().includes(r.name.toLowerCase()));
  const room = nameMatch ?? rooms[0];
  if (!room || !room.boundary || room.boundary.length < 3) {
    return plan([], {
      summary: "Demo planner found no room to resize.",
      clarifications: [{ question: "Which room should be made larger?", options: rooms.map((r) => r.name).slice(0, 6) }],
    });
  }
  const xs = room.boundary.map((p) => p.x);
  const ys = room.boundary.map((p) => p.y);
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
  const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
  const boundary = room.boundary.map((p) => ({
    x: Math.round(cx + (p.x - cx) * 1.25),
    y: Math.round(cy + (p.y - cy) * 1.25),
  }));
  return plan([{ op: "room.update", room: { id: room.id }, boundary }], {
    summary: `Demo: enlarged ${room.name} by 25% (boundary only).`,
    assumptions: ["Demo planner scales the room polygon; walls were not moved."],
  });
}

function windowsPlan(text, context) {
  const walls = (context?.elements ?? []).filter((e) => e.kind === "wall" && e.start && e.end);
  if (walls.length === 0) {
    return plan([], {
      summary: "Demo planner found no walls.",
      clarifications: [{ question: "There are no walls to host windows. Should I generate a building first?" }],
    });
  }
  const countMatch = /(\b[a-z]+|\d+)\s+windows?/i.exec(text);
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const count = Math.min(4, countMatch ? (words[countMatch[1].toLowerCase()] ?? (Number(countMatch[1]) || 2)) : 2);
  // "Front" = the wall whose midpoint has the smallest y (bottom edge of the plan).
  const front = walls.reduce((best, w) => {
    const my = (w.start.y + w.end.y) / 2;
    const bestMy = (best.start.y + best.end.y) / 2;
    return my < bestMy ? w : best;
  });
  const len = Math.round(Math.hypot(front.end.x - front.start.x, front.end.y - front.start.y));
  const ops = [];
  for (let i = 0; i < count; i += 1) {
    const offset = Math.round(((i + 1) * len) / (count + 1));
    ops.push({
      op: "opening.add",
      opId: `win${i + 1}`,
      kind: "window",
      hostWall: { id: front.id },
      offset,
      width: 1200,
      height: 1200,
      sillHeight: 900,
    });
  }
  return plan(ops, { summary: `Demo: ${count} window${count > 1 ? "s" : ""} on the front wall.` });
}

function elevationPlan(text) {
  const wantsAll = /all|every|each/i.test(text) || (/elevations?/i.test(text) && /front|rear|side/i.test(text) === false);
  const dirs = [];
  if (wantsAll || /front|south/i.test(text)) dirs.push("south");
  if (wantsAll || /rear|back|north/i.test(text)) dirs.push("north");
  if (wantsAll || /side|west|left/i.test(text)) dirs.push("west");
  if (wantsAll || /east|right/i.test(text)) dirs.push("east");
  const unique = [...new Set(dirs.length > 0 ? dirs : ["south", "north", "west", "east"])];
  return plan(
    unique.map((direction) => ({ op: "view.open", view: "elevation", direction })),
    { summary: `Demo: open ${unique.join(", ")} elevations.` },
  );
}

/**
 * @param {{ message: string, context?: object, selection?: object }} request
 * @returns {object} a DesignPlan-shaped object
 */
export function demoPlanFor(request) {
  const text = request.message ?? "";
  const lower = text.toLowerCase();
  if (/section/i.test(text)) {
    return plan([], {
      summary: "Sections are not supported yet.",
      unsupported: [
        {
          request: "section view",
          reason: "Section views are not implemented in the modelling engine yet (roadmap M4).",
          alternative: "Generate north/south/east/west elevations, or open the 3D view.",
        },
      ],
    });
  }
  if (/elevation/i.test(text)) return elevationPlan(text);
  if (/larger|bigger|resize|expand/i.test(text)) return enlargeRoomPlan(text, request.context);
  if (/(add|put|place).{0,24}windows?/i.test(text) || /\bwindows?\b/i.test(text) && /front|wall|elevation/i.test(text)) return windowsPlan(text, request.context);
  if (/roof/i.test(text) && /add|put|place|hip/i.test(text) && !/design|new building|new house/i.test(lower)) return roofPlan(text, request.context);
  if (/design|new (building|house|home)|generate a (building|house)|build (me |us )?a /i.test(lower)) return newBuildingPlan(text);
  if (/roof/i.test(text)) return roofPlan(text, request.context);
  return plan([], {
    summary: "Demo planner needs a simpler request.",
    clarifications: [
      {
        question: "The demo planner only handles simple patterns (it is not the DeepSeek model). What would you like?",
        options: ["Design a 9 m by 6 m house with a hip roof", "Add a hip roof with a 600 mm overhang", "Add two windows to the front", "Generate all elevations"],
      },
    ],
  });
}
