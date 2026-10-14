import { createProject } from "../model/project";
import { addFloor, addRoom, addWall, addOpening } from "../model/commands";
import type { Project, Point } from "../model/types";

/** Original, deterministic layout (new IDs each time). Real model elements, not a reference image. */
export function createSampleProject(compact = false): Project {
  let p = createProject(compact ? "Garden studio" : "Courtyard residence");
  p = {
    ...p,
    levels: [{ ...p.levels[0], name: "Ground floor" }],
    materials: p.materials.map((m, i) => ({
      ...m,
      color: i === 0 ? "#e4dfd4" : m.color,
    })),
  };
  const level = p.levels[0].id;
  const rect = (x: number, y: number, w: number, h: number): Point[] => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const wall = (a: Point, b: Point, interior = false) => {
    const r = addWall(p, level, a, b, {
      wallTypeId: p.wallTypes[interior ? 1 : 0].id,
    });
    p = r.project;
    return r.wall.id;
  };
  const opening = (id: string, offset: number, kind: "door" | "window") => {
    p = addOpening(
      p,
      id,
      p.openingTypes.find((o) => o.kind === kind)!.id,
      offset,
    ).project;
  };
  const room = (name: string, x: number, y: number, w: number, h: number) => {
    p = addRoom(
      p,
      level,
      name,
      String(p.rooms.length + 1).padStart(2, "0"),
      rect(x, y, w, h),
    ).project;
  };
  const width = compact ? 8000 : 14000,
    height = compact ? 6000 : 10000,
    x = -width / 2,
    y = -height / 2;
  const outline = rect(x, y, width, height);
  const walls = outline.map((a, i) => wall(a, outline[(i + 1) % 4]));
  p = addFloor(p, level, p.floorTypes[0].id, outline).project;
  opening(walls[0], width / 2, "door");
  opening(walls[1], height / 2, "window");
  opening(walls[2], width / 2, "window");
  opening(walls[3], height / 2, "window");
  if (compact) {
    const partition = wall({ x: 1000, y: -3000 }, { x: 1000, y: 3000 }, true);
    opening(partition, 1500, "door");
    const bath = wall({ x: 1000, y: 0 }, { x: 4000, y: 0 }, true);
    opening(bath, 1500, "door");
    room("Studio", -3850, -2850, 4800, 5700);
    room("Kitchen", 1100, 100, 2750, 2750);
    room("Bathroom", 1100, -2850, 2750, 2750);
  } else {
    const spine = wall({ x: 1500, y: -5000 }, { x: 1500, y: 5000 }, true);
    opening(spine, 1600, "door");
    opening(spine, 7600, "door");
    const cross = wall({ x: 1500, y: 0 }, { x: 7000, y: 0 }, true);
    opening(cross, 1300, "door");
    const bath = wall({ x: 4500, y: 0 }, { x: 4500, y: 5000 }, true);
    opening(bath, 1700, "door");
    const kitchen = wall({ x: -7000, y: 1300 }, { x: 1500, y: 1300 }, true);
    opening(kitchen, 6200, "door");
    room("Living & dining", -6800, -4800, 8150, 5950);
    room("Kitchen", -6800, 1450, 8150, 3350);
    room("Primary bedroom", 1650, -4800, 5150, 4650);
    room("Bedroom 02", 1650, 150, 2700, 4650);
    room("Bath & utility", 4650, 150, 2150, 4650);
    opening(walls[0], 1800, "window");
    opening(walls[0], 11000, "window");
    opening(walls[2], 1900, "window");
    opening(walls[3], 7700, "window");
  }
  return p;
}
