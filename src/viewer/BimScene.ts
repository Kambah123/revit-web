import * as THREE from "three";
import { dimensionGeometry, dimensionOffset, dimensionLabel } from "../geometry/dimensions";
import { planShapeCoordinates } from "../geometry/planProjection";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clipSolid, PLAN_CUT_HEIGHT_MM, projectGeometry, type OpeningVoid, type Solid } from "../geometry/wallSolids";
import { ceilingSlabs, columnSolids, floorSlabs, roomFaces, roofSolids, type CeilingSlab, type FloorSlab, type RoomFace, type RoofSolid } from "../geometry/elementGeometry";
import { snapPoint } from "../model/geometry";
import { levelById, materialById, wallTypeById } from "../model/project";
import type { Dimension, Point, Polygon, Project } from "../model/types";

export type ViewMode = "plan" | "3d";
export type Tool = "select" | "wall" | "door" | "window" | "floor" | "room" | "column" | "ceiling" | "roof" | "dimension";
export type Selection =
  | { kind: "wall" | "opening" | "floor" | "room" | "column" | "ceiling" | "roof" | "dimension"; id: string }
  | null;
export type VisualStyle = "shaded" | "hiddenLine" | "wireframe";

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
  roomFill: 0x34c3ff,
  roomSelected: 0xffb020,
};

interface PickUserData {
  dimensionId?: string;
  wallId?: string;
  openingId?: string;
  floorId?: string;
  roomId?: string;
  columnId?: string;
  ceilingId?: string;
  roofId?: string;
}

/** Pick priority when several meshes overlap under the pointer: lower wins. */
const PICK_PRIORITY: Record<string, number> = {
  dimensionId: -1,
  openingId: 0,
  columnId: 1,
  wallId: 2,
  roofId: 3,
  floorId: 4,
  ceilingId: 5,
  roomId: 6,
};

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
  private readonly labelGroup = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private readonly materials: Record<string, THREE.Material>;
  /** Cache of colour materials keyed by "#rrggbb", rebuilt never; disposed with the scene. */
  private readonly colorMaterials = new Map<string, THREE.MeshStandardMaterial>();

  private readonly planMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private studioTheme = false;
  private visualStyle: VisualStyle = "shaded";
  private readonly grid = new THREE.GridHelper(200, 200, 0x3a4150, 0x2a2f3a);
  private readonly dimensionLine = new THREE.LineBasicMaterial({color:0x64748b,depthTest:false,depthWrite:false});
  private readonly dimensionSelected = new THREE.LineBasicMaterial({color:0x2563eb,depthTest:false,depthWrite:false});
  private readonly planEdges = new THREE.LineBasicMaterial({ color: 0x777e78 });
  private project: Project | null = null;
  private activeLevelId: string | null = null;
  private selection: Selection = null;
  private view: ViewMode = "plan";
  private tool: Tool = "select";
  private snapStep = 100;
  /** Paper-scale denominator (e.g. 100 = 1:100). Room labels scale with it. */
  private annotationScale = 100;
  private detailLevel: "Coarse" | "Medium" | "Fine" = "Medium";
  private handlers: SceneHandlers;
  private pressAt: { x: number; y: number } | null = null;
  private disposed = false;

  constructor(private readonly container: HTMLElement, handlers: SceneHandlers) {
    this.handlers = handlers;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1b1f27);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      roomFill: new THREE.MeshBasicMaterial({
        color: COLOR.roomFill,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      roomSelected: new THREE.MeshBasicMaterial({
        color: COLOR.roomSelected,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(12, 25, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);
    this.scene.add(this.grid);
    this.scene.add(this.modelGroup, this.pickGroup, this.previewGroup, this.labelGroup);

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

  /** Shaded (default), hidden-line (flat colours) or wireframe. Applies to every model material. */
  setVisualStyle(style: VisualStyle): void {
    this.visualStyle = style;
    const wire = style === "wireframe";
    for (const material of [...Object.values(this.materials), ...this.colorMaterials.values()]) {
      if ("wireframe" in material) {
        (material as THREE.MeshStandardMaterial).wireframe = wire;
        (material as THREE.MeshStandardMaterial).flatShading = style === "hiddenLine";
        material.needsUpdate = true;
      }
    }
    this.renderer.setClearColor(this.studioTheme ? 0xf8fafc : style === "hiddenLine" ? 0xf2f3f5 : 0x1b1f27);
    if(this.studioTheme) this.rebuild();
  }

  setStudioTheme(): void {
    this.studioTheme = true;
    this.renderer.setClearColor(0xf8fafc);
    this.grid.visible = false;
    (Array.isArray(this.grid.material)?this.grid.material:[this.grid.material]).forEach(m=>(m as THREE.LineBasicMaterial).color.set(0xdbe1e8));
    (this.materials.roomFill as THREE.MeshBasicMaterial).color.set(0xcbd5e1);
    (this.materials.roomFill as THREE.MeshBasicMaterial).opacity = 0.25;
    (this.materials.selected as THREE.MeshStandardMaterial).color.set(0x468bf0);
    (this.materials.selected as THREE.MeshStandardMaterial).emissive.set(0x091b35);
    this.rebuild();
  }

  setGridVisible(visible: boolean): void { this.grid.visible = visible; }

  zoomBy(factor: number): void {
    if (this.view === "plan") {
      this.planCamera.zoom = THREE.MathUtils.clamp(this.planCamera.zoom * factor, 0.1, 50);
      this.planCamera.updateProjectionMatrix();
    } else {
      const offset = this.perspCamera.position.clone().sub(this.orbitControls.target);
      offset.multiplyScalar(1 / factor).clampLength(0.5, 500);
      this.perspCamera.position.copy(this.orbitControls.target).add(offset);
    }
    this.activeControls().update();
  }

  /** Fit actual model bounds instead of resetting to a fixed origin. */
  fitToModel(): void {
    if (!this.project) return;
    const onView = (element: {levelId:string}) => this.view === "3d" || element.levelId === this.activeLevelId;
    const polygons = [...this.project.floors, ...this.project.rooms, ...this.project.ceilings, ...this.project.roofs];
    const points = [
      ...this.project.walls.filter(onView).flatMap(w=>[w.start,w.end]),
      ...this.project.dimensions.filter(onView).flatMap(d=>{const g=dimensionGeometry(d);return [d.start,d.end,g.a,g.b,g.label]}),
      ...polygons.filter(onView).flatMap(element=>element.boundary),
      ...this.project.columns.filter(onView).map(column=>column.position),
    ];
    if (!points.length) { this.planCamera.zoom=1; this.planCamera.updateProjectionMatrix(); this.resetCamera(); return; }
    const minX=Math.min(...points.map(p=>p.x))/1000, maxX=Math.max(...points.map(p=>p.x))/1000;
    const minY=Math.min(...points.map(p=>p.y))/1000, maxY=Math.max(...points.map(p=>p.y))/1000;
    const x=(minX+maxX)/2, z=-(minY+maxY)/2;
    if (this.view === "plan") {
      const aspect=Math.max(0.1,this.container.clientWidth/Math.max(1,this.container.clientHeight));
      const half=Math.max((maxY-minY)/2,(maxX-minX)/2/aspect,2)*1.5;
      this.planCamera.zoom=THREE.MathUtils.clamp(PLAN_HALF_HEIGHT_M/half,0.1,50);
      this.focusPlanPoint({x:x*1000,y:-z*1000});
      this.planCamera.updateProjectionMatrix();
    } else {
      const bounds = new THREE.Box3().setFromObject(this.modelGroup);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(4, sphere.radius);
      const verticalFov=THREE.MathUtils.degToRad(this.perspCamera.fov);
      const horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*this.perspCamera.aspect);
      const distance=radius/Math.sin(Math.min(verticalFov,horizontalFov)/2)*1.15;
      this.orbitControls.target.copy(sphere.center);
      this.perspCamera.position.copy(this.orbitControls.target).add(new THREE.Vector3(1,.85,1).normalize().multiplyScalar(distance));
      this.perspCamera.lookAt(this.orbitControls.target);
    }
    this.activeControls().update();
  }

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight) {
        obj.castShadow = on;
      }
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = on;
        obj.receiveShadow = on;
      }
    });
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Sets the annotation scale (paper denominator). Room labels grow with it. */
  setAnnotationScale(scale: number): void {
    this.annotationScale = scale;
    this.rebuild();
  }

  /** Detail level. Coarse hides room labels; Medium and Fine keep them. */
  setDetailLevel(detail: "Coarse" | "Medium" | "Fine"): void {
    this.detailLevel = detail;
    this.rebuild();
  }

  /** Resets the camera of the active view to its default framing. */
  resetCamera(): void {
    if (this.view === "plan") {
      this.planControls.target.set(0, 0, 0);
      this.planCamera.position.set(0, 80, 0);
      this.planCamera.lookAt(0, 0, 0);
    } else {
      this.orbitControls.target.set(0, 1, 0);
      this.perspCamera.position.set(18, 16, 18);
      this.perspCamera.lookAt(0, 1, 0);
    }
    this.activeControls().update();
  }

  /** Pans the plan camera so `point` sits at the centre of the view. */
  focusPlanPoint(point: Point): void {
    const world = planToWorld(point, this.activeElevationM());
    this.planControls.target.set(world.x, 0, world.z);
    this.planCamera.position.set(world.x, 80, world.z);
    this.planCamera.lookAt(world.x, 0, world.z);
    if (this.view === "3d") {
      this.orbitControls.target.set(world.x, 0, world.z);
    }
    this.activeControls().update();
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

  /** Draws a polygon-chain preview: the fixed vertices, a rubber band to `cursor`, and a closing band to the start. */
  setPolygonPreview(points: Point[] | null, cursor: Point | null): void {
    this.clearPreview();
    if (!points || points.length === 0) return;
    const y = this.activeElevationM() + 0.02;
    const at = (p: Point) => planToWorld(p, y);
    const vertices = points.map(at);
    if (cursor) vertices.push(at(cursor));
    if (vertices.length >= 2) {
      this.previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), this.materials.preview));
    }
    // Ghost of the closing edge back to the first point.
    if (cursor && points.length >= 2) {
      const closing = new THREE.BufferGeometry().setFromPoints([at(cursor), at(points[0])]);
      const dashed = new THREE.Line(closing, this.materials.preview);
      dashed.computeLineDistances();
      this.previewGroup.add(dashed);
    }
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
    this.clearGroup(this.labelGroup);
    this.clearPreview();
    Object.values(this.materials).forEach((m) => m.dispose());
    this.colorMaterials.forEach((m) => m.dispose());
    this.colorMaterials.clear();
    this.planMaterials.forEach(m=>m.dispose());
    this.planMaterials.clear();
    this.planEdges.dispose();
    this.dimensionLine.dispose();
    this.dimensionSelected.dispose();
    this.grid.geometry.dispose();
    const gridMats=Array.isArray(this.grid.material)?this.grid.material:[this.grid.material];
    gridMats.forEach(m=>m.dispose());
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
    this.clearGroup(this.labelGroup);
    if (!this.project || !this.activeLevelId) return;
    const project = this.project;
    const active = levelById(project, this.activeLevelId);
    if (!active) return;
    // Plan acts like a level view: lower levels show as underlay. The 3D view shows the whole model.
    const visible =
      this.view === "plan"
        ? new Set(project.levels.filter((l) => l.elevation <= active.elevation).map((l) => l.id))
        : new Set(project.levels.map((l) => l.id));
    const { solids, voids } = projectGeometry(project, visible, this.activeLevelId);
    // In plan, walls are cut at the view-range height, so openings are visible as gaps.
    const cut = this.view === "plan" ? active.elevation + PLAN_CUT_HEIGHT_MM : Infinity;
    const clippedSolids = solids.flatMap((s) => clipSolid(s, cut) ?? []);
    const clippedVoids = voids.flatMap((v) => clipSolid(v, cut) ?? []);

    const selectedWallId = this.selection?.kind === "wall" ? this.selection.id : null;
    const selectedOpeningId = this.selection?.kind === "opening" ? this.selection.id : null;
    const selectedFloorId = this.selection?.kind === "floor" ? this.selection.id : null;
    const selectedRoomId = this.selection?.kind === "room" ? this.selection.id : null;
    const selectedColumnId = this.selection?.kind === "column" ? this.selection.id : null;
    const selectedCeilingId = this.selection?.kind === "ceiling" ? this.selection.id : null;
    const selectedRoofId = this.selection?.kind === "roof" ? this.selection.id : null;
    const levelOfWall = new Map(project.walls.map((w) => [w.id, w.levelId]));

    for (const solid of clippedSolids) {
      const wallOnActive = levelOfWall.get(solid.wallId) === this.activeLevelId;
      const material = this.materialFor(solid, wallOnActive, selectedWallId, selectedOpeningId);
      this.addSolid(this.modelGroup, solid, material, { wallId: solid.wallId, openingId: solid.openingId });
    }
    for (const v of clippedVoids) this.addVoid(v);
    for (const slab of floorSlabs(project, visible)) {
      this.addFloorSlab(slab, slab.floorId === selectedFloorId);
    }
    for (const ceiling of ceilingSlabs(project, visible)) {
      this.addCeilingSlab(ceiling, ceiling.ceilingId === selectedCeilingId);
    }
    for (const roof of roofSolids(project, visible)) {
      this.addRoofMesh(roof, roof.roofId === selectedRoofId);
    }
    for (const c of columnSolids(project, visible)) {
      const material =
        c.columnId === selectedColumnId
          ? this.materials.selected
          : this.materialForColor(this.typeMaterialColor(c.materialId), COLOR.wall);
      this.addSolid(
        this.modelGroup,
        {
          role: "wall",
          wallId: "",
          centre: c.centre,
          axis: { x: 1, y: 0 },
          length: c.width,
          thickness: c.depth,
          z0: c.z0,
          z1: c.z1,
        },
        material,
        { columnId: c.columnId },
      );
    }
    // Rooms are plan annotations: a translucent fill and a label, never 3D geometry.
    if (this.view === "plan") {
      for(const d of project.dimensions.filter(d=>d.levelId===this.activeLevelId))this.addDimensionGraphic(d,this.selection?.id===d.id);
      for (const face of roomFaces(project, visible)) {
        this.addRoomFace(face, face.roomId === selectedRoomId, this.detailLevel !== "Coarse");
      }
    }
  }

  /** Material for a stored colour string, created once and shared. */
  private materialForColor(color: string | undefined, fallback: number): THREE.Material {
    if (this.studioTheme && this.view === "plan") {
      const planColor=this.visualStyle === "hiddenLine" ? "#ffffff" : color ?? "#ffffff";
      const key=`${planColor}:${this.visualStyle}`;
      let material=this.planMaterials.get(key);
      if(!material){material=new THREE.MeshBasicMaterial({color:planColor,wireframe:this.visualStyle === "wireframe"});this.planMaterials.set(key,material)}
      return material;
    }
    const hex = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : `#${fallback.toString(16).padStart(6, "0")}`;
    let material = this.colorMaterials.get(hex);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.85, wireframe: this.visualStyle === "wireframe", flatShading: this.visualStyle === "hiddenLine" });
      this.colorMaterials.set(hex, material);
    }
    return material;
  }

  private typeMaterialColor(materialId: string | undefined): string | undefined {
    return materialId && this.project ? materialById(this.project, materialId)?.color : undefined;
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
    if (!onActiveLevel) return this.materials.wallBelow;
    if (solid.role === "wall" && this.project) {
      const wall = this.project.walls.find((item) => item.id === solid.wallId);
      const wallType = wall && wallTypeById(this.project, wall.wallTypeId);
      return this.materialForColor(this.typeMaterialColor(wallType?.materialId), COLOR.wall);
    }
    return this.materials.wall;
  }

  /** Actual rendered colour for a wall; exposed only through the development e2e hook. */
  wallColor(wallId: string): string | null {
    const mesh = this.modelGroup.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.userData.wallId === wallId,
    );
    const material = mesh && (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
    return material instanceof THREE.MeshStandardMaterial
      ? `#${material.color.getHexString(THREE.SRGBColorSpace)}`
      : null;
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
    if(this.studioTheme && this.view === "plan" && group === this.modelGroup) {
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),this.planEdges);
      edges.position.copy(mesh.position);edges.rotation.copy(mesh.rotation);group.add(edges);
    }
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

  /** Extrudes a floor slab from its boundary polygon. The top face is at the level elevation. */
  private addFloorSlab(slab: FloorSlab, selected: boolean): void {
    const material = selected ? this.materials.selected : this.materialForColor(this.typeMaterialColor(slab.materialId), COLOR.wall);
    const mesh = this.addSlabMesh(slab.boundary, slab.z0, slab.z1, material);
    mesh.userData = { floorId: slab.floorId };
  }

  /** A ceiling panel: the same polygon slab, positioned by its height above the level. */
  private addCeilingSlab(slab: CeilingSlab, selected: boolean): void {
    const material = selected
      ? this.materials.selected
      : this.materialForColor(this.typeMaterialColor(slab.materialId), COLOR.wall);
    const mesh = this.addSlabMesh(slab.boundary, slab.z0, slab.z1, material);
    mesh.userData = { ceilingId: slab.ceilingId };
  }

  /** Extrudes a boundary polygon between elevations z0..z1 and adds it to the model group. */
  private addSlabMesh(boundary: Polygon, z0: number, z1: number, material: THREE.Material): THREE.Mesh {
    const shape = new THREE.Shape(boundary.map((p) => new THREE.Vector2(...planShapeCoordinates(p))));
    const depth = (z1 - z0) * MM_TO_SCENE;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    // Shape (x, y) rotated -PI/2 sends local +Z to world +Y and plan +y to world -Z.
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = z0 * MM_TO_SCENE;
    this.modelGroup.add(mesh);
    return mesh;
  }

  /**
   * A hip roof: two trapezoid slopes, two hip ends and a flat soffit closing the volume. Built
   * directly in world coordinates from the derived footprint and ridge.
   */
  private addRoofMesh(roof: RoofSolid, selected: boolean): void {
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x * MM_TO_SCENE, z * MM_TO_SCENE, -y * MM_TO_SCENE);
    const c1 = at(roof.minX, roof.minY, roof.z0);
    const c2 = at(roof.maxX, roof.minY, roof.z0);
    const c3 = at(roof.maxX, roof.maxY, roof.z0);
    const c4 = at(roof.minX, roof.maxY, roof.z0);
    const r1 = at(roof.ridgeA.x, roof.ridgeA.y, roof.z1);
    const r2 = at(roof.ridgeB.x, roof.ridgeB.y, roof.z1);
    const positions: number[] = [];
    const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    // Sides and hips (each quad as two triangles; DoubleSide material keeps winding harmless).
    push(c1, r1, r2);
    push(c1, r2, c2);
    push(c3, r2, r1);
    push(c3, r1, c4);
    push(c2, r2, c3);
    push(c4, r1, c1);
    // Soffit closes the volume.
    push(c1, c2, c3);
    push(c1, c3, c4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const base = selected
      ? this.materials.selected
      : this.materialForColor(this.typeMaterialColor(roof.materialId), COLOR.wall);
    // Roofs use a DoubleSide variant of the base colour so sloped faces always shade correctly.
    const material = this.doubleSideFor(base);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { roofId: roof.roofId };
    this.modelGroup.add(mesh);
  }

  /** DoubleSide twin of a material, cached alongside the colour materials. */
  private doubleSideFor(base: THREE.Material): THREE.Material {
    const key = `//double//${base.uuid}`;
    let material = this.colorMaterials.get(key);
    if (!material) {
      const source = base as THREE.MeshStandardMaterial;
      material = new THREE.MeshStandardMaterial({
        color: source.color ? source.color.clone() : new THREE.Color(COLOR.wall),
        roughness: source.roughness ?? 0.85,
        side: THREE.DoubleSide,
        flatShading: source.flatShading ?? false,
      });
      this.colorMaterials.set(key, material);
    }
    return material;
  }

  /** Plan-only room fill and a canvas-texture label showing name and derived area. */
  private addRoomFace(face: RoomFace, selected: boolean, withLabel: boolean): void {
    const shape = new THREE.Shape(face.boundary.map((p) => new THREE.Vector2(...planShapeCoordinates(p))));
    const geometry = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geometry, selected ? this.materials.roomSelected : this.materials.roomFill);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = face.z * MM_TO_SCENE + 0.01;
    mesh.userData = { roomId: face.roomId };
    this.modelGroup.add(mesh);

    const room = this.project?.rooms.find((r) => r.id === face.roomId);
    if (room && withLabel) {
      const areaM2 = (face.areaMm2 / 1e6).toFixed(2);
      const sprite = this.labelSprite(`${room.name}\n${areaM2} m²`);
      sprite.position.copy(planToWorld(face.labelPoint, face.z * MM_TO_SCENE + 0.05));
      sprite.userData = { roomId: face.roomId };
      this.labelGroup.add(sprite);
    }
  }

  /** A text sprite drawn on a canvas texture; shared style, disposed with the scene. */
  /** Render static dimensions above the model; invisible hit strips support native canvas selection. */
  private addDimensionGraphic(d:Dimension,selected:boolean,preview=false):void {
    const shape=dimensionGeometry(d), y=this.activeElevationM()+1.6;
    const group=preview?this.previewGroup:this.modelGroup;
    const geometry=new THREE.BufferGeometry().setFromPoints(shape.segments.flatMap(pair=>pair.map(p=>planToWorld(p,y))));
    const line=new THREE.LineSegments(geometry,selected?this.dimensionSelected:this.dimensionLine);line.renderOrder=20;group.add(line);
    const label=this.labelSprite(dimensionLabel(d));label.position.copy(planToWorld(shape.label,y));label.material.depthTest=false;label.renderOrder=21;label.userData={dimensionId:d.id};(preview?this.previewGroup:this.labelGroup).add(label);
    if(!preview){
      const hit=new THREE.Mesh(new THREE.BoxGeometry(shape.length*.001,.04,.24),this.materials.pick);
      hit.position.copy(planToWorld({x:(shape.a.x+shape.b.x)/2,y:(shape.a.y+shape.b.y)/2},y));hit.rotation.y=Math.atan2(shape.axis.y,shape.axis.x);hit.userData={dimensionId:d.id};this.pickGroup.add(hit);
    }
  }
  setDimensionPreview(points:Point[],cursor:Point|null):void {
    this.clearPreview();if(!cursor||!points.length)return;
    const end=points[1]??cursor;if(Math.hypot(end.x-points[0].x,end.y-points[0].y)<1)return;
    this.addDimensionGraphic({id:"preview",levelId:this.activeLevelId??"",start:points[0],end,offset:points.length>1?dimensionOffset(points[0],end,cursor):0,unit:"mm"},true,true);
  }

  private labelSprite(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = this.studioTheme ? "rgba(248,250,252,0)" : "rgba(20, 24, 32, 0.75)";
    ctx.beginPath();
    ctx.roundRect(8, 24, 240, 80, 12);
    ctx.fill();
    ctx.fillStyle = this.studioTheme ? "#475569" : "#e6e9ef";
    ctx.font = this.studioTheme ? "400 25px system-ui, sans-serif" : "600 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    const lines = text.split("\n");
    lines.forEach((line, i) => ctx.fillText(line, 128, 56 + i * 34, 224));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: !this.studioTheme });
    const sprite = new THREE.Sprite(material);
    if (this.studioTheme) sprite.renderOrder = 10;
    // Label size follows the annotation scale: 1:100 is the base size.
    const k = this.annotationScale / 100;
    sprite.scale.set(2.4 * k, 1.2 * k, 1);
    return sprite;
  }

  /** Removes meshes from a group and frees their geometry. Materials are shared and kept. */
  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose();
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
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

  /**
   * Picks under the pointer. Openings win over walls; among overlapping elements the pick priority
   * list decides, so flat plan fills do not steal clicks.
   */
  private pickAt(event: PointerEvent): Selection {
    this.setPointerFromEvent(event);
    const objects = [...this.pickGroup.children, ...this.modelGroup.children, ...this.labelGroup.children];
    const hits = this.raycaster.intersectObjects(objects, false);
    let best: Selection = null;
    let bestPriority = Infinity;
    for (const hit of hits) {
      const data = hit.object.userData as PickUserData;
      const choice = selectionFromUserData(data);
      if (!choice) continue;
      const priority = PICK_PRIORITY[SELECTION_KEY[choice.kind]] ?? 99;
      if (priority < bestPriority) {
        best = choice;
        bestPriority = priority;
      }
    }
    return best;
  }
}

const SELECTION_KEY: Record<NonNullable<Selection>["kind"], keyof PickUserData> = {
  wall: "wallId",
  opening: "openingId",
  floor: "floorId",
  room: "roomId",
  column: "columnId",
  ceiling: "ceilingId",
  roof: "roofId",
  dimension: "dimensionId",
};

function selectionFromUserData(data: PickUserData): Selection {
  if (data.dimensionId) return {kind:"dimension",id:data.dimensionId};
  if (data.openingId) return { kind: "opening", id: data.openingId };
  if (data.columnId) return { kind: "column", id: data.columnId };
  if (data.wallId) return { kind: "wall", id: data.wallId };
  if (data.roofId) return { kind: "roof", id: data.roofId };
  if (data.floorId) return { kind: "floor", id: data.floorId };
  if (data.ceilingId) return { kind: "ceiling", id: data.ceilingId };
  if (data.roomId) return { kind: "room", id: data.roomId };
  return null;
}
