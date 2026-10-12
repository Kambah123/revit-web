import { useEffect, useReducer, useRef, useState } from "react";
import { canRedo, canUndo, historyReducer, initialHistory } from "./app/history";
import { RIBBON_TABS, type CommandSpec, type RibbonTabId } from "./app/ribbon";
import {
  addCeiling,
  addColumn,
  addFloor,
  addLevel,
  addOpening,
  addRoof,
  addRoom,
  addWall,
  deleteCeiling,
  deleteColumn,
  deleteFloor,
  deleteLevel,
  deleteOpening,
  deleteRoof,
  deleteRoom,
  deleteWall,
  renameLevel,
  setLevelElevation,
  updateCeiling,
  updateColumn,
  updateFloor,
  updateOpening,
  updateRoof,
  updateRoom,
  updateWall,
  updateWallType,
} from "./model/commands";
import { nearestWallEndpoint, nearestWallOnLevel } from "./model/queries";
import { pointsEqual, snapValue } from "./model/geometry";
import { createProject, levelById, openingById, wallById } from "./model/project";
import { parseProject, serializeProject } from "./model/schema";
import type { Point, Project } from "./model/types";
import { clearAutosave, AUTOSAVE_KEY, readAutosave, writeAutosave, type KeyValueStorage } from "./persistence/autosave";
import { LevelsPanel } from "./ui/LevelsPanel";
import { RenameField } from "./ui/RenameField";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { ProjectBrowser, type ViewTab } from "./ui/ProjectBrowser";
import { ViewTabs } from "./ui/ViewTabs";
import { ViewControlBar, type DetailLevel } from "./ui/ViewControlBar";
import { StatusBar } from "./ui/StatusBar";
import { Ribbon } from "./ui/Ribbon";
import { CommandLauncher } from "./ui/CommandLauncher";
import { ShortcutsDialog } from "./ui/ShortcutsDialog";
import { BimScene, type Selection, type Tool, type ViewMode, type VisualStyle } from "./viewer/BimScene";
import { ElevationView } from "./ui/ElevationView";
import { elevationTitle, type ElevationDirection } from "./geometry/elevation";

interface Message {
  kind: "info" | "error";
  text: string;
}

/** Radius in mm within which a wall endpoint snaps to an existing endpoint, so walls join. */
const JOIN_SNAP_RADIUS_MM = 150;
/** Maximum distance in mm from a wall centreline for a door or window click to host in it. */
const HOST_PICK_DISTANCE_MM = 600;
const SNAP_OPTIONS = [0, 50, 100, 500, 1000];

function getStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadInitial(): { project: Project; message: Message | null } {
  const storage = getStorage();
  if (storage) {
    const read = readAutosave(storage);
    if (read.status === "ok") return { project: read.project, message: { kind: "info", text: "Recovered your autosaved project." } };
    if (read.status === "invalid") {
      // Keep the unreadable data so it can be inspected, then start fresh.
      storage.setItem(`${AUTOSAVE_KEY}:unreadable`, read.raw);
      clearAutosave(storage);
      return {
        project: createProject(),
        message: { kind: "error", text: `The autosaved project could not be recovered (${read.message}). A copy was kept.` },
      };
    }
  }
  return { project: createProject(), message: null };
}

const planTabId = (levelId: string) => `plan:${levelId}`;
const elevTabId = (d: ElevationDirection) => `elev:${d}`;
const elevationTab = (d: ElevationDirection): ViewTab => ({ id: elevTabId(d), kind: "elevation", direction: d, title: elevationTitle(d) });
const THREED_TAB: ViewTab = { id: "3d", kind: "3d", title: "3D" };

export function App() {
  const [initial] = useState(loadInitial);
  const [hist, dispatchHist] = useReducer(historyReducer, initial.project, initialHistory);
  const project = hist.present;

  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState<ViewMode>("plan");
  const [elevation, setElevation] = useState<ElevationDirection | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string>(project.levels[0].id);
  const [selectionState, setSelection] = useState<Selection>(null);
  const [pendingStart, setPendingStart] = useState<Point | null>(null);
  const [pendingPoints, setPendingPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snapStep, setSnapStep] = useState(100);
  const [message, setMessage] = useState<Message | null>(initial.message);

  // Workspace state.
  const [openViews, setOpenViews] = useState<ViewTab[]>(() => [
    { id: planTabId(project.levels[0].id), kind: "plan", levelId: project.levels[0].id, title: project.levels[0].name },
    THREED_TAB,
  ]);
  const [ribbonTab, setRibbonTab] = useState<RibbonTabId>("architecture");
  const [contextualActive, setContextualActive] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(280);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("shaded");
  const [shadows, setShadows] = useState(true);
  const [scale, setScale] = useState(100);
  const [detail, setDetail] = useState<DetailLevel>("Medium");

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BimScene | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The active level and selection are checked against the project, so undo or deletion cannot leave them dangling.
  const activeId = levelById(project, activeLevelId) ? activeLevelId : project.levels[0].id;
  const selection = validSelection(project, selectionState);
  const activeLevel = levelById(project, activeId);

  const say = (text: string, kind: Message["kind"] = "info") => setMessage({ kind, text });

  /** Runs a model command. On success the result is committed to history; on failure the model is untouched. */
  function run(label: string, edit: (p: Project) => Project, okText?: string): boolean {
    try {
      dispatchHist({ type: "commit", label, project: edit(project) });
      if (okText) say(okText);
      return true;
    } catch (error) {
      say(error instanceof Error ? error.message : "That change could not be made.", "error");
      return false;
    }
  }

  // Handlers for the scene read the latest state through this ref, because the scene is created once.
  const ctx = useRef({ project, tool, activeId, pendingStart, pendingPoints, snapStep, run, elevation });
  ctx.current = { project, tool, activeId, pendingStart, pendingPoints, snapStep, run, elevation };

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new BimScene(containerRef.current, {
      onPlanClick: (point) => handlePlanClick(point),
      onPlanMove: (point) => {
        const t = ctx.current.tool;
        if (t === "wall" || t === "floor" || t === "room") {
          setCursor(snapToEndpoint(point));
        }
      },
      onPick: (picked) => {
        if (ctx.current.tool === "select") setSelection(picked);
      },
    });
    sceneRef.current = scene;

    // Test hook, available in development builds only: lets end-to-end tests read the model and locate points on screen.
    if (import.meta.env.DEV) {
      window.__revitWeb = {
        project: () => ctx.current.project,
        screenOf: (p) => scene.planToScreen(p),
        meshCount: () => scene.meshCount(),
        wallColor: (wallId) => scene.wallColor(wallId),
        view: () => (ctx.current.elevation ? "elevation" : scene.currentView()),
      };
    }
    return () => {
      scene.dispose();
      sceneRef.current = null;
      if (import.meta.env.DEV) delete window.__revitWeb;
    };
    // The handlers above use ctx and stable setters, so the scene is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sceneRef.current?.setProject(project), [project]);
  useEffect(() => sceneRef.current?.setActiveLevel(activeId), [activeId, project]);
  useEffect(() => sceneRef.current?.setSelection(selection), [selection]);
  useEffect(() => sceneRef.current?.setTool(tool), [tool]);
  useEffect(() => sceneRef.current?.setView(view), [view]);
  useEffect(() => sceneRef.current?.setSnapStep(snapStep), [snapStep]);
  useEffect(() => sceneRef.current?.setVisualStyle(visualStyle), [visualStyle]);
  useEffect(() => sceneRef.current?.setShadows(shadows), [shadows]);
  useEffect(() => sceneRef.current?.setAnnotationScale(scale), [scale]);
  useEffect(() => sceneRef.current?.setDetailLevel(detail), [detail]);
  useEffect(() => {
    if (tool === "wall") {
      sceneRef.current?.setPreview(pendingStart, cursor);
      sceneRef.current?.setPolygonPreview(null, null);
    } else if (isBoundaryTool(tool)) {
      sceneRef.current?.setPreview(null, null);
      sceneRef.current?.setPolygonPreview(pendingPoints, cursor);
    } else {
      sceneRef.current?.setPreview(null, null);
      sceneRef.current?.setPolygonPreview(null, null);
    }
  }, [pendingStart, pendingPoints, cursor, tool]);

  // Autosave after edits settle, so that a reload recovers the latest model.
  useEffect(() => {
    const storage = getStorage();
    if (!storage) return;
    const handle = window.setTimeout(() => {
      try {
        writeAutosave(storage, project);
      } catch {
        say("Autosave failed. Save the project to keep your work.", "error");
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [project]);

  // Contextual ribbon follows the selection, like a professional BIM workspace.
  useEffect(() => {
    if (selection) setContextualActive(true);
    else setContextualActive(false);
  }, [selection]);

  // View tabs: keep the tab list in sync with the level the user is working on.
  useEffect(() => {
    if (view !== "plan") return;
    const id = planTabId(activeId);
    const level = levelById(project, activeId);
    setOpenViews((tabs) =>
      tabs.some((t) => t.id === id)
        ? tabs.map((t) => (t.id === id ? { ...t, title: level?.name ?? t.title } : t))
        : [...tabs, { id, kind: "plan", levelId: activeId, title: level?.name ?? "Plan" }],
    );
    // Renames flow through the same path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, project.levels]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setLauncherOpen((v) => !v);
        return;
      }
      if (mod && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        handleSave();
        return;
      }
      if (target.closest("input, textarea, select")) return;
      if (mod && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        undo();
      } else if (mod && (event.key === "y" || event.key === "Y" || (event.shiftKey && (event.key === "z" || event.key === "Z")))) {
        event.preventDefault();
        redo();
      } else if (mod) {
        return;
      } else if (event.key === "F1" || event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (ctx.current.elevation && event.key !== "Escape") {
        // Elevations are read-only generated views: modelling shortcuts do not apply.
        return;
      } else if (event.key === "Escape") {
        if (ctx.current.pendingStart || ctx.current.pendingPoints.length > 0) {
          setPendingStart(null);
          setPendingPoints([]);
          say("Drawing cancelled.");
        } else {
          changeTool("select");
          setSelection(null);
        }
      } else if (event.key === "Enter" && isBoundaryTool(ctx.current.tool)) {
        event.preventDefault();
        closePolygon();
      } else if (event.key === "w" || event.key === "W") changeTool("wall");
      else if (event.key === "d" || event.key === "D") changeTool("door");
      else if (event.key === "n" || event.key === "N") changeTool("window");
      else if (event.key === "f" || event.key === "F") changeTool("floor");
      else if (event.key === "r" || event.key === "R") changeTool("room");
      else if (event.key === "c" || event.key === "C") changeTool("column");
      else if (event.key === "e" || event.key === "E") changeTool("ceiling");
      else if (event.key === "o" || event.key === "O") changeTool("roof");
      else if (event.key === "s" || event.key === "S") changeTool("select");
      else if (event.key === "Delete" || event.key === "Backspace") deleteSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function changeTool(next: Tool) {
    setTool(next);
    setPendingStart(null);
    setPendingPoints([]);
    setCursor(null);
  }

  function undo() {
    if (!canUndo(hist)) return say("Nothing to undo.");
    const label = hist.past[hist.past.length - 1].label;
    setPendingStart(null);
    dispatchHist({ type: "undo" });
    say(`Undid: ${label}.`);
  }

  function redo() {
    if (!canRedo(hist)) return say("Nothing to redo.");
    const label = hist.future[0].label;
    setPendingStart(null);
    dispatchHist({ type: "redo" });
    say(`Redid: ${label}.`);
  }

  function snapToEndpoint(point: Point): Point {
    const c = ctx.current;
    return nearestWallEndpoint(c.project, c.activeId, point, JOIN_SNAP_RADIUS_MM) ?? point;
  }

  function handlePlanClick(point: Point) {
    const c = ctx.current;
    if (c.tool === "wall") {
      const start = c.pendingStart;
      const at = snapToEndpoint(point);
      if (!start) {
        setPendingStart(at);
        say("Click the next point. Esc finishes the chain.");
        return;
      }
      if (c.run("Add wall", (p) => addWall(p, c.activeId, start, at, { wallTypeId: p.wallTypes[0]?.id }).project)) {
        setPendingStart(at);
        setSelection(null);
        say("Wall added. Keep clicking to chain walls, or press Esc to finish.");
      }
      return;
    }
    if (isBoundaryTool(c.tool)) {
      const at = snapToEndpoint(point);
      const pts = c.pendingPoints;
      // Clicking the first point closes the boundary.
      if (pts.length >= 3 && pointsEqual(at, pts[0])) {
        closePolygon(pts);
        return;
      }
      if (pts.length >= 1 && pointsEqual(at, pts[pts.length - 1])) return;
      setPendingPoints([...pts, at]);
      if (pts.length === 0) say("Click the boundary points. Click the first point or press Enter to close; Esc cancels.");
      return;
    }
    if (c.tool === "column") {
      const at = snapToEndpoint(point);
      let created: string | null = null;
      const ok = c.run(
        "Add column",
        (p) => {
          const typeId = p.columnTypes[0]?.id;
          if (!typeId) throw new Error("Create a column type before adding columns.");
          const result = addColumn(p, c.activeId, typeId, at);
          created = result.column.id;
          return result.project;
        },
        "Column placed. Select it to edit its height and type.",
      );
      if (ok && created) setSelection({ kind: "column", id: created });
      return;
    }
    if (c.tool === "door" || c.tool === "window") {
      const kind = c.tool;
      const nearest = nearestWallOnLevel(c.project, c.activeId, point, HOST_PICK_DISTANCE_MM);
      if (!nearest) {
        say(`Click closer to a wall on ${levelById(c.project, c.activeId)?.name ?? "this level"} to place a ${kind}.`, "error");
        return;
      }
      const type = c.project.openingTypes.find((t) => t.kind === kind);
      if (!type) return say(`No ${kind} type is available.`, "error");
      const offset = snapValue(nearest.offset, c.snapStep);
      let created: string | null = null;
      const ok = c.run(
        `Add ${kind}`,
        (p) => {
          const result = addOpening(p, nearest.wall.id, type.id, offset);
          created = result.opening.id;
          return result.project;
        },
        `${kind === "door" ? "Door" : "Window"} placed. Select it to edit its offset.`,
      );
      if (ok && created) setSelection({ kind: "opening", id: created });
    }
  }

  /** Closes the pending boundary polygon into a floor or room. */
  function closePolygon(explicit?: Point[]) {
    const c = ctx.current;
    const pts = explicit ?? c.pendingPoints;
    if (pts.length < 3) {
      say("A boundary needs at least three points.", "error");
      return;
    }
    if (c.tool === "floor") {
      let created: string | null = null;
      const ok = c.run(
        "Add floor",
        (p) => {
          const typeId = p.floorTypes[0]?.id;
          if (!typeId) throw new Error("Create a floor type before adding floors.");
          const result = addFloor(p, c.activeId, typeId, pts);
          created = result.floor.id;
          return result.project;
        },
        "Floor added. Select it to change its type or level.",
      );
      if (ok && created) {
        setPendingPoints([]);
        setSelection({ kind: "floor", id: created });
      }
      return;
    }
    if (c.tool === "room") {
      let created: string | null = null;
      const ok = c.run(
        "Add room",
        (p) => {
          const result = addRoom(p, c.activeId, `Room ${p.rooms.length + 1}`, String(p.rooms.length + 1), pts);
          created = result.room.id;
          return result.project;
        },
        "Room added. Select it to rename it and edit its number.",
      );
      if (ok && created) {
        setPendingPoints([]);
        setSelection({ kind: "room", id: created });
      }
      return;
    }
    if (c.tool === "ceiling") {
      let created: string | null = null;
      const ok = c.run(
        "Add ceiling",
        (p) => {
          const typeId = p.ceilingTypes[0]?.id;
          if (!typeId) throw new Error("Create a ceiling type before adding ceilings.");
          const result = addCeiling(p, c.activeId, typeId, pts);
          created = result.ceiling.id;
          return result.project;
        },
        "Ceiling added. Select it to change its height or type.",
      );
      if (ok && created) {
        setPendingPoints([]);
        setSelection({ kind: "ceiling", id: created });
      }
      return;
    }
    if (c.tool === "roof") {
      let created: string | null = null;
      const ok = c.run(
        "Add roof",
        (p) => {
          const typeId = p.roofTypes[0]?.id;
          if (!typeId) throw new Error("Create a roof type before adding roofs.");
          const result = addRoof(p, c.activeId, typeId, pts);
          created = result.roof.id;
          return result.project;
        },
        "Roof added (rectangular hip roof). Select it to change its overhang or rise.",
      );
      if (ok && created) {
        setPendingPoints([]);
        setSelection({ kind: "roof", id: created });
      }
    }
  }

  function deleteSelection() {
    if (!selection) return;
    if (selection.kind === "wall") {
      if (run("Delete wall", (p) => deleteWall(p, selection.id), "Wall deleted (its doors and windows too).")) setSelection(null);
    } else if (selection.kind === "opening") {
      if (run("Delete opening", (p) => deleteOpening(p, selection.id), "Door or window deleted.")) setSelection(null);
    } else if (selection.kind === "floor") {
      if (run("Delete floor", (p) => deleteFloor(p, selection.id), "Floor deleted.")) setSelection(null);
    } else if (selection.kind === "room") {
      if (run("Delete room", (p) => deleteRoom(p, selection.id), "Room deleted.")) setSelection(null);
    } else if (selection.kind === "column") {
      if (run("Delete column", (p) => deleteColumn(p, selection.id), "Column deleted.")) setSelection(null);
    } else if (selection.kind === "ceiling") {
      if (run("Delete ceiling", (p) => deleteCeiling(p, selection.id), "Ceiling deleted.")) setSelection(null);
    } else if (selection.kind === "roof") {
      if (run("Delete roof", (p) => deleteRoof(p, selection.id), "Roof deleted.")) setSelection(null);
    }
  }

  function handleAddLevel(name: string, elevation: number) {
    if (!name.trim()) return say("Enter a level name first.", "error");
    let created: string | null = null;
    const ok = run(
      "Add level",
      (p) => {
        const result = addLevel(p, name, elevation);
        created = result.level.id;
        return result.project;
      },
      `Added ${name.trim()}.`,
    );
    if (ok && created) setActiveLevelId(created);
  }

  function handleOpen(file: File) {
    file
      .text()
      .then((text) => {
        const loaded = parseProject(text);
        dispatchHist({ type: "reset", project: loaded });
        setActiveLevelId(loaded.levels[0].id);
        setSelection(null);
        setPendingStart(null);
        setPendingPoints([]);
        setElevation(null);
    setOpenViews([
          { id: planTabId(loaded.levels[0].id), kind: "plan", levelId: loaded.levels[0].id, title: loaded.levels[0].name },
          THREED_TAB,
        ]);
        say(`Opened ${file.name}.`);
      })
      .catch((error: unknown) => say(error instanceof Error ? error.message : "Could not open file.", "error"))
      .finally(() => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      });
  }

  function handleSave() {
    try {
      const text = serializeProject(project);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = project.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "project";
      link.href = url;
      link.download = `${safeName}.revit-web.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(`Saved ${link.download}.`);
    } catch (error) {
      say(error instanceof Error ? error.message : "Could not save.", "error");
    }
  }

  function handleNew() {
    if (project.walls.length > 0 && !window.confirm("Discard the current project and start a new one?")) return;
    const next = createProject("Untitled project");
    dispatchHist({ type: "reset", project: next });
    setActiveLevelId(next.levels[0].id);
    setSelection(null);
    setPendingStart(null);
    setPendingPoints([]);
    setElevation(null);
    setOpenViews([
      { id: planTabId(next.levels[0].id), kind: "plan", levelId: next.levels[0].id, title: next.levels[0].name },
      THREED_TAB,
    ]);
    say("Started a new project.");
  }

  // ---------------------------------------------------------------------------
  // View tabs and the command registry
  // ---------------------------------------------------------------------------

  const activeTabId = elevation ? elevTabId(elevation) : view === "3d" ? THREED_TAB.id : planTabId(activeId);

  function switchToTab(tab: ViewTab) {
    if (tab.kind === "plan" && tab.levelId) {
      setElevation(null);
      setView("plan");
      setActiveLevelId(tab.levelId);
      setOpenViews((tabs) => (tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]));
    } else if (tab.kind === "elevation" && tab.direction) {
      setElevation(tab.direction);
      setOpenViews((tabs) => (tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab]));
    } else {
      setElevation(null);
      setView("3d");
      setOpenViews((tabs) => (tabs.some((t) => t.id === THREED_TAB.id) ? tabs : [...tabs, THREED_TAB]));
    }
    setPendingStart(null);
    setPendingPoints([]);
  }

  function closeTab(id: string) {
    setOpenViews((tabs) => {
      const remaining = tabs.filter((t) => t.id !== id);
      const list = remaining.length > 0 ? remaining : [THREED_TAB];
      const wasActive = activeTabId === id;
      if (wasActive) {
        const next = list[0];
        // Defer so we never setState during render of the updater.
        queueMicrotask(() => switchToTab(next));
      }
      return list;
    });
  }

  const kindLabel =
    selection === null
      ? ""
      : { wall: "Wall", opening: "Opening", floor: "Floor", room: "Room", column: "Column", ceiling: "Ceiling", roof: "Roof" }[selection.kind];

  function stub(id: string, title: string, description: string, tab: RibbonTabId | null, group: CommandSpec["group"]): CommandSpec {
    return { id, title, description, tab, group, implemented: false, run: () => undefined };
  }

  const commands: CommandSpec[] = [
    { id: "file.new", title: "New", description: "Start a new project.", tab: null, group: "file", shortcut: "Ctrl+N", implemented: true, run: handleNew },
    { id: "file.open", title: "Open…", description: "Open a project file.", tab: null, group: "file", shortcut: "Ctrl+O", implemented: true, run: () => fileInputRef.current?.click() },
    { id: "file.save", title: "Save", description: "Save the project to a file.", tab: null, group: "file", shortcut: "Ctrl+S", implemented: true, run: handleSave },
    { id: "edit.undo", title: "Undo", description: "Undo the last change.", tab: null, group: "edit", shortcut: "Ctrl+Z", implemented: true, run: undo, enabled: () => canUndo(hist) },
    { id: "edit.redo", title: "Redo", description: "Redo the last undone change.", tab: null, group: "edit", shortcut: "Ctrl+Shift+Z", implemented: true, run: redo, enabled: () => canRedo(hist) },
    { id: "edit.delete", title: "Delete", description: "Delete the selected element.", tab: null, group: "edit", shortcut: "Delete", implemented: true, run: deleteSelection, enabled: () => selection !== null },
    { id: "search.launcher", title: "Search commands", description: "Open the searchable command launcher.", tab: null, group: "help", shortcut: "Ctrl+K", implemented: true, run: () => setLauncherOpen(true) },
    { id: "help.shortcuts", title: "Keyboard shortcuts", description: "Show the shortcut map.", tab: null, group: "help", shortcut: "F1", implemented: true, run: () => setShortcutsOpen(true) },
    ...toolCommands(),
    {
      id: "level.add",
      title: "Level",
      description: "Add a new level above the highest one, named automatically; rename it in the browser or levels panel.",
      tab: "architecture",
      group: "datum",
      implemented: true,
      run: () => {
        const top = project.levels[project.levels.length - 1];
        handleAddLevel(`Level ${project.levels.length + 1}`, (top?.elevation ?? 0) + 3000);
      },
    },
    ...viewCommands(),
    {
      id: "view.zoomTo",
      title: "Zoom to selection",
      description: "Centre the view on the selected element.",
      tab: null,
      group: "view",
      implemented: true,
      run: () => {
        if (!selection) return;
        const point = selectionPoint(project, selection);
        if (point) sceneRef.current?.focusPlanPoint(point);
      },
      enabled: () => selection !== null,
    },
    stub("tool.stair", "Stair", "Stair runs and landings.", "architecture", "circulation"),
    stub("tool.railing", "Railing", "Railings on stairs and edges.", "architecture", "circulation"),
    stub("tool.ramp", "Ramp", "Ramped elements.", "architecture", "circulation"),
    stub("annotate.roomTag", "Room Tag", "Tag rooms with name, number and area.", "architecture", "room"),
    stub("struct.foundation", "Foundation", "Isolated and wall foundations.", "structure", "structure"),
    stub("struct.retainingWall", "Retaining Wall", "Retaining walls.", "structure", "structure"),
    stub("struct.beam", "Beam", "Structural framing beams.", "structure", "structure"),
    stub("struct.brace", "Brace", "Structural bracing.", "structure", "structure"),
    stub("struct.structuralFloor", "Structural Floor", "Structural floor decks.", "structure", "structure"),
    stub("struct.rebar", "Rebar", "Reinforcement and bar schedules.", "structure", "structure"),
    stub("steel.connection", "Connection", "Steel connections.", "steel", "steel"),
    stub("steel.fabrication", "Fabrication", "Fabrication elements.", "steel", "steel"),
    stub("steel.cope", "Cope", "Cope steel elements.", "steel", "steel"),
    stub("steel.split", "Split", "Split steel elements.", "steel", "steel"),
    stub("import.dxf", "Import DXF", "Import 2D DXF drawings (roadmap M4/M9).", "insert", "insert"),
    stub("import.ifc", "Link IFC", "Link or import IFC models (roadmap M9).", "insert", "insert"),
    stub("import.glb", "Import GLB", "Import lightweight GLB references (roadmap M10).", "insert", "insert"),
    stub("load.family", "Load Family", "Load reusable families into the project (roadmap M6).", "insert", "insert"),
    stub("annotate.alignedDim", "Aligned Dimension", "Aligned dimensions (roadmap M4).", "annotate", "annotate"),
    stub("annotate.angularDim", "Angular Dimension", "Angular dimensions (roadmap M4).", "annotate", "annotate"),
    stub("annotate.detailLine", "Detail Line", "Detail lines (roadmap M4).", "annotate", "annotate"),
    stub("annotate.text", "Text", "Text notes with leaders (roadmap M4).", "annotate", "annotate"),
    stub("annotate.tag", "Tag", "Element tags (roadmap M4).", "annotate", "annotate"),
    stub("view.section", "Section", "Building sections generated from the model (roadmap M4).", "annotate", "annotate"),
    stub("view.callout", "Callout", "Callout views (roadmap M4).", "annotate", "annotate"),
    stub("analyze.space", "Space", "MEP spaces (roadmap M8).", "analyze", "analyze"),
    stub("analyze.zone", "Zone", "Zones (roadmap M8).", "analyze", "analyze"),
    stub("analyze.heatingLoad", "Heating Load", "Heating load analysis (roadmap M8).", "analyze", "analyze"),
    stub("analyze.coolingLoad", "Cooling Load", "Cooling load analysis (roadmap M8).", "analyze", "analyze"),
    stub("mass.conceptual", "Conceptual Mass", "Conceptual massing (roadmap M6).", "massing", "massing"),
    stub("mass.wall", "Wall by Face", "Wall by face (roadmap M6).", "massing", "massing"),
    stub("mass.floor", "Floor by Face", "Floor by face (roadmap M6).", "massing", "massing"),
    stub("site.toposurface", "Toposurface", "Site and terrain (roadmap M6).", "massing", "massing"),
    stub("site.component", "Site Component", "Site components (roadmap M6).", "massing", "massing"),
    stub("collab.worksets", "Worksets", "Worksets and model ownership (roadmap M11).", "collaborate", "collaborate"),
    stub("collab.sync", "Synchronize", "Shared-model synchronization (roadmap M11).", "collaborate", "collaborate"),
    stub("collab.interferenceCheck", "Interference Check", "Clash detection (roadmap M9).", "collaborate", "collaborate"),
    stub("collab.publish", "Publish", "Publish to a common data environment (roadmap M11).", "collaborate", "collaborate"),
    stub("manage.projectUnits", "Project Units", "Project unit formats (roadmap M4).", "manage", "manage"),
    stub("manage.snaps", "Snaps", "Object snap settings (roadmap M5).", "manage", "manage"),
    stub("manage.materials", "Materials", "Material library with appearance and physical properties (roadmap M10).", "manage", "manage"),
    stub("manage.phases", "Phases", "Existing, demolished and new construction phases (roadmap M6).", "manage", "manage"),
    stub("addins.extensionManager", "Extension Manager", "Extension API and manager (roadmap M12).", "addins", "addins"),
  ];

  function toolCommands(): CommandSpec[] {
    const toolSpec = (id: string, t: Tool, title: string, description: string, shortcut: string, tab: RibbonTabId, group: CommandSpec["group"]): CommandSpec => ({
      id,
      title,
      description,
      tab,
      group,
      shortcut,
      implemented: true,
      run: () => changeTool(t),
      isActive: () => tool === t,
    });
    return [
      toolSpec("tool.select", "select", "Select", "Select elements to inspect and edit.", "S", "architecture", "tools"),
      toolSpec("tool.wall", "wall", "Wall", "Draw chained walls; ends snap to join.", "W", "architecture", "build"),
      toolSpec("tool.door", "door", "Door", "Place a door hosted in a wall.", "D", "architecture", "build"),
      toolSpec("tool.window", "window", "Window", "Place a window hosted in a wall.", "N", "architecture", "build"),
      toolSpec("tool.floor", "floor", "Floor", "Draw a floor boundary and close it.", "F", "architecture", "build"),
      toolSpec("tool.room", "room", "Room", "Draw a room boundary; area is computed from it.", "R", "architecture", "build"),
      toolSpec("tool.column", "column", "Column", "Place a rectangular column.", "C", "architecture", "build"),
      toolSpec("tool.ceiling", "ceiling", "Ceiling", "Draw a ceiling boundary and close it.", "E", "architecture", "build"),
      toolSpec("tool.roof", "roof", "Roof", "Draw a rectangular hip roof footprint with overhang.", "O", "architecture", "build"),
    ];
  }

  const switchView = (v: ViewMode) => {
    setElevation(null);
    setView(v);
  };

  function viewCommands(): CommandSpec[] {
    return [
      { id: "view.plan", title: "Floor Plan", description: "Open the plan of the active level.", tab: "view", group: "view", implemented: true, run: () => switchView("plan"), isActive: () => view === "plan" && !elevation },
      { id: "view.3d", title: "3D View", description: "Open the default 3D view.", tab: "view", group: "view", implemented: true, run: () => switchView("3d"), isActive: () => view === "3d" && !elevation },
      ...(["north", "south", "east", "west"] as const).map((d) => ({
        id: `view.elevation.${d}`,
        title: elevationTitle(d),
        description: `Generated ${d} elevation of the whole model.`,
        tab: "view" as const,
        group: "view" as const,
        implemented: true,
        run: () => switchToTab(elevationTab(d)),
        isActive: () => elevation === d,
      })),
      { id: "view.wireframe", title: "Wireframe", description: "Wireframe visual style.", tab: "view", group: "view", implemented: true, run: () => setVisualStyle("wireframe"), isActive: () => visualStyle === "wireframe" },
      { id: "view.hiddenLine", title: "Hidden Line", description: "Hidden-line visual style.", tab: "view", group: "view", implemented: true, run: () => setVisualStyle("hiddenLine"), isActive: () => visualStyle === "hiddenLine" },
      { id: "view.shaded", title: "Shaded", description: "Shaded visual style.", tab: "view", group: "view", implemented: true, run: () => setVisualStyle("shaded"), isActive: () => visualStyle === "shaded" },
      { id: "view.resetCamera", title: "Reset Camera", description: "Reset the camera of the active view.", tab: "view", group: "view", implemented: true, run: () => sceneRef.current?.resetCamera() },
      { id: "view.zoomFit", title: "Zoom to Fit", description: "Frame the default view extents.", tab: "view", group: "view", shortcut: "Home", implemented: true, run: () => sceneRef.current?.resetCamera() },
    ];
  }

  const commandById = new Map(commands.map((c) => [c.id, c]));

  const hint =
    elevation
      ? "Generated elevation — read-only. Switch to Plan or 3D to model."
      : tool === "wall"
      ? pendingStart
        ? "Click the next point to continue the wall. Esc finishes."
        : `Click a start point on ${activeLevel?.name ?? "the active level"}. Ends snap to existing walls.`
      : isBoundaryTool(tool)
        ? pendingPoints.length > 0
          ? `Boundary: ${pendingPoints.length} point(s). Click the first point or press Enter to close; Esc cancels.`
          : `Click to draw the ${tool} boundary on ${activeLevel?.name ?? "the active level"}.${
              tool === "roof" ? " Roofs need a rectangular footprint." : ""
            }`
        : tool === "column"
          ? `Click to place a column on ${activeLevel?.name ?? "the active level"}.`
          : tool === "door" || tool === "window"
            ? `Click near a wall on ${activeLevel?.name ?? "the active level"} to host a ${tool}.`
            : "Click an element to select it. Drag to pan (plan) or orbit (3D). Ctrl+K opens the command launcher.";

  return (
    <div className="app">
      <header className="qat">
        <div className="brand">revit-web</div>
        <div className="project-name">
          <RenameField
            label="Project name"
            value={project.name}
            onCommit={(name) => run("Rename project", (p) => ({ ...p, name }))}
          />
        </div>
        <div className="group" role="group" aria-label="Quick Access Toolbar">
          <button onClick={handleNew} title="New project (Ctrl+N)">
            New
          </button>
          <button onClick={() => fileInputRef.current?.click()} title="Open a project file (Ctrl+O)">
            Open…
          </button>
          <button onClick={handleSave} title="Save the project (Ctrl+S)">
            Save
          </button>
          <button onClick={undo} disabled={!canUndo(hist)} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button onClick={redo} disabled={!canRedo(hist)} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <button onClick={() => setLauncherOpen(true)} title="Search commands (Ctrl+K)">
            Search
          </button>
          <button onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (F1)">
            Help
          </button>
        </div>
        <div className="spacer" />
        <label className="snap">
          Snap
          <select value={snapStep} onChange={(e) => setSnapStep(Number(e.target.value))}>
            {SNAP_OPTIONS.map((step) => (
              <option key={step} value={step}>
                {step === 0 ? "Off" : `${step} mm`}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleOpen(file);
          }}
        />
      </header>

      <Ribbon
        tabs={RIBBON_TABS}
        commands={commandById}
        activeTab={ribbonTab}
        onTabChange={(id) => {
          setRibbonTab(id);
          setContextualActive(false);
        }}
        contextual={
          selection
            ? {
                title: `Modify | ${kindLabel}`,
                commandIds: ["edit.delete", "view.zoomTo"],
              }
            : null
        }
        contextualActive={contextualActive && selection !== null}
        onContextualActivate={() => setContextualActive(true)}
      />

      <ViewTabs
        tabs={openViews}
        activeId={activeTabId}
        onActivate={(id) => {
          const tab = openViews.find((t) => t.id === id);
          if (tab) switchToTab(tab);
        }}
        onClose={closeTab}
      />

      <div className="body">
        {!leftCollapsed ? (
          <aside className="panel left" style={{ width: leftWidth }}>
            <ProjectBrowser
              project={project}
              openViews={openViews}
              activeViewId={activeTabId}
              onOpenView={switchToTab}
            />
            <LevelsPanel
              project={project}
              activeLevelId={activeId}
              onSelect={(id) => {
                setActiveLevelId(id);
                setPendingStart(null);
              }}
              onAdd={handleAddLevel}
              onRename={(id, name) => run("Rename level", (p) => renameLevel(p, id, name))}
              onElevation={(id, mm) => run("Change level elevation", (p) => setLevelElevation(p, id, mm))}
              onDelete={(id) => {
                const level = levelById(project, id);
                if (!window.confirm(`Delete ${level?.name ?? "this level"} and every element on it?`)) return;
                if (run("Delete level", (p) => deleteLevel(p, id), `Deleted ${level?.name ?? "level"}.`)) {
                  setOpenViews((tabs) => tabs.filter((t) => t.id !== planTabId(id)));
                  if (id === activeId) {
                    setActiveLevelId(project.levels.find((l) => l.id !== id)?.id ?? activeId);
                  }
                }
              }}
            />
            <Splitter side="left" width={leftWidth} onWidth={setLeftWidth} />
            <button className="collapse-btn" title="Collapse panel" onClick={() => setLeftCollapsed(true)}>
              ‹
            </button>
          </aside>
        ) : (
          <button className="expand-btn" title="Expand Project Browser" onClick={() => setLeftCollapsed(false)}>
            › Browser
          </button>
        )}

        <main className="viewport">
          <div className="canvas-host" ref={containerRef} />
          {elevation ? <ElevationView project={project} direction={elevation} /> : null}
          <div className="hint">{hint}</div>
          {message && <div className={`status ${message.kind}`}>{message.text}</div>}
          <ViewControlBar
            view={view}
            onView={switchView}
            scale={scale}
            onScale={setScale}
            detail={detail}
            onDetail={setDetail}
            visualStyle={visualStyle}
            onVisualStyle={setVisualStyle}
            shadows={shadows}
            onShadows={setShadows}
          />
        </main>

        {!rightCollapsed ? (
          <aside className="panel right" style={{ width: rightWidth }}>
            <PropertiesPanel
              project={project}
              selection={selection}
              onWallPatch={(wallId: string, patch) => run("Edit wall", (p) => updateWall(p, wallId, patch))}
              onWallTypeThickness={(typeId, mm) => run("Edit wall type", (p) => updateWallType(p, typeId, { thickness: mm }))}
              onWallTypeMaterial={(typeId, materialId) => run("Edit wall type material", (p) => updateWallType(p, typeId, { materialId }))}
              onOpeningPatch={(openingId, patch) => run("Edit opening", (p) => updateOpening(p, openingId, patch))}
              onFloorPatch={(floorId, patch) => run("Edit floor", (p) => updateFloor(p, floorId, patch))}
              onRoomPatch={(roomId, patch) => run("Edit room", (p) => updateRoom(p, roomId, patch))}
              onColumnPatch={(columnId, patch) => run("Edit column", (p) => updateColumn(p, columnId, patch))}
              onCeilingPatch={(ceilingId, patch) => run("Edit ceiling", (p) => updateCeiling(p, ceilingId, patch))}
              onRoofPatch={(roofId, patch) => run("Edit roof", (p) => updateRoof(p, roofId, patch))}
              onSelectWall={(wallId) => setSelection({ kind: "wall", id: wallId })}
              onDeleteSelection={deleteSelection}
            />
            <Splitter side="right" width={rightWidth} onWidth={setRightWidth} />
            <button className="collapse-btn" title="Collapse panel" onClick={() => setRightCollapsed(true)}>
              ›
            </button>
          </aside>
        ) : (
          <button className="expand-btn" title="Expand Properties" onClick={() => setRightCollapsed(false)}>
            ‹ Properties
          </button>
        )}
      </div>

      <StatusBar
        selectionCount={selection ? 1 : 0}
        toolLabel={labelFor(tool)}
        snapStep={snapStep}
        scale={scale}
        projectName={project.name}
        revision={project.revision}
      />

      {launcherOpen && (
        <CommandLauncher commands={commands} onRun={(id) => commandById.get(id)?.run()} onClose={() => setLauncherOpen(false)} />
      )}
      {shortcutsOpen && (
        <ShortcutsDialog
          commands={commands}
          extra={[
            ["Esc", "Cancel the current drawing / back to Select"],
            ["Enter", "Close a floor or room boundary"],
            ["F/R/C", "Floor / Room / Column tools"],
            ["Ctrl+K", "Command launcher"],
          ]}
          onClose={() => setShortcutsOpen(false)}
        />
      )}
    </div>
  );
}

/** A draggable divider that resizes the docked panel next to it. */
function Splitter({ side, width, onWidth }: { side: "left" | "right"; width: number; onWidth(w: number): void }) {
  return (
    <div
      className={`splitter ${side}`}
      role="separator"
      aria-orientation="vertical"
      onMouseDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = width;
        const move = (ev: MouseEvent) => {
          const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
          onWidth(Math.min(480, Math.max(200, startWidth + delta)));
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }}
    />
  );
}

function validSelection(p: Project, selection: Selection): Selection {
  if (!selection) return null;
  const found =
    (selection.kind === "wall" && wallById(p, selection.id)) ||
    (selection.kind === "opening" && openingById(p, selection.id)) ||
    (selection.kind === "floor" && p.floors.some((f) => f.id === selection.id)) ||
    (selection.kind === "room" && p.rooms.some((r) => r.id === selection.id)) ||
    (selection.kind === "column" && p.columns.some((c) => c.id === selection.id)) ||
    (selection.kind === "ceiling" && p.ceilings.some((c) => c.id === selection.id)) ||
    (selection.kind === "roof" && p.roofs.some((r) => r.id === selection.id));
  return found ? selection : null;
}

function selectionPoint(p: Project, selection: Selection): Point | null {
  if (!selection) return null;
  if (selection.kind === "wall") {
    const wall = wallById(p, selection.id);
    return wall ? { x: Math.round((wall.start.x + wall.end.x) / 2), y: Math.round((wall.start.y + wall.end.y) / 2) } : null;
  }
  if (selection.kind === "opening") {
    const opening = openingById(p, selection.id);
    const wall = opening ? wallById(p, opening.hostWallId) : undefined;
    if (!opening || !wall) return null;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: Math.round(wall.start.x + (dx / len) * opening.offset),
      y: Math.round(wall.start.y + (dy / len) * opening.offset),
    };
  }
  if (selection.kind === "floor") {
    const floor = p.floors.find((f) => f.id === selection.id);
    return floor ? floor.boundary[0] : null;
  }
  if (selection.kind === "room") {
    const room = p.rooms.find((r) => r.id === selection.id);
    return room ? room.boundary[0] : null;
  }
  if (selection.kind === "ceiling") {
    const ceiling = p.ceilings.find((c) => c.id === selection.id);
    return ceiling ? ceiling.boundary[0] : null;
  }
  if (selection.kind === "roof") {
    const roof = p.roofs.find((r) => r.id === selection.id);
    return roof ? roof.boundary[0] : null;
  }
  const column = p.columns.find((c) => c.id === selection.id);
  return column ? column.position : null;
}

function labelFor(tool: Tool): string {
  return {
    select: "Select",
    wall: "Wall",
    door: "Door",
    window: "Window",
    floor: "Floor",
    room: "Room",
    column: "Column",
    ceiling: "Ceiling",
    roof: "Roof",
  }[tool];
}

/** Tools that draw a closed boundary polygon chain (floor, room, ceiling, roof). */
function isBoundaryTool(tool: Tool): boolean {
  return tool === "floor" || tool === "room" || tool === "ceiling" || tool === "roof";
}
