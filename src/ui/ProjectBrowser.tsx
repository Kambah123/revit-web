import type { Project } from "../model/types";
import { ELEVATION_DIRECTIONS, elevationTitle, type ElevationDirection } from "../geometry/elevation";

export interface ViewTab {
  id: string;
  kind: "plan" | "3d" | "elevation";
  levelId?: string;
  direction?: ElevationDirection;
  title: string;
}

interface ProjectBrowserProps {
  project: Project;
  openViews: ViewTab[];
  activeViewId: string;
  onOpenView(view: ViewTab): void;
}

/**
 * The Project Browser: views (floor plans per level, 3D), sheets and schedules (with honest empty
 * states until those milestones land), and the type catalogues of the model.
 */
export function ProjectBrowser({ project, openViews, activeViewId, onOpenView }: ProjectBrowserProps) {
  const planViews: ViewTab[] = project.levels.map((l) => ({
    id: `plan:${l.id}`,
    kind: "plan",
    levelId: l.id,
    title: l.name,
  }));
  const threeD: ViewTab = { id: "3d", kind: "3d", title: "{3D}" };
  const elevations: ViewTab[] = ELEVATION_DIRECTIONS.map((d) => ({
    id: `elev:${d}`,
    kind: "elevation" as const,
    direction: d,
    title: elevationTitle(d),
  }));

  const row = (view: ViewTab) => {
    const open = openViews.some((v) => v.id === view.id);
    return (
      <li key={view.id}>
        <button
          className={`tree-item ${activeViewId === view.id ? "active" : ""}`}
          onDoubleClick={() => onOpenView(view)}
          onClick={() => onOpenView(view)}
          title="Open view"
        >
          <span className="tree-icon">{view.kind === "3d" ? "3D" : view.kind === "elevation" ? "EL" : "FP"}</span>
          {view.title}
          {open ? "" : ""}
        </button>
      </li>
    );
  };

  return (
    <div className="browser">
      <h2>Project Browser</h2>
      <div className="tree">
        <h3>Views (Floor Plans)</h3>
        <ul>{planViews.map(row)}</ul>
        <h3>Views (3D)</h3>
        <ul>{row(threeD)}</ul>
        <h3>Views (Elevations)</h3>
        <ul>{elevations.map(row)}</ul>
        <h3>Sheets</h3>
        <p className="muted">No sheets yet. Sheets and title blocks arrive with documentation (roadmap M4).</p>
        <h3>Schedules/Quantities</h3>
        <p className="muted">No schedules yet. Schedules arrive with quantities (roadmap M5).</p>
        <h3>Families</h3>
        <details>
          <summary>Wall types ({project.wallTypes.length})</summary>
          <ul>
            {project.wallTypes.map((t) => (
              <li key={t.id} className="tree-item static">
                {t.name}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Floor types ({project.floorTypes.length})</summary>
          <ul>
            {project.floorTypes.map((t) => (
              <li key={t.id} className="tree-item static">
                {t.name}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Column types ({project.columnTypes.length})</summary>
          <ul>
            {project.columnTypes.map((t) => (
              <li key={t.id} className="tree-item static">
                {t.name}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Door and window types ({project.openingTypes.length})</summary>
          <ul>
            {project.openingTypes.map((t) => (
              <li key={t.id} className="tree-item static">
                {t.name}
              </li>
            ))}
          </ul>
        </details>
        <h3>Revit Links</h3>
        <p className="muted">No linked models. Model linking arrives with coordination (roadmap M9).</p>
      </div>
    </div>
  );
}
