import { createProject } from "../model/project";
import type { Project } from "../model/types";

/** A fresh project with two levels, two wall types and two opening types. */
export function freshProject(): Project {
  return createProject("Test project");
}

export function ids(p: Project) {
  return {
    level1: p.levels[0].id,
    level2: p.levels[1].id,
    thickWall: p.wallTypes[0].id,
    thinWall: p.wallTypes[1].id,
    door: p.openingTypes[0].id,
    window: p.openingTypes[1].id,
  };
}

/** A simple in-memory Storage replacement. */
export class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}
