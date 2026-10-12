import { useEffect, useMemo, useRef, useState } from "react";
import { NumberField } from "./ui/NumberField";
import { RenameField } from "./ui/RenameField";
import { BimScene, type ToolMode } from "./viewer/BimScene";
import { distance } from "./model/geometry";
import {
  addLevel,
  addWall,
  createProject,
  levelById,
  parseProject,
  removeLevel,
  removeWall,
  renameLevel,
  serializeProject,
  updateWall,
  wallsOnLevel,
} from "./model/project";
import type { Project, Vec2 } from "./model/types";

const SNAP_OPTIONS = [0, 0.1, 0.5, 1];

export function App() {
  const [project, setProject] = useState<Project>(() => createProject("Untitled project"));
  const [tool, setTool] = useState<ToolMode>("select");
  const [activeLevelId, setActiveLevelId] = useState<string | null>(project.levels[0]?.id ?? null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<Vec2 | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [snapStep, setSnapStep] = useState(0.1);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [newLevelName, setNewLevelName] = useState("");
  const [newLevelElevation, setNewLevelElevation] = useState(3);

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BimScene | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Latest state for scene callbacks, which are created once and must not go stale.
  const latest = useRef({ project, tool, activeLevelId, pendingStart });
  latest.current = { project, tool, activeLevelId, pendingStart };

  const selectedWall = useMemo(
    () => project.walls.find((w) => w.id === selectedWallId) ?? null,
    [project.walls, selectedWallId],
  );
  const activeLevel = activeLevelId ? levelById(project, activeLevelId) ?? null : null;

  const say = (text: string, kind: "info" | "error" = "info") => setMessage({ kind, text });

  // Create the scene once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new BimScene(container, {
      onPlanClick: (point) => {
        const { project: p, tool: t, activeLevelId: lvl, pendingStart: start } = latest.current;
        if (t !== "wall" || !lvl) return;
        if (!start) {
          setPendingStart(point);
          say("Click the end point of the wall. Esc cancels.");
          return;
        }
        if (distance(start, point) < 0.05) {
          say("Wall is too short. Click a point further away.", "error");
          return;
        }
        try {
          const result = addWall(p, lvl, start, point);
          setProject(result.project);
          setSelectedWallId(null);
          // Chain walls like Revit: the end point becomes the next start.
          setPendingStart(point);
          say("Wall added. Keep clicking to chain walls, or press Esc to finish.");
        } catch (error) {
          say(error instanceof Error ? error.message : "Could not add wall.", "error");
        }
      },
      onPlanMove: (point) => setCursor(point),
      onWallPick: (wallId) => {
        if (latest.current.tool !== "select") return;
        setSelectedWallId(wallId);
      },
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setProject(project);
  }, [project]);

  useEffect(() => {
    sceneRef.current?.setActiveLevel(activeLevelId);
  }, [activeLevelId, project]);

  useEffect(() => {
    sceneRef.current?.setSelectedWall(selectedWall?.id ?? null);
  }, [selectedWall]);

  useEffect(() => {
    sceneRef.current?.setSnapStep(snapStep);
  }, [snapStep]);

  useEffect(() => {
    sceneRef.current?.setMode(tool);
    setPendingStart(null);
    setCursor(null);
  }, [tool]);

  useEffect(() => {
    sceneRef.current?.setPreview(pendingStart, cursor);
  }, [pendingStart, cursor]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if (event.key === "Escape") {
        if (latest.current.pendingStart) {
          setPendingStart(null);
          say("Wall chain finished.");
        } else {
          setTool("select");
        }
      } else if (event.key === "w" || event.key === "W") {
        setTool("wall");
      } else if (event.key === "s" || event.key === "S") {
        setTool("select");
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedWallId) deleteSelectedWall();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedWallId]);

  function deleteSelectedWall() {
    if (!selectedWallId) return;
    setProject((p) => removeWall(p, selectedWallId));
    setSelectedWallId(null);
    say("Wall deleted.");
  }

  function handleAddLevel() {
    try {
      const result = addLevel(project, newLevelName, newLevelElevation);
      setProject(result.project);
      setActiveLevelId(result.level.id);
      setNewLevelName("");
      say(`Added ${result.level.name}.`);
    } catch (error) {
      say(error instanceof Error ? error.message : "Could not add level.", "error");
    }
  }

  function handleDeleteLevel(levelId: string) {
    const level = levelById(project, levelId);
    if (!level) return;
    const count = wallsOnLevel(project, levelId).length;
    const warning = count > 0 ? ` and its ${count} wall(s)` : "";
    if (!window.confirm(`Delete ${level.name}${warning}?`)) return;
    try {
      const next = removeLevel(project, levelId);
      setProject(next);
      if (activeLevelId === levelId) setActiveLevelId(next.levels[0].id);
      say(`Deleted ${level.name}.`);
    } catch (error) {
      say(error instanceof Error ? error.message : "Could not delete level.", "error");
    }
  }

  function handleNew() {
    if (project.walls.length > 0 && !window.confirm("Discard the current project and start a new one?")) {
      return;
    }
    const next = createProject("Untitled project");
    setProject(next);
    setActiveLevelId(next.levels[0].id);
    setSelectedWallId(null);
    say("Started a new project.");
  }

  function handleSave() {
    const blob = new Blob([serializeProject(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = project.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "project";
    link.href = url;
    link.download = `${safeName}.revit-web.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(`Saved ${link.download}.`);
  }

  async function handleOpen(file: File) {
    try {
      const loaded = parseProject(await file.text());
      setProject(loaded);
      setActiveLevelId(loaded.levels[0].id);
      setSelectedWallId(null);
      say(`Opened ${file.name}.`);
    } catch (error) {
      say(error instanceof Error ? error.message : "Could not open file.", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const hint =
    tool === "wall"
      ? pendingStart
        ? "Click the next point to continue the wall. Esc finishes."
        : `Click a start point on ${activeLevel?.name ?? "the active level"}.`
      : "Click a wall to select it. Drag to orbit, scroll to zoom.";

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">revit-web</div>
        <input
          className="project-name"
          aria-label="Project name"
          value={project.name}
          onChange={(e) => setProject({ ...project, name: e.target.value })}
        />
        <div className="group" role="group" aria-label="Tools">
          <button className={tool === "select" ? "active" : ""} onClick={() => setTool("select")} title="Select (S)">
            Select
          </button>
          <button className={tool === "wall" ? "active" : ""} onClick={() => setTool("wall")} title="Wall (W)">
            Wall
          </button>
        </div>
        <label className="snap">
          Snap
          <select value={snapStep} onChange={(e) => setSnapStep(Number(e.target.value))}>
            {SNAP_OPTIONS.map((step) => (
              <option key={step} value={step}>
                {step === 0 ? "Off" : `${step} m`}
              </option>
            ))}
          </select>
        </label>
        <div className="spacer" />
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
            if (file) void handleOpen(file);
          }}
        />
      </header>

      <div className="body">
        <aside className="panel left">
          <h2>Levels</h2>
          <ul className="levels">
            {project.levels.map((level) => (
              <li key={level.id} className={level.id === activeLevelId ? "active" : ""}>
                <button className="level-select" onClick={() => setActiveLevelId(level.id)}>
                  <span className="level-name">{level.name}</span>
                  <span className="muted">
                    {level.elevation.toFixed(2)} m · {wallsOnLevel(project, level.id).length} walls
                  </span>
                </button>
                <div className="level-actions">
                  <RenameField
                    label={`Rename ${level.name}`}
                    value={level.name}
                    onCommit={(name) => {
                      try {
                        setProject(renameLevel(project, level.id, name));
                      } catch (error) {
                        say(error instanceof Error ? error.message : "Could not rename level.", "error");
                      }
                    }}
                  />
                  <button
                    className="danger"
                    disabled={project.levels.length <= 1}
                    onClick={() => handleDeleteLevel(level.id)}
                    title="Delete level"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <h3>Add level</h3>
          <div className="add-level">
            <input
              aria-label="New level name"
              placeholder="Name"
              value={newLevelName}
              onChange={(e) => setNewLevelName(e.target.value)}
            />
            <NumberField label="Elevation (m)" value={newLevelElevation} onCommit={setNewLevelElevation} />
            <button onClick={handleAddLevel}>Add level</button>
          </div>
        </aside>

        <main className="viewport">
          <div className="canvas-host" ref={containerRef} />
          <div className="hint">{hint}</div>
          {message && <div className={`status ${message.kind}`}>{message.text}</div>}
        </main>

        <aside className="panel right">
          <h2>Properties</h2>
          {selectedWall ? (
            <div className="props">
              <p className="muted">Wall · {levelById(project, selectedWall.levelId)?.name}</p>
              <label className="field">
                <span>Level</span>
                <select
                  value={selectedWall.levelId}
                  onChange={(e) => setProject(updateWall(project, selectedWall.id, { levelId: e.target.value }))}
                >
                  {project.levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Height (m)"
                value={selectedWall.height}
                min={0.01}
                onCommit={(v) => applyWallPatch({ height: v })}
              />
              <NumberField
                label="Thickness (m)"
                value={selectedWall.thickness}
                min={0.01}
                onCommit={(v) => applyWallPatch({ thickness: v })}
              />
              <fieldset>
                <legend>Start (m)</legend>
                <NumberField
                  label="X"
                  value={selectedWall.start.x}
                  onCommit={(v) => applyWallPatch({ start: { ...selectedWall.start, x: v } })}
                />
                <NumberField
                  label="Y"
                  value={selectedWall.start.y}
                  onCommit={(v) => applyWallPatch({ start: { ...selectedWall.start, y: v } })}
                />
              </fieldset>
              <fieldset>
                <legend>End (m)</legend>
                <NumberField
                  label="X"
                  value={selectedWall.end.x}
                  onCommit={(v) => applyWallPatch({ end: { ...selectedWall.end, x: v } })}
                />
                <NumberField
                  label="Y"
                  value={selectedWall.end.y}
                  onCommit={(v) => applyWallPatch({ end: { ...selectedWall.end, y: v } })}
                />
              </fieldset>
              <p className="muted">Length: {distance(selectedWall.start, selectedWall.end).toFixed(2)} m</p>
              <button className="danger wide" onClick={deleteSelectedWall}>
                Delete wall
              </button>
            </div>
          ) : (
            <div className="props">
              <p className="muted">Select a wall to edit its properties.</p>
              <dl className="stats">
                <dt>Levels</dt>
                <dd>{project.levels.length}</dd>
                <dt>Walls</dt>
                <dd>{project.walls.length}</dd>
                <dt>Active level</dt>
                <dd>{activeLevel?.name ?? "—"}</dd>
              </dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  );

  function applyWallPatch(patch: Parameters<typeof updateWall>[2]) {
    if (!selectedWall) return;
    try {
      setProject(updateWall(project, selectedWall.id, patch));
    } catch (error) {
      say(error instanceof Error ? error.message : "Invalid value.", "error");
    }
  }
}
