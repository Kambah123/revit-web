/// <reference types="vite/client" />

/** Development-only hook used by the end-to-end tests. It is removed in production builds. */
interface Window {
  __revitWeb?: {
    project(): import("./model/types").Project;
    screenOf(point: import("./model/types").Point): { x: number; y: number };
    meshCount(): number;
    wallColor(wallId: string): string | null;
    view(): "plan" | "3d" | "elevation";
  };
}
