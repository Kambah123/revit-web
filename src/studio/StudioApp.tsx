import { useEffect, useRef, useState } from "react";
import { Editor as App } from "./Editor";
import { createProject } from "../model/project";
import { parseProject } from "../model/schema";
import { newId } from "../model/ids";
import type { Project } from "../model/types";
import {
  openProjectStore,
  migrateLegacyProject,
  type ProjectStore,
  type StoredProject,
} from "./projectStore";
import { createSampleProject } from "./sampleProject";
import { Icon } from "./Icon";
import { PlanThumbnail } from "./PlanThumbnail";
import { Dialog } from "./Dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";

let bootstrap: Promise<ProjectStore> | undefined;
let recoveryWarning = "";
function initialize() {
  return (bootstrap ??= (async () => {
    const store = await openProjectStore();
    if (!(await store.initialized())) {
      try {
        await migrateLegacyProject(store, window.localStorage);
      } catch (error) {
        recoveryWarning = errorMessage(error);
      }
      if (!(await store.list()).length) {
        await store.put(createSampleProject(true));
        await store.put(createSampleProject());
      }
      await store.markInitialized();
    }
    return store;
  })().catch((error) => {
    bootstrap = undefined;
    throw error;
  }));
}
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to save your project.";
export function StudioApp() {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("Saved on this device");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"projects" | "recent">("projects");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [dialog, setDialog] = useState<"new" | "about" | null>(null);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<"blank" | "house" | "studio">(
    "blank",
  );
  const [sort, setSort] = useState("updated");
  const [pendingDelete, setPendingDelete] = useState<StoredProject | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  useEffect(() => {
    let live = true;
    initialize()
      .then(async (s) => {
        const rows = await s.list();
        if (live) {
          setStore(s);
          setProjects(rows);
          setError(recoveryWarning);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (
      !active ||
      (saveState !== "Saving…" && !saveState.startsWith("Not saved"))
    )
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active, saveState]);
  async function refresh() {
    if (store) setProjects(await store.list());
  }
  function save(project: Project) {
    if (!store) return;
    const seq = ++generation.current;
    setSaveState("Saving…");
    const createdAt = projects.find((p) => p.id === project.id)?.createdAt;
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        try {
          await store.put(project, createdAt);
          if (seq === generation.current) {
            setSaveState("Saved on this device");
            setError("");
          }
        } catch (e) {
          setSaveState("Not saved — export a backup");
          setError(errorMessage(e));
          throw e;
        }
      });
    // Handled here and at navigation; keep a rejected queue so navigation cannot hide a failed write.
    void saveQueue.current.catch(() => {});
  }
  async function leave() {
    try {
      await saveQueue.current;
      await refresh();
      setActive(null);
    } catch {
      setError(
        "Your last changes could not be saved. Export a JSON backup before leaving.",
      );
    }
  }
  async function open(p: Project) {
    setActive(p);
    setError("");
  }
  async function create() {
    if (!store || !name.trim() || busy) return;
    setBusy(true);
    try {
      const p =
        template === "blank"
          ? createProject(name.trim())
          : {
              ...createSampleProject(template === "studio"),
              name: name.trim(),
            };
      await store.put(p);
      await refresh();
      setDialog(null);
      await open(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    if (!store) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Project files must be smaller than 20 MB.");
      const p = parseProject(await file.text());
      p.id = newId("proj");
      await store.put(p);
      await refresh();
      await open(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  async function duplicate(row: StoredProject) {
    if (!store) return;
    try {
      await store.put({
        ...row.project,
        id: newId("proj"),
        name: `${row.name} — copy`,
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function remove(row: StoredProject) {
    if (!store) return;
    try {
      await store.remove(row.id);
      setPendingDelete(null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (active)
    return (
      <App
        initialProject={active}
        studio
        onProjectChange={save}
        onExit={() => void leave()}
        saveState={saveState}
        storageError={error}
      />
    );
  const filtered = projects
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt - a.updatedAt,
    )
    .slice(0, section === "recent" ? 6 : projects.length);
  const startNew = () => {
    setName("");
    setTemplate("blank");
    setDialog("new");
  };
  return (
    <div className="studio-theme dashboard">
      <aside className="dashboard-sidebar">
        <a
          href="#"
          className="studio-brand"
          onClick={(e) => {
            e.preventDefault();
            setSection("projects");
          }}
        >
          <span className="brand-mark">
            <Icon name="logo" size={22} />
          </span>
          Contour<Badge variant="secondary">Studio</Badge>
        </a>
        <Button
          variant="outline"
          className="workspace-switch"
          onClick={() => setDialog("about")}
        >
          <span className="workspace-avatar">S</span>
          <span>
            <strong>My workspace</strong>
            <small>Personal · Local storage</small>
          </span>
          <Icon name="down" size={14} />
        </Button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace">
          <Button
            variant="ghost"
            className={section === "projects" ? "selected" : ""}
            onClick={() => setSection("projects")}
          >
            <Icon name="folder" />
            All projects<span className="nav-count">{projects.length}</span>
          </Button>
          <Button
            variant="ghost"
            className={section === "recent" ? "selected" : ""}
            onClick={() => setSection("recent")}
          >
            <Icon name="clock" />
            Recently edited
          </Button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <Icon name="shield" size={18} />
            <strong>Your workspace. Your files.</strong>
            <p>
              Saved in this browser, not the cloud. Export a backup to keep your
              work safe.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setDialog("about")}>
            <Icon name="help" />
            Workspace information
          </Button>
          <div className="profile">
            <span className="workspace-avatar">S</span>
            <div>
              <strong>Personal workspace</strong>
              <small>No account required</small>
            </div>
            <span className="local-dot" />
          </div>
        </div>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <Icon name="home" size={15} />
            <span>Workspace</span>
            <Icon name="chevron" size={13} />
            <strong>
              {section === "recent" ? "Recently edited" : "All projects"}
            </strong>
          </div>
          <Badge variant="outline">
            <span className="local-dot" />
            Local workspace
          </Badge>
        </header>
        <div className="dashboard-content">
          <div className="heading-row">
            <div>
              <div className="eyebrow">YOUR DESIGN WORKSPACE</div>
              <h1>
                {section === "recent" ? "Recently edited" : "Projects"}
                <span>{projects.length}</span>
              </h1>
              <p>
                From the first line to the final detail. Make room for your next
                idea.
              </p>
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                onClick={() => input.current?.click()}
                disabled={!store}
              >
                <Icon name="import" size={16} />
                Import project
              </Button>
              <Button onClick={startNew} disabled={!store}>
                <Icon name="plus" size={16} />
                New project
              </Button>
            </div>
          </div>
          {error && (
            <div className="studio-alert" role="alert">
              <Icon name="shield" />
              {error}
            </div>
          )}
          <div className="project-toolbar">
            <div className="search-field">
              <Icon name="search" size={16} />
              <Input
                aria-label="Search projects"
                placeholder="Search projects…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="view-options">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {sort === "name" ? "Name A–Z" : "Last edited"}
                    <Icon name="down" size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setSort("updated")}>
                    Last edited
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSort("name")}>
                    Name A–Z
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="layout-switch">
                <Button
                  variant={layout === "grid" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Grid layout"
                  aria-pressed={layout === "grid"}
                  onClick={() => setLayout("grid")}
                >
                  <Icon name="grid" size={16} />
                </Button>
                <Button
                  variant={layout === "list" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="List layout"
                  aria-pressed={layout === "list"}
                  onClick={() => setLayout("list")}
                >
                  <Icon name="list" size={16} />
                </Button>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="project-grid" aria-label="Loading projects">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-card animate-pulse" />
              ))}
            </div>
          ) : (
            <div
              className={layout === "grid" ? "project-grid" : "project-list"}
            >
              {filtered.map((row) => (
                <article key={row.id} className="project-card">
                  <button
                    className="project-preview"
                    aria-label={`Open ${row.name}`}
                    onClick={() => void open(row.project)}
                  >
                    <PlanThumbnail project={row.project} />
                    <Badge className="preview-badge" variant="outline">
                      Floor plan
                    </Badge>
                    <span className="preview-open">
                      <Icon name="arrow" size={18} />
                    </span>
                  </button>
                  <div className="project-card-info">
                    <div>
                      <button
                        className="project-title"
                        onClick={() => void open(row.project)}
                      >
                        {row.name}
                      </button>
                      <p>
                        {row.project.levels.length}{" "}
                        {row.project.levels.length === 1 ? "level" : "levels"}
                        <span>·</span>Edited{" "}
                        {new Date(row.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Project actions for ${row.name}`}
                        >
                          <Icon name="more" size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => void open(row.project)}
                        >
                          <Icon name="file" size={15} />
                          Open project
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void duplicate(row)}>
                          <Icon name="copy" size={15} />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDelete(row)}
                        >
                          <Icon name="trash" size={15} />
                          Delete project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </article>
              ))}
              {!query && (
                <button
                  className="new-project-card"
                  onClick={startNew}
                  disabled={!store}
                >
                  <span>
                    <Icon name="plus" size={23} />
                  </span>
                  <strong>Create a project</strong>
                  <p>A blank canvas for your next idea</p>
                </button>
              )}
            </div>
          )}
          {!loading && query && !filtered.length && (
            <div className="empty-state">
              <Icon name="search" size={28} />
              <h2>No projects found</h2>
              <p>Try another name or start a new project.</p>
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          )}
          <section className="workspace-tip">
            <div className="tip-icon">
              <Icon name="layers" size={21} />
            </div>
            <div>
              <strong>Everything starts with a plan.</strong>
              <p>
                Open an example to explore the tools, or create a project and
                start drawing.
              </p>
            </div>
            <Badge variant="secondary">Editable models</Badge>
          </section>
          <footer className="dashboard-footer">
            <span>
              <Icon name="shield" size={14} />
              Stored on this device. Export regularly.
            </span>
            <span>Contour · Architecture workspace</span>
          </footer>
        </div>
      </main>
      <input
        ref={input}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
        }}
      />
      {dialog === "new" && (
        <Dialog
          title="Create a project"
          description="Give your project a name and choose a starting point."
          onClose={() => !busy && setDialog(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="field">
              <span>Project name</span>
              <Input
                autoFocus
                placeholder="e.g. Lakeside residence"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <div className="field">
              <span>Start from</span>
              <div className="template-options">
                {(
                  [
                    ["blank", "Blank project", "An empty model"],
                    ["house", "Residence", "5-room example"],
                    ["studio", "Garden studio", "Compact example"],
                  ] as const
                ).map(([id, title, desc]) => (
                  <Button
                    key={id}
                    type="button"
                    variant="outline"
                    className={template === id ? "chosen" : ""}
                    aria-pressed={template === id}
                    onClick={() => setTemplate(id)}
                  >
                    <Icon name={id === "blank" ? "file" : "home"} />
                    <strong>{title}</strong>
                    <small>{desc}</small>
                  </Button>
                ))}
              </div>
            </div>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || busy}>
                {busy ? "Creating…" : "Create project"}
                <Icon name="arrow" size={15} />
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog === "about" && (
        <Dialog
          title="Your local workspace"
          description="A model-first architecture editor. No account required."
          onClose={() => setDialog(null)}
        >
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Projects are stored in IndexedDB in this browser and origin.
              Clearing site data removes them. Export JSON backups before moving
              devices.
            </p>
            <p>
              Use one editing tab per project. Cloud sync, live collaboration,
              furniture assets and image rendering are not yet available.
            </p>
            <p>
              The assistant can preview and apply model changes. The current
              preview uses a clearly labelled local demo planner.
            </p>
          </div>
          <Button onClick={() => setDialog(null)}>Got it</Button>
        </Dialog>
      )}
      {pendingDelete && (
        <Dialog
          title="Delete this project?"
          description={`“${pendingDelete.name}” will be removed from this device. This cannot be undone. Export a backup first if you need it.`}
          onClose={() => setPendingDelete(null)}
        >
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void remove(pendingDelete)}
            >
              Delete project
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
