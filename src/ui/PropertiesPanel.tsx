import { NumberField } from "./NumberField";
import { joinedEnds } from "../model/joins";
import { distanceMm } from "../model/geometry";
import { formatMetres } from "../model/units";
import { levelById, openingTypeById, openingsInWall, wallById, wallTypeById } from "../model/project";
import type { Opening, Project, Wall } from "../model/types";
import type { Selection } from "../viewer/BimScene";

interface PropertiesPanelProps {
  project: Project;
  selection: Selection;
  onWallPatch(wallId: string, patch: Partial<Pick<Wall, "levelId" | "wallTypeId" | "height" | "start" | "end">>): void;
  onWallTypeThickness(wallTypeId: string, thickness: number): void;
  onOpeningPatch(openingId: string, patch: Partial<Pick<Opening, "offset" | "openingTypeId">>): void;
  onSelectWall(wallId: string): void;
  onDeleteSelection(): void;
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { project, selection } = props;
  const wall = selection?.kind === "wall" ? wallById(project, selection.id) : undefined;
  const opening = selection?.kind === "opening" ? project.openings.find((o) => o.id === selection.id) : undefined;

  if (wall) return <WallProperties {...props} wall={wall} />;
  if (opening) return <OpeningProperties {...props} opening={opening} />;

  return (
    <>
      <h2>Properties</h2>
      <p className="muted">Select a wall or door/window to edit its properties.</p>
      <dl className="stats">
        <dt>Levels</dt>
        <dd>{project.levels.length}</dd>
        <dt>Walls</dt>
        <dd>{project.walls.length}</dd>
        <dt>Doors and windows</dt>
        <dd>{project.openings.length}</dd>
      </dl>
    </>
  );
}

function WallProperties({
  project,
  wall,
  onWallPatch,
  onWallTypeThickness,
  onDeleteSelection,
}: PropertiesPanelProps & { wall: Wall }) {
  const type = wallTypeById(project, wall.wallTypeId);
  const level = levelById(project, wall.levelId);
  const joins = joinedEnds(project).get(wall.id) ?? { start: false, end: false };
  const hosted = openingsInWall(project, wall.id).length;
  const sameType = project.walls.filter((w) => w.wallTypeId === wall.wallTypeId).length;

  return (
    <>
      <h2>Wall</h2>
      <div className="props">
        <label className="field">
          <span>Level</span>
          <select value={wall.levelId} onChange={(e) => onWallPatch(wall.id, { levelId: e.target.value })}>
            {project.levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Wall type</span>
          <select value={wall.wallTypeId} onChange={(e) => onWallPatch(wall.id, { wallTypeId: e.target.value })}>
            {project.wallTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {type && (
          <NumberField
            label={`Type thickness (mm), used by ${sameType} wall(s)`}
            value={type.thickness}
            step={1}
            integer
            min={1}
            onCommit={(mm) => onWallTypeThickness(type.id, mm)}
          />
        )}
        <NumberField
          label="Height (mm)"
          value={wall.height}
          step={1}
          integer
          min={1}
          onCommit={(mm) => onWallPatch(wall.id, { height: mm })}
        />
        <fieldset>
          <legend>Start (mm)</legend>
          <NumberField
            label="X"
            value={wall.start.x}
            step={1}
            integer
            onCommit={(v) => onWallPatch(wall.id, { start: { x: v, y: wall.start.y } })}
          />
          <NumberField
            label="Y"
            value={wall.start.y}
            step={1}
            integer
            onCommit={(v) => onWallPatch(wall.id, { start: { x: wall.start.x, y: v } })}
          />
        </fieldset>
        <fieldset>
          <legend>End (mm)</legend>
          <NumberField
            label="X"
            value={wall.end.x}
            step={1}
            integer
            onCommit={(v) => onWallPatch(wall.id, { end: { x: v, y: wall.end.y } })}
          />
          <NumberField
            label="Y"
            value={wall.end.y}
            step={1}
            integer
            onCommit={(v) => onWallPatch(wall.id, { end: { x: wall.end.x, y: v } })}
          />
        </fieldset>
        <p className="muted">
          Length {formatMetres(Math.round(distanceMm(wall.start, wall.end)))} · {hosted} opening(s)
        </p>
        <p className="muted">
          Joined: start {joins.start ? "yes" : "no"}, end {joins.end ? "yes" : "no"}
          {level ? ` · ${level.name}` : ""}
        </p>
        <button className="danger wide" onClick={onDeleteSelection}>
          Delete wall
        </button>
      </div>
    </>
  );
}

function OpeningProperties({
  project,
  opening,
  onOpeningPatch,
  onSelectWall,
  onDeleteSelection,
}: PropertiesPanelProps & { opening: Opening }) {
  const type = openingTypeById(project, opening.openingTypeId);
  const host = wallById(project, opening.hostWallId);
  if (!type) return null;
  const sameKind = project.openingTypes.filter((t) => t.kind === type.kind);

  return (
    <>
      <h2>{type.kind === "door" ? "Door" : "Window"}</h2>
      <div className="props">
        <label className="field">
          <span>Type</span>
          <select value={opening.openingTypeId} onChange={(e) => onOpeningPatch(opening.id, { openingTypeId: e.target.value })}>
            {sameKind.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Offset from wall start (mm)"
          value={opening.offset}
          step={1}
          integer
          onCommit={(mm) => onOpeningPatch(opening.id, { offset: mm })}
        />
        <p className="muted">
          Width {type.width} · Height {type.height} · Sill {type.sillHeight} mm
        </p>
        {host && (
          <p className="muted">
            Host wall:{" "}
            <button className="link" onClick={() => onSelectWall(host.id)}>
              select
            </button>
          </p>
        )}
        <button className="danger wide" onClick={onDeleteSelection}>
          Delete {type.kind}
        </button>
      </div>
    </>
  );
}
