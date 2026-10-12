import { useEffect, useReducer, useRef, useState } from "react";
import { canRedo, canUndo, historyReducer, initialHistory } from "./app/history";
import {
  addColumn,
  addFloor,
  addLevel,
  addOpening,
  addRoom,
  addWall,
  deleteColumn,
  deleteFloor,
  deleteLevel,
  deleteOpening,
  deleteRoom,
  deleteWall,
  renameLevel,
  setLevelElevation,
  updateColumn,
  updateFloor,
  updateOpening,
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
import { BimScene, type Selection, type Tool, type ViewMode } from "./viewer/BimScene";

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

export function App() {
  const [initial] = useState(loadInitial);
  const [hist, dispatchHist] = useReducer(historyReducer, initial.project, initialHistory);
  const project = hist.present;

  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState<ViewMode>("plan");
  const [activeLevelId, setActiveLevelId] = useState<string>(project.levels[0].id);
  const [selectionState, setSelection] = useState<Selection>(null);
  const [pendingStart, setPendingStart] = useState<Point | null>(null);
  const [pendingPoints, setPendingPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snapStep, setSnapStep] = useState(100);
  const [message, setMessage] = useState<Message | null>(initial.message);

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
  const ctx = useRef({ project, tool, activeId, pendingStart, pendingPoints, snapStep, run });
  ctx.current = { project, tool, activeId, pendingStart, pendingPoints, snapStep, run };

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
        view: () => scene.currentView(),
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
  useEffect(() => {
    if (tool === "wall") {
      sceneRef.current?.setPreview(pendingStart, cursor);
      sceneRef.current?.setPolygonPreview(null, null);
    } else if (tool === "floor" || tool === "room") {
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

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        undo();
      } else if (mod && (event.key === "y" || event.key === "Y" || (event.shiftKey && (event.key === "z" || event.key === "Z")))) {
        event.preventDefault();
        redo();
      } else if (mod) {
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
      } else if (event.key === "Enter" && (ctx.current.tool === "floor" || ctx.current.tool === "room")) {
        event.preventDefault();
        closePolygon();
      } else if (event.key === "w" || event.key === "W") changeTool("wall");
      else if (event.key === "d" || event.key === "D") changeTool("door");
      else if (event.key === "n" || event.key === "N") changeTool("window");
      else if (event.key === "f" || event.key === "F") changeTool("floor");
      else if (event.key === "r" || event.key === "R") changeTool("room");
      else if (event.key === "c" || event.key === "C") changeTool("column");
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
    if (c.tool === "floor" || c.tool === "room") {
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
    say("Started a new project.");
  }

  const hint =
    tool === "wall"
      ? pendingStart
        ? "Click the next point to continue the wall. Esc finishes."
        : `Click a start point on ${activeLevel?.name ?? "the active level"}. Ends snap to existing walls.`
      : tool === "floor" || tool === "room"
        ? pendingPoints.length > 0
          ? `Boundary: ${pendingPoints.length} point(s). Click the first point or press Enter to close; Esc cancels.`
          : `Click to draw the ${tool} boundary on ${activeLevel?.name ?? "the active level"}.`
        : tool === "column"
          ? `Click to place a column on ${activeLevel?.name ?? "the active level"}.`
          : tool === "door" || tool === "window"
            ? `Click near a wall on ${activeLevel?.name ?? "the active level"} to host a ${tool}.`
            : "Click a wall, door, window, floor, room or column to select it. Drag to pan (plan) or orbit (3D).";

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">revit-web</div>
        <div className="project-name">
          <RenameField
            label="Project name"
            value={project.name}
            onCommit={(name) => run("Rename project", (p) => ({ ...p, name }))}
          />
        </div>
        <div className="group" role="group" aria-label="Tools">
          {(["select", "wall", "door", "window", "floor", "room", "column"] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? "active" : ""} onClick={() => changeTool(t)} title={shortcutFor(t)}>
              {labelFor(t)}
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label="View">
          <button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>
            Plan
          </button>
          <button className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>
            3D
          </button>
        </div>
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
        <div className="spacer" />
        <button onClick={undo} disabled={!canUndo(hist)} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo(hist)} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button onClick={handleNew}>New</button>
        <button onClick={() => fileInputRef.current?.click()}>Open…</button>
        <button onClick={handleSave}>Save</button>
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

      <div className="body">
        <aside className="panel left">
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
              if (!window.confirm(`Delete ${level?.name ?? "this level"} and every wall and opening on it?`)) return;
              if (run("Delete level", (p) => deleteLevel(p, id), `Deleted ${level?.name ?? "level"}.`) && id === activeId) {
                setActiveLevelId(project.levels.find((l) => l.id !== id)?.id ?? activeId);
              }
            }}
          />
        </aside>

        <main className="viewport">
          <div className="canvas-host" ref={containerRef} />
          <div className="hint">{hint}</div>
          {message && <div className={`status ${message.kind}`}>{message.text}</div>}
        </main>

        <aside className="panel right">
          <PropertiesPanel
            project={project}
            selection={selection}
            onWallPatch={(wallId: string, patch) => run("Edit wall", (p) => updateWall(p, wallId, patch))}
            onWallTypeThickness={(typeId, mm) => run("Edit wall type", (p) => updateWallType(p, typeId, { thickness: mm }))}
            onOpeningPatch={(openingId, patch) => run("Edit opening", (p) => updateOpening(p, openingId, patch))}
            onFloorPatch={(floorId, patch) => run("Edit floor", (p) => updateFloor(p, floorId, patch))}
            onRoomPatch={(roomId, patch) => run("Edit room", (p) => updateRoom(p, roomId, patch))}
            onColumnPatch={(columnId, patch) => run("Edit column", (p) => updateColumn(p, columnId, patch))}
            onSelectWall={(wallId) => setSelection({ kind: "wall", id: wallId })}
            onDeleteSelection={deleteSelection}
          />
        </aside>
      </div>
    </div>
  );
}

function validSelection(p: Project, selection: Selection): Selection {
  if (!selection) return null;
  const found =
    (selection.kind === "wall" && wallById(p, selection.id)) ||
    (selection.kind === "opening" && openingById(p, selection.id)) ||
    (selection.kind === "floor" && p.floors.some((f) => f.id === selection.id)) ||
    (selection.kind === "room" && p.rooms.some((r) => r.id === selection.id)) ||
    (selection.kind === "column" && p.columns.some((c) => c.id === selection.id));
  return found ? selection : null;
}

function labelFor(tool: Tool): string {
  return { select: "Select", wall: "Wall", door: "Door", window: "Window", floor: "Floor", room: "Room", column: "Column" }[tool];
}

function shortcutFor(tool: Tool): string {
  return {
    select: "Select (S)",
    wall: "Wall (W)",
    door: "Door (D)",
    window: "Window (N)",
    floor: "Floor (F)",
    room: "Room (R)",
    column: "Column (C)",
  }[tool];
}
