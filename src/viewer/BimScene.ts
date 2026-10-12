import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { snapPoint, wallPlacement } from "../model/geometry";
import { levelById } from "../model/project";
import type { Project, Vec2 } from "../model/types";

export type ToolMode = "select" | "wall";

export interface SceneHandlers {
  /** A snapped plan point was clicked while the wall tool is active. */
  onPlanClick(point: Vec2): void;
  /** The pointer moved over the plan while the wall tool is active (snapped). */
  onPlanMove(point: Vec2): void;
  /** A wall was clicked in select mode, or null when empty space was clicked. */
  onWallPick(wallId: string | null): void;
}

const CLICK_TOLERANCE_PX = 4;
const COLOR_ACTIVE = 0xd8d2c4;
const COLOR_BELOW = 0x7d8aa0;
const COLOR_SELECTED = 0xffb020;
const COLOR_PREVIEW = 0x34c3ff;

/**
 * Owns the Three.js scene. Plan coordinates (x, y) map to world (x, 0, z); elevation is world y.
 * Model state lives in React; this class only renders it and reports pointer input.
 */
export class BimScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly wallGroup = new THREE.Group();
  private readonly previewGroup = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private readonly materials = {
    active: new THREE.MeshStandardMaterial({ color: COLOR_ACTIVE, roughness: 0.85 }),
    below: new THREE.MeshStandardMaterial({
      color: COLOR_BELOW,
      roughness: 0.9,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
    selected: new THREE.MeshStandardMaterial({
      color: COLOR_SELECTED,
      emissive: 0x402800,
      roughness: 0.7,
    }),
    preview: new THREE.LineBasicMaterial({ color: COLOR_PREVIEW }),
  };

  private project: Project | null = null;
  private activeLevelId: string | null = null;
  private selectedWallId: string | null = null;
  private mode: ToolMode = "select";
  private snapStep = 0.1;
  private handlers: SceneHandlers;
  private pressAt: { x: number; y: number } | null = null;
  private disposed = false;

  constructor(private readonly container: HTMLElement, handlers: SceneHandlers) {
    this.handlers = handlers;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1b1f27);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.camera.position.set(18, 16, 18);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.update();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(12, 25, 8);
    this.scene.add(sun);

    const grid = new THREE.GridHelper(200, 200, 0x3a4150, 0x2a2f3a);
    this.scene.add(grid);
    this.scene.add(this.wallGroup);
    this.scene.add(this.previewGroup);

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointermove", this.onPointerMove);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setHandlers(handlers: SceneHandlers): void {
    this.handlers = handlers;
  }

  setMode(mode: ToolMode): void {
    this.mode = mode;
    this.clearPreview();
    this.renderer.domElement.style.cursor = mode === "wall" ? "crosshair" : "default";
  }

  setSnapStep(step: number): void {
    this.snapStep = step;
  }

  setProject(project: Project): void {
    this.project = project;
    this.rebuildWalls();
  }

  setActiveLevel(levelId: string | null): void {
    this.activeLevelId = levelId;
    this.rebuildWalls();
  }

  setSelectedWall(wallId: string | null): void {
    this.selectedWallId = wallId;
    this.rebuildWalls();
  }

  /** Draws a rubber-band line from a start point to the cursor, or clears it when either end is null. */
  setPreview(start: Vec2 | null, end: Vec2 | null): void {
    this.clearPreview();
    if (!start || !end) return;
    const y = this.activeElevation() + 0.05;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, y, start.y),
      new THREE.Vector3(end.x, y, end.y),
    ]);
    this.previewGroup.add(new THREE.Line(geometry, this.materials.preview));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    this.controls.dispose();
    this.clearWallMeshes();
    this.clearPreview();
    Object.values(this.materials).forEach((m) => m.dispose());
    this.renderer.dispose();
    canvas.remove();
  }

  private activeElevation(): number {
    if (!this.project || !this.activeLevelId) return 0;
    return levelById(this.project, this.activeLevelId)?.elevation ?? 0;
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private rebuildWalls(): void {
    this.clearWallMeshes();
    if (!this.project) return;
    const activeElevation = this.activeElevation();

    for (const wall of this.project.walls) {
      const level = levelById(this.project, wall.levelId);
      if (!level) continue;
      // Show the active level and everything below it, like a stacked plan view.
      if (level.elevation > activeElevation + 1e-6) continue;

      const placement = wallPlacement(wall, level.elevation);
      const geometry = new THREE.BoxGeometry(placement.length, wall.height, wall.thickness);
      const isActive = wall.levelId === this.activeLevelId;
      const material =
        wall.id === this.selectedWallId
          ? this.materials.selected
          : isActive
            ? this.materials.active
            : this.materials.below;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(placement.center.x, placement.baseElevation + wall.height / 2, placement.center.y);
      mesh.rotation.y = placement.angle;
      mesh.userData.wallId = wall.id;
      this.wallGroup.add(mesh);
    }
  }

  private clearWallMeshes(): void {
    for (const child of [...this.wallGroup.children]) {
      this.wallGroup.remove(child);
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
  }

  private clearPreview(): void {
    for (const child of [...this.previewGroup.children]) {
      this.previewGroup.remove(child);
      if (child instanceof THREE.Line) child.geometry.dispose();
    }
  }

  private setPointerFromEvent(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** Intersects the pointer ray with the active level's plane and returns a snapped plan point. */
  private planePointFromEvent(event: PointerEvent): Vec2 | null {
    this.setPointerFromEvent(event);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.activeElevation());
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    return snapPoint({ x: hit.x, y: hit.z }, this.snapStep);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pressAt = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.pressAt) return;
    const moved = Math.hypot(event.clientX - this.pressAt.x, event.clientY - this.pressAt.y);
    this.pressAt = null;
    if (moved > CLICK_TOLERANCE_PX) return; // It was an orbit drag, not a click.

    if (this.mode === "wall") {
      const point = this.planePointFromEvent(event);
      if (point) this.handlers.onPlanClick(point);
      return;
    }

    this.setPointerFromEvent(event);
    const hits = this.raycaster.intersectObjects(this.wallGroup.children, false);
    const wallId = (hits[0]?.object.userData.wallId as string | undefined) ?? null;
    this.handlers.onWallPick(wallId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.mode !== "wall") return;
    const point = this.planePointFromEvent(event);
    if (point) this.handlers.onPlanMove(point);
  };
}
