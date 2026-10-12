import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clipSolid, PLAN_CUT_HEIGHT_MM, projectGeometry, type OpeningVoid, type Solid } from "../geometry/wallSolids";
import { snapPoint } from "../model/geometry";
import { levelById } from "../model/project";
import type { Point, Project } from "../model/types";

export type ViewMode = "plan" | "3d";
export type Tool = "select" | "wall" | "door" | "window";
export type Selection = { kind: "wall" | "opening"; id: string } | null;

export interface SceneHandlers {
  /** A click on the active level's plane, snapped to the snap step (integer mm). */
  onPlanClick(point: Point): void;
  /** Pointer movement over the active level's plane, snapped (integer mm). */
  onPlanMove(point: Point): void;
  /** A wall or opening was clicked in select mode; null when empty space was clicked. */
  onPick(selection: Selection): void;
}

/** Scene units are metres; the model is in millimetres. This is the only place they meet. */
const MM_TO_SCENE = 1 / 1000;

/**
 * Plan (x, y) in millimetres maps to world (x, elevation, -y) in metres. Viewed from above, X points
 * right and Y points up the screen, and the 3D view is not mirrored relative to the plan.
 */
function planToWorld(p: Point, elevationM: number): THREE.Vector3 {
  return new THREE.Vector3(p.x * MM_TO_SCENE, elevationM, -p.y * MM_TO_SCENE);
}
const CLICK_TOLERANCE_PX = 4;
const PLAN_HALF_HEIGHT_M = 12;

const COLOR = {
  wall: 0xd8d2c4,
  wallBelow: 0x7d8aa0,
  selected: 0xffb020,
  doorLeaf: 0x9b6b3c,
  glass: 0x7fd4ff,
  preview: 0x34c3ff,
};

interface PickUserData {
  wallId?: string;
  openingId?: string;
}

/**
 * Owns the Three.js scene. It renders derived geometry (see src/geometry) in two views of the same
 * scene: an orthographic plan and a perspective 3D view. It never edits the model; it reports input.
 */
export class BimScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly planCamera: THREE.OrthographicCamera;
  private readonly perspCamera: THREE.PerspectiveCamera;
  private readonly planControls: MapControls;
  private readonly orbitControls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly modelGroup = new THREE.Group();
  private readonly pickGroup = new THREE.Group();
  private readonly previewGroup = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private readonly materials: Record<string, THREE.Material>;

  private project: Project | null = null;
  private activeLevelId: string | null = null;
  private selection: Selection = null;
  private view: ViewMode = "plan";
  private tool: Tool = "select";
  private snapStep = 100;
  private handlers: SceneHandlers;
  private pressAt: { x: number; y: number } | null = null;
  private disposed = false;

  constructor(private readonly container: HTMLElement, handlers: SceneHandlers) {
    this.handlers = handlers;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1b1f27);
    container.appendChild(this.renderer.domElement);

    this.planCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    this.planCamera.up.set(0, 0, -1); // with plan y mapped to -z, +y points up the screen
    this.planCamera.position.set(0, 80, 0);
    this.planCamera.lookAt(0, 0, 0);

    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.perspCamera.position.set(18, 16, 18);

    this.planControls = new MapControls(this.planCamera, this.renderer.domElement);
    this.planControls.enableRotate = false;
    this.planControls.screenSpacePanning = true;
    this.planControls.target.set(0, 0, 0);

    this.orbitControls = new OrbitControls(this.perspCamera, this.renderer.domElement);
    this.orbitControls.target.set(0, 1, 0);
    this.orbitControls.enableDamping = true;

    this.materials = {
      wall: new THREE.MeshStandardMaterial({ color: COLOR.wall, roughness: 0.85 }),
      wallBelow: new THREE.MeshStandardMaterial({
        color: COLOR.wallBelow,
        roughness: 0.9,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
      selected: new THREE.MeshStandardMaterial({ color: COLOR.selected, emissive: 0x402800, roughness: 0.7 }),
      doorLeaf: new THREE.MeshStandardMaterial({ color: COLOR.doorLeaf, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({
        color: COLOR.glass,
        transparent: true,
        opacity: 0.35,
        roughness: 0.2,
        depthWrite: false,
      }),
      pick: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      preview: new THREE.LineBasicMaterial({ color: COLOR.preview }),
    };

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(12, 25, 8);
    this.scene.add(sun);
    this.scene.add(new THREE.GridHelper(200, 200, 0x3a4150, 0x2a2f3a));
    this.scene.add(this.modelGroup, this.pickGroup, this.previewGroup);

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointermove", this.onPointerMove);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applyView();

    this.renderer.setAnimationLoop(() => {
      this.activeControls().update();
      this.renderer.render(this.scene, this.activeCamera());
    });
  }

  setHandlers(handlers: SceneHandlers): void {
    this.handlers = handlers;
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.applyView();
    this.clearPreview();
    this.rebuild();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.renderer.domElement.style.cursor = tool === "select" ? "default" : "crosshair";
    this.clearPreview();
  }

  setSnapStep(step: number): void {
    this.snapStep = step;
  }

  setProject(project: Project): void {
    this.project = project;
    this.rebuild();
  }

  setActiveLevel(levelId: string | null): void {
    this.activeLevelId = levelId;
    this.rebuild();
  }

  setSelection(selection: Selection): void {
    this.selection = selection;
    this.rebuild();
  }

  /** Draws a rubber-band line, or clears it when either end is null. */
  setPreview(start: Point | null, end: Point | null): void {
    this.clearPreview();
    if (!start || !end) return;
    const y = this.activeElevationM() + 0.02;
    const geometry = new THREE.BufferGeometry().setFromPoints([planToWorld(start, y), planToWorld(end, y)]);
    this.previewGroup.add(new THREE.Line(geometry, this.materials.preview));
  }

  /** Screen position (CSS pixels within the canvas) of a plan point on the active level. */
  planToScreen(point: Point): { x: number; y: number } {
    const v = planToWorld(point, this.activeElevationM());
    v.project(this.planCamera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width,
      y: ((1 - v.y) / 2) * rect.height,
    };
  }

  /** Number of meshes currently in the model group, used by tests and the debug hook. */
  meshCount(): number {
    return this.modelGroup.children.length;
  }

  currentView(): ViewMode {
    return this.view;
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
    this.planControls.dispose();
    this.orbitControls.dispose();
    this.clearGroup(this.modelGroup);
    this.clearGroup(this.pickGroup);
    this.clearPreview();
    Object.values(this.materials).forEach((m) => m.dispose());
    this.renderer.dispose();
    canvas.remove();
  }

  private activeCamera(): THREE.Camera {
    return this.view === "plan" ? this.planCamera : this.perspCamera;
  }

  private activeControls(): { update(): void } {
    return this.view === "plan" ? this.planControls : this.orbitControls;
  }

  private applyView(): void {
    const plan = this.view === "plan";
    this.planControls.enabled = plan;
    this.orbitControls.enabled = !plan;
    if (plan) {
      const target = this.planControls.target;
      this.planCamera.position.set(target.x, 80, target.z);
      this.planCamera.lookAt(target.x, 0, target.z);
    }
    this.resize();
  }

  private activeElevationM(): number {
    if (!this.project || !this.activeLevelId) return 0;
    return (levelById(this.project, this.activeLevelId)?.elevation ?? 0) * MM_TO_SCENE;
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    const aspect = width / height;
    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();
    this.planCamera.left = -PLAN_HALF_HEIGHT_M * aspect;
    this.planCamera.right = PLAN_HALF_HEIGHT_M * aspect;
    this.planCamera.top = PLAN_HALF_HEIGHT_M;
    this.planCamera.bottom = -PLAN_HALF_HEIGHT_M;
    this.planCamera.updateProjectionMatrix();
  }

  /** Rebuilds all model meshes from the derived geometry of the current project. */
  private rebuild(): void {
    this.clearGroup(this.modelGroup);
    this.clearGroup(this.pickGroup);
    if (!this.project || !this.activeLevelId) return;
    const project = this.project;
    const active = levelById(project, this.activeLevelId);
    if (!active) return;
    const visible = new Set(project.levels.filter((l) => l.elevation <= active.elevation).map((l) => l.id));
    const { solids, voids } = projectGeometry(project, visible, this.activeLevelId);
    // In plan, walls are cut at the view-range height, so openings are visible as gaps.
    const cut = this.view === "plan" ? active.elevation + PLAN_CUT_HEIGHT_MM : Infinity;
    const clippedSolids = solids.flatMap((s) => clipSolid(s, cut) ?? []);
    const clippedVoids = voids.flatMap((v) => clipSolid(v, cut) ?? []);

    const selectedWallId = this.selection?.kind === "wall" ? this.selection.id : null;
    const selectedOpeningId = this.selection?.kind === "opening" ? this.selection.id : null;
    const levelOfWall = new Map(project.walls.map((w) => [w.id, w.levelId]));

    for (const solid of clippedSolids) {
      const wallOnActive = levelOfWall.get(solid.wallId) === this.activeLevelId;
      const material = this.materialFor(solid, wallOnActive, selectedWallId, selectedOpeningId);
      this.addSolid(this.modelGroup, solid, material, { wallId: solid.wallId, openingId: solid.openingId });
    }
    for (const v of clippedVoids) this.addVoid(v);
  }

  private materialFor(
    solid: Solid,
    onActiveLevel: boolean,
    selectedWallId: string | null,
    selectedOpeningId: string | null,
  ): THREE.Material {
    if (solid.openingId && solid.openingId === selectedOpeningId) return this.materials.selected;
    if (solid.role === "wall" && solid.wallId === selectedWallId) return this.materials.selected;
    if (solid.role === "door-leaf") return this.materials.doorLeaf;
    if (solid.role === "window-glass") return this.materials.glass;
    return onActiveLevel ? this.materials.wall : this.materials.wallBelow;
  }

  private addSolid(group: THREE.Group, s: Solid, material: THREE.Material, userData: PickUserData): THREE.Mesh {
    const height = (s.z1 - s.z0) * MM_TO_SCENE;
    const geometry = new THREE.BoxGeometry(s.length * MM_TO_SCENE, height, s.thickness * MM_TO_SCENE);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(planToWorld(s.centre, 0));
    mesh.position.y = ((s.z0 + s.z1) / 2) * MM_TO_SCENE;
    // The box's local X runs along the wall. A rotation of theta about Y maps local X to (cos, 0, -sin).
    mesh.rotation.y = Math.atan2(s.axis.y, s.axis.x);
    mesh.userData = { ...userData };
    group.add(mesh);
    return mesh;
  }

  private addVoid(v: OpeningVoid): void {
    const s: Solid = {
      role: "wall",
      wallId: v.wallId,
      openingId: v.openingId,
      centre: v.centre,
      axis: v.axis,
      length: v.length,
      thickness: v.thickness,
      z0: v.z0,
      z1: v.z1,
    };
    // Invisible pick proxy over the opening. It is listed first so openings win picks over walls.
    this.addSolid(this.pickGroup, s, this.materials.pick, { wallId: v.wallId, openingId: v.openingId });
  }

  /** Removes meshes from a group and frees their geometry. Materials are shared and kept. */
  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
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
    this.raycaster.setFromCamera(this.pointer, this.activeCamera());
  }

  /** Intersects the pointer ray with the active level's plane and returns a snapped plan point. */
  private planPointFromEvent(event: PointerEvent): Point | null {
    this.setPointerFromEvent(event);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.activeElevationM());
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    return snapPoint({ x: Math.round(hit.x / MM_TO_SCENE), y: Math.round(-hit.z / MM_TO_SCENE) }, this.snapStep);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pressAt = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.pressAt) return;
    const moved = Math.hypot(event.clientX - this.pressAt.x, event.clientY - this.pressAt.y);
    this.pressAt = null;
    if (moved > CLICK_TOLERANCE_PX) return; // a drag: the controls handled it

    if (this.tool === "select") {
      this.handlers.onPick(this.pickAt(event));
      return;
    }
    const point = this.planPointFromEvent(event);
    if (point) this.handlers.onPlanClick(point);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.tool === "select") return;
    const point = this.planPointFromEvent(event);
    if (point) this.handlers.onPlanMove(point);
  };

  /** Openings first (they sit inside walls), then walls. */
  private pickAt(event: PointerEvent): Selection {
    this.setPointerFromEvent(event);
    const openingHit = this.raycaster.intersectObjects(this.pickGroup.children, false)[0];
    const openingId = openingHit?.object.userData.openingId as string | undefined;
    if (openingId) return { kind: "opening", id: openingId };
    const wallHit = this.raycaster.intersectObjects(this.modelGroup.children, false)[0];
    const data = wallHit?.object.userData as PickUserData | undefined;
    if (data?.openingId) return { kind: "opening", id: data.openingId };
    if (data?.wallId) return { kind: "wall", id: data.wallId };
    return null;
  }
}
