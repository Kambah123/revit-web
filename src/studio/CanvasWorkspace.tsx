import { dimensionLabel } from "../geometry/dimensions";
import { useEffect, useState, type ReactNode } from "react";
import type { Project } from "../model/types";
import type {
  Selection,
  Tool,
  ViewMode,
  VisualStyle,
} from "../viewer/BimScene";
import type { CommandSpec } from "../app/ribbon";
import { Icon } from "./Icon";
import { Dialog } from "./Dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "../components/ui/tooltip";
import { RenameField } from "../ui/RenameField";
import { NumberField } from "../ui/NumberField";

interface Props {
  project: Project;
  tool: Tool;
  view: ViewMode;
  activeLevelId: string;
  selection: Selection;
  commands: Map<string, CommandSpec>;
  children: ReactNode;
  properties: ReactNode;
  levels: ReactNode;
  aiPanel: ReactNode;
  hint: string;
  message: { text: string; kind: string } | null;
  saveState: string;
  storageError?: string;
  snap: number;
  grid: boolean;
  visualStyle: VisualStyle;
  shadows: boolean;
  wallTypeId: string;
  openingTypeId: string;
  wallHeight: number;
  onWallType(id: string): void;
  onOpeningType(id: string): void;
  onWallHeight(mm: number): void;
  onTool(tool: Tool): void;
  onView(view: ViewMode): void;
  onLevel(id: string): void;
  onSelect(s: Selection): void;
  onRename(name: string): void;
  onExit(): void;
  onSnap(n: number): void;
  onGrid(b: boolean): void;
  onStyle(s: VisualStyle): void;
  onShadows(b: boolean): void;
  onFit(): void;
  onZoom(factor: number): void;
  onDismissMessage(): void;
  onMaterial(id: string): void;
}
const tools: [Tool, string, string][] = [
  ["select", "Select", "S"],
  ["wall", "Wall", "W"],
  ["dimension", "Dimension", "M"],
  ["door", "Door", "D"],
  ["window", "Window", "N"],
  ["floor", "Floor", "F"],
  ["room", "Room", "R"],
  ["column", "Column", "C"],
  ["ceiling", "Ceiling", "E"],
  ["roof", "Roof", "O"],
];
export function CanvasWorkspace(p: Props) {
  const [tab, setTab] = useState<"layers" | "assets">("layers");
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState(false);
  const [modal, setModal] = useState<"levels" | "export" | null>(null);
  const [category, setCategory] = useState("Walls");
  const [libraryNotice, setLibraryNotice] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const visualize = p.view === "3d";
  useEffect(() => {
    setDismissed(false);
  }, [p.tool]);
  const command = (id: string) => {
    const c = p.commands.get(id);
    if (c?.implemented && (c.enabled?.() ?? true)) c.run();
  };
  const commandButton = (id: string, icon: string, label: string) => {
    const c = p.commands.get(id);
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="icon-button"
        aria-label={label}
        title={`${label}${c?.shortcut ? ` (${c.shortcut})` : ""}`}
        disabled={!c?.implemented || !(c.enabled?.() ?? true)}
        onClick={() => command(id)}
      >
        <Icon name={icon} />
      </Button>
    );
  };
  const levelName = p.project.levels.find(
    (l) => l.id === p.activeLevelId,
  )?.name;
  const rows = [
    ...p.project.dimensions
      .filter((d) => d.levelId === p.activeLevelId)
      .map((d, i) => ({
        id: d.id,
        kind: "dimension" as const,
        name: `Dimension ${i + 1}`,
        meta: dimensionLabel(d),
        icon: "dimension",
      })),
    ...p.project.rooms
      .filter((e) => e.levelId === p.activeLevelId)
      .map((e) => ({
        id: e.id,
        kind: "room" as const,
        name: e.name,
        meta: "Room",
        icon: "room",
      })),
    ...p.project.walls
      .filter((e) => e.levelId === p.activeLevelId)
      .map((e, i) => ({
        id: e.id,
        kind: "wall" as const,
        name: `Wall ${String(i + 1).padStart(2, "0")}`,
        meta: `${(Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y) / 1000).toFixed(2)} m`,
        icon: "wall",
      })),
    ...p.project.openings
      .filter(
        (e) =>
          p.project.walls.find((w) => w.id === e.hostWallId)?.levelId ===
          p.activeLevelId,
      )
      .map((e, i) => {
        const type = p.project.openingTypes.find(
          (t) => t.id === e.openingTypeId,
        );
        return {
          id: e.id,
          kind: "opening" as const,
          name: `${type?.kind === "door" ? "Door" : "Window"} ${String(i + 1).padStart(2, "0")}`,
          meta: `${type?.width} mm`,
          icon: type?.kind ?? "door",
        };
      }),
    ...(["floors", "columns", "ceilings", "roofs"] as const).flatMap((key) =>
      p.project[key]
        .filter((e) => e.levelId === p.activeLevelId)
        .map((e, i) => ({
          id: e.id,
          kind: (
            {
              floors: "floor",
              columns: "column",
              ceilings: "ceiling",
              roofs: "roof",
            } as const
          )[key],
          name: `${key.slice(0, -1)} ${i + 1}`,
          meta: "Element",
          icon: key.slice(0, -1),
        })),
    ),
  ].filter((e) =>
    `${e.name} ${e.meta}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <TooltipProvider delayDuration={350}>
      <div
        className={`studio-theme canvas-workspace ${visualize ? "visualize-mode" : ""} ${hidden ? "panels-hidden" : ""}`}
      >
        <header className="editor-topbar">
          <div className="editor-project">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to projects"
              title="Back to projects"
              onClick={p.onExit}
            >
              <Icon name="back" />
            </Button>
            <div className="editor-project-name">
              <RenameField
                label="Project name"
                value={p.project.name}
                onCommit={p.onRename}
              />
              <span>Personal workspace</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={hidden ? "Show panels" : "Hide panels"}
              onClick={() => setHidden(!hidden)}
            >
              <Icon name="panels" size={17} />
            </Button>
          </div>
          <div className="editor-centre-head">
            <Badge variant="outline">
              <Icon name="layers" size={13} />
              {levelName}
            </Badge>
            <div className="history-buttons">
              {commandButton("edit.undo", "undo", "Undo")}
              {commandButton("edit.redo", "redo", "Redo")}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Search commands"
              onClick={() => command("search.launcher")}
            >
              <Icon name="search" size={15} />
              <span className="command-label">Search commands</span>
              <kbd>⌘ K</kbd>
            </Button>
          </div>
          <div className="editor-actions">
            <span
              className={`save-indicator ${p.storageError ? "failed" : ""}`}
              title={p.saveState}
            >
              <span className="local-dot" />
              {p.saveState === "Saved on this device"
                ? "Saved locally"
                : p.saveState}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setModal("export")}
            >
              <Icon name="export" size={15} />
              Export
              <Icon name="down" size={12} />
            </Button>
          </div>
        </header>
        <div className="editor-stage">
          <aside className="studio-left">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as typeof tab)}
              className="left-tabs"
            >
              <TabsList className="w-full">
                <TabsTrigger value="layers">
                  <Icon name="layers" size={14} />
                  Layers
                </TabsTrigger>
                <TabsTrigger value="assets">
                  <Icon name="box" size={14} />
                  Assets
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "layers" ? (
              <>
                <div className="model-section">
                  <div className="section-caption">
                    BUILDING LEVELS
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Manage levels"
                      onClick={() => setModal("levels")}
                    >
                      <Icon name="settings" size={14} />
                    </Button>
                  </div>
                  {p.project.levels.map((l, i) => (
                    <Button
                      variant="ghost"
                      key={l.id}
                      className={`level-row ${p.activeLevelId === l.id ? "selected" : ""}`}
                      onClick={() => p.onLevel(l.id)}
                    >
                      <Icon name="layers" size={15} />
                      <span>{l.name}</span>
                      <small>{String(i + 1).padStart(2, "0")}</small>
                    </Button>
                  ))}
                </div>
                <div className="layer-section">
                  <div className="section-caption">
                    ELEMENTS<Badge variant="secondary">{rows.length}</Badge>
                  </div>
                  <div className="search-field">
                    <Icon name="search" size={14} />
                    <Input
                      aria-label="Find an element"
                      placeholder="Find an element…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="layer-list">
                    {rows.map((row) => (
                      <Button
                        variant="ghost"
                        key={row.id}
                        className={`layer-row ${p.selection?.id === row.id ? "selected" : ""}`}
                        onClick={() => {
                          p.onTool("select");
                          p.onSelect({ kind: row.kind, id: row.id });
                        }}
                      >
                        <Icon name={row.icon} size={15} />
                        <span>{row.name}</span>
                        <small>{row.meta}</small>
                      </Button>
                    ))}
                    {!rows.length && (
                      <p className="panel-note">
                        {search
                          ? "No matching elements."
                          : "No elements yet. Choose a drawing tool to start your plan."}
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="asset-browser">
                <div className="section-caption">
                  BUILDING LIBRARY<span>LOCAL</span>
                </div>
                <p className="asset-intro">
                  Choose a type, then place it in your plan.
                </p>
                {["Walls", "Doors", "Windows", "Materials"].map((cat) => (
                  <div className="asset-category" key={cat}>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCategory(category === cat ? "" : cat);
                        setLibraryNotice("");
                      }}
                    >
                      <Icon name="folder" size={15} />
                      {cat}
                      <Icon
                        name={category === cat ? "down" : "chevron"}
                        size={13}
                      />
                    </Button>
                    {category === cat && (
                      <div className="asset-grid">
                        {cat === "Materials"
                          ? p.project.materials.map((m) => (
                              <Button
                                variant="ghost"
                                key={m.id}
                                className="asset-tile"
                                onClick={() => {
                                  if (p.selection?.kind !== "wall") {
                                    setLibraryNotice(
                                      "Select a wall first to change its type’s material.",
                                    );
                                    return;
                                  }
                                  p.onMaterial(m.id);
                                  setLibraryNotice(
                                    `${m.name} applied to the selected wall type.`,
                                  );
                                }}
                              >
                                <span
                                  className="material-preview"
                                  style={{ background: m.color }}
                                />
                                <strong>{m.name}</strong>
                                <small>Wall type material</small>
                              </Button>
                            ))
                          : (cat === "Walls"
                              ? p.project.wallTypes
                              : p.project.openingTypes.filter(
                                  (t) =>
                                    t.kind ===
                                    (cat === "Doors" ? "door" : "window"),
                                )
                            ).map((t) => (
                              <Button
                                variant="ghost"
                                className="asset-tile"
                                key={t.id}
                                onClick={() => {
                                  if (cat === "Walls") {
                                    p.onWallType(t.id);
                                    p.onTool("wall");
                                  } else {
                                    p.onOpeningType(t.id);
                                    p.onTool(
                                      cat === "Doors" ? "door" : "window",
                                    );
                                  }
                                }}
                              >
                                <span>
                                  <Icon
                                    name={
                                      cat === "Walls"
                                        ? "wall"
                                        : cat === "Doors"
                                          ? "door"
                                          : "window"
                                    }
                                    size={45}
                                  />
                                </span>
                                <strong>{t.name}</strong>
                                <small>
                                  {cat === "Walls"
                                    ? "Editable wall type"
                                    : "Hosted opening"}
                                </small>
                              </Button>
                            ))}
                      </div>
                    )}
                  </div>
                ))}
                {libraryNotice && (
                  <p className="panel-note" role="status">
                    {libraryNotice}
                  </p>
                )}
                <div className="library-note">
                  <Icon name="box" size={20} />
                  <strong>A library that grows with you</strong>
                  <p>
                    Furniture and reusable symbols are planned. These building
                    types work today.
                  </p>
                </div>
              </div>
            )}
            <footer className="left-footer">
              <span className="local-dot" />
              Local project<small>Schema v{p.project.schemaVersion}</small>
            </footer>
          </aside>
          <main className="studio-canvas">
            {p.children}
            <div className="canvas-viewbar">
              <div className="mode-switch">
                <Button
                  variant={!visualize ? "secondary" : "ghost"}
                  size="sm"
                  aria-label="Drafting mode"
                  aria-pressed={!visualize}
                  onClick={() => p.onView("plan")}
                >
                  <Icon name="layers" size={15} />
                  Plan
                </Button>
                <Button
                  variant={visualize ? "secondary" : "ghost"}
                  size="sm"
                  aria-label="Visualize mode"
                  aria-pressed={visualize}
                  onClick={() => {
                    p.onTool("select");
                    p.onView("3d");
                  }}
                >
                  <Icon name="box" size={15} />
                  3D
                </Button>
              </div>
              <Badge variant="outline">
                {visualize ? "Perspective" : "Model · mm"}
              </Badge>
            </div>
            <div className="north-marker">
              <span>N</span>
              <svg width="16" height="30" viewBox="0 0 16 30">
                <path
                  d="m8 2 6 24-6-5-6 5Z"
                  fill="none"
                  stroke="currentColor"
                />
                <path d="M8 2v19l6 5Z" fill="currentColor" />
              </svg>
            </div>
            {(p.storageError || p.message) && (
              <div
                role={
                  p.storageError || p.message?.kind === "error"
                    ? "alert"
                    : "status"
                }
                className="canvas-toast"
              >
                <Icon name={p.storageError ? "shield" : "check"} size={15} />
                <span>{p.storageError || p.message?.text}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Dismiss message"
                  onClick={p.onDismissMessage}
                >
                  <Icon name="close" size={14} />
                </Button>
              </div>
            )}
            <div className="canvas-bottom-left">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Fit model"
                onClick={p.onFit}
              >
                <Icon name="fit" size={16} />
              </Button>
              <span>
                {visualize
                  ? "Drag to orbit · Scroll to zoom"
                  : "Drag to pan · Scroll to zoom"}
              </span>
            </div>
            <div className="canvas-zoom">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                onClick={() => p.onZoom(0.8)}
              >
                −
              </Button>
              <Button variant="ghost" size="sm" onClick={p.onFit}>
                Fit
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                onClick={() => p.onZoom(1.25)}
              >
                +
              </Button>
            </div>
            <div className="drawing-toolbar">
              {p.tool !== "select" && !dismissed && (
                <div className="tool-hint">
                  <span>{p.hint}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Dismiss hint"
                    onClick={() => setDismissed(true)}
                  >
                    <Icon name="close" size={12} />
                  </Button>
                </div>
              )}
              <div className="toolbar-line">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="AI Architect"
                      onClick={() => command("ai.architect")}
                    >
                      <Icon name="spark" size={19} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI Architect</TooltipContent>
                </Tooltip>
                <div className="toolbar-divider" />
                {tools
                  .filter(([tool]) => !visualize || tool === "select")
                  .map(([tool, label, key]) => (
                    <Tooltip key={tool}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={p.tool === tool ? "default" : "ghost"}
                          size="icon"
                          className="tool-button"
                          aria-label={label}
                          aria-pressed={p.tool === tool}
                          onClick={() => p.onTool(tool)}
                        >
                          <Icon name={tool} size={19} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {label} <kbd>{key}</kbd>
                      </TooltipContent>
                    </Tooltip>
                  ))}
              </div>
            </div>
          </main>
          <aside className="studio-inspector">
            <div className="inspector-heading">
              <span>
                {p.selection
                  ? "Element properties"
                  : p.tool === "select"
                    ? visualize
                      ? "Spatial view"
                      : "Canvas"
                    : `${p.tool[0].toUpperCase() + p.tool.slice(1)} tool`}
              </span>
              <Icon name="settings" size={15} />
            </div>
            <div className="inspector-content">
              {p.selection ? (
                p.properties
              ) : (
                <>
                  {p.tool !== "select" && (
                    <section className="inspector-section">
                      <h3>Placement</h3>
                      {p.tool === "wall" ? (
                        <>
                          <label className="field">
                            <span>Wall type</span>
                            <select
                              aria-label="Placement wall type"
                              value={p.wallTypeId}
                              onChange={(e) => p.onWallType(e.target.value)}
                            >
                              {p.project.wallTypes.map((t) => (
                                <option value={t.id} key={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <NumberField
                            label="Wall height (mm)"
                            value={p.wallHeight}
                            min={100}
                            integer
                            onCommit={p.onWallHeight}
                          />
                          <p className="panel-note">
                            Connected straight walls. Click successive points;
                            Esc finishes the chain.
                          </p>
                        </>
                      ) : p.tool === "door" || p.tool === "window" ? (
                        <>
                          <label className="field">
                            <span>Opening type</span>
                            <select
                              value={p.openingTypeId}
                              onChange={(e) => p.onOpeningType(e.target.value)}
                            >
                              {p.project.openingTypes
                                .filter((t) => t.kind === p.tool)
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <div className="opening-preview">
                            <Icon name={p.tool} size={45} />
                          </div>
                          <p className="panel-note">
                            Click near a wall to place an opening. Fit and
                            overlap are validated before it is added.
                          </p>
                        </>
                      ) : (
                        <p className="panel-note">{p.hint}</p>
                      )}
                    </section>
                  )}
                  <section className="inspector-section">
                    <h3>Drawing settings</h3>
                    <div className="static-field">
                      <span>Model units</span>
                      <strong>
                        Millimetres <small>mm</small>
                      </strong>
                    </div>
                    <label className="field">
                      <span>Snap interval</span>
                      <select
                        value={p.snap}
                        onChange={(e) => p.onSnap(Number(e.target.value))}
                      >
                        {[0, 50, 100, 500, 1000].map((n) => (
                          <option value={n} key={n}>
                            {n ? `${n} mm` : "Off"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="toggle-row">
                      Show grid
                      <input
                        type="checkbox"
                        checked={p.grid}
                        onChange={(e) => p.onGrid(e.target.checked)}
                      />
                      <span />
                    </label>
                  </section>
                  <section className="inspector-section">
                    <h3>Appearance</h3>
                    <label className="field">
                      <span>Visual style</span>
                      <select
                        value={p.visualStyle}
                        onChange={(e) =>
                          p.onStyle(e.target.value as VisualStyle)
                        }
                      >
                        <option value="hiddenLine">Architectural</option>
                        <option value="shaded">Shaded</option>
                        <option value="wireframe">Wireframe</option>
                      </select>
                    </label>
                    <label className="toggle-row">
                      Shadows
                      <input
                        type="checkbox"
                        checked={p.shadows}
                        onChange={(e) => p.onShadows(e.target.checked)}
                      />
                      <span />
                    </label>
                  </section>
                  <section className="inspector-section">
                    <h3>Project overview</h3>
                    <div className="overview-grid">
                      <div>
                        <strong>{p.project.walls.length}</strong>
                        <span>Walls</span>
                      </div>
                      <div>
                        <strong>{p.project.rooms.length}</strong>
                        <span>Rooms</span>
                      </div>
                      <div>
                        <strong>{p.project.openings.length}</strong>
                        <span>Openings</span>
                      </div>
                      <div>
                        <strong>{p.project.levels.length}</strong>
                        <span>Levels</span>
                      </div>
                    </div>
                  </section>
                  {visualize && (
                    <div className="panel-note">
                      This is your live 3D model, not an AI image. Orbit to
                      explore. Saved cameras and image rendering are future
                      milestones.
                    </div>
                  )}
                </>
              )}
            </div>
            <footer className="inspector-footer">
              <Icon name="shield" size={14} />
              <span>Model-first. Every edit is undoable.</span>
            </footer>
          </aside>
        </div>
        {p.aiPanel}
        {modal === "levels" && (
          <Dialog title="Building levels" onClose={() => setModal(null)}>
            {p.levels}
          </Dialog>
        )}
        {modal === "export" && (
          <Dialog
            title="Take your project with you"
            onClose={() => setModal(null)}
          >
            <p className="dialog-intro">
              Export an editable backup you can reopen in Contour.
            </p>
            <Button
              variant="ghost"
              className="export-option"
              onClick={() => {
                command("file.save");
                setModal(null);
              }}
            >
              <span>
                <Icon name="file" size={28} />
              </span>
              <div>
                <strong>Project JSON</strong>
                <p>Full model · dimensions · materials · levels</p>
              </div>
              <Icon name="export" size={18} />
            </Button>
            <p className="panel-note">
              PDF, DXF and image exports are planned. This release saves the
              native project format; it does not export RVT.
            </p>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
}
