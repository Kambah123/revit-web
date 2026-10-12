import { NumberField } from "./NumberField";
import { RenameField } from "./RenameField";
import { joinedEnds } from "../model/joins";
import { distanceMm } from "../model/geometry";
import { formatMetres } from "../model/units";
import {
  ceilingTypeById,
  columnTypeById,
  floorTypeById,
  levelById,
  openingTypeById,
  openingsInWall,
  roofTypeById,
  wallById,
  wallTypeById,
} from "../model/project";
import { floorAreaM2, floorPerimeterMm, floorVolumeMm3, projectQuantities, roomAreaM2 } from "../model/quantities";
import type { Ceiling, Column, Floor, Opening, Project, Roof, Room, Wall } from "../model/types";
import type { Selection } from "../viewer/BimScene";

interface PropertiesPanelProps {
  project: Project;
  selection: Selection;
  onWallPatch(wallId: string, patch: Partial<Pick<Wall, "levelId" | "wallTypeId" | "height" | "start" | "end">>): void;
  onWallTypeThickness(wallTypeId: string, thickness: number): void;
  onOpeningPatch(openingId: string, patch: Partial<Pick<Opening, "offset" | "openingTypeId">>): void;
  onFloorPatch(floorId: string, patch: Partial<Pick<Floor, "levelId" | "floorTypeId">>): void;
  onRoomPatch(roomId: string, patch: Partial<Pick<Room, "levelId" | "name" | "number">>): void;
  onColumnPatch(columnId: string, patch: Partial<Pick<Column, "levelId" | "columnTypeId" | "height">>): void;
  onCeilingPatch(ceilingId: string, patch: Partial<Pick<Ceiling, "levelId" | "ceilingTypeId" | "height">>): void;
  onRoofPatch(roofId: string, patch: Partial<Pick<Roof, "levelId" | "roofTypeId" | "overhang" | "rise">>): void;
  onSelectWall(wallId: string): void;
  onDeleteSelection(): void;
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { project, selection } = props;
  const wall = selection?.kind === "wall" ? wallById(project, selection.id) : undefined;
  const opening = selection?.kind === "opening" ? project.openings.find((o) => o.id === selection.id) : undefined;
  const floor = selection?.kind === "floor" ? project.floors.find((f) => f.id === selection.id) : undefined;
  const room = selection?.kind === "room" ? project.rooms.find((r) => r.id === selection.id) : undefined;
  const column = selection?.kind === "column" ? project.columns.find((c) => c.id === selection.id) : undefined;
  const ceiling = selection?.kind === "ceiling" ? project.ceilings.find((c) => c.id === selection.id) : undefined;
  const roof = selection?.kind === "roof" ? project.roofs.find((r) => r.id === selection.id) : undefined;

  if (wall) return <WallProperties {...props} wall={wall} />;
  if (opening) return <OpeningProperties {...props} opening={opening} />;
  if (floor) return <FloorProperties {...props} floor={floor} />;
  if (room) return <RoomProperties {...props} room={room} />;
  if (column) return <ColumnProperties {...props} column={column} />;
  if (ceiling) return <CeilingProperties {...props} ceiling={ceiling} />;
  if (roof) return <RoofProperties {...props} roof={roof} />;

  const q = projectQuantities(project);
  return (
    <>
      <h2>Properties</h2>
      <p className="muted">Select an element to edit its properties.</p>
      <h3>Model</h3>
      <dl className="stats">
        <dt>Levels</dt>
        <dd>{project.levels.length}</dd>
        <dt>Walls</dt>
        <dd>{project.walls.length}</dd>
        <dt>Doors and windows</dt>
        <dd>{project.openings.length}</dd>
        <dt>Floors</dt>
        <dd>{project.floors.length}</dd>
        <dt>Rooms</dt>
        <dd>{project.rooms.length}</dd>
        <dt>Columns</dt>
        <dd>{project.columns.length}</dd>
      </dl>
      <h3>Quantities (derived)</h3>
      <dl className="stats">
        <dt>Room area</dt>
        <dd>{q.roomAreaM2.toFixed(2)} m²</dd>
        <dt>Floor area</dt>
        <dd>{q.floorAreaM2.toFixed(2)} m²</dd>
        <dt>Floor volume</dt>
        <dd>{q.floorVolumeM3.toFixed(3)} m³</dd>
        <dt>Wall length</dt>
        <dd>{q.wallLengthM.toFixed(2)} m</dd>
        <dt>Wall volume (net)</dt>
        <dd>{q.wallNetVolumeM3.toFixed(3)} m³</dd>
        <dt>Column volume</dt>
        <dd>{q.columnVolumeM3.toFixed(3)} m³</dd>
      </dl>
      <h3>Materials</h3>
      <ul className="materials">
        {project.materials.map((m) => (
          <li key={m.id}>
            <span className="swatch" style={{ background: m.color }} /> {m.name}
          </li>
        ))}
      </ul>
    </>
  );
}

function LevelSelect({
  project,
  value,
  onPick,
}: {
  project: Project;
  value: string;
  onPick(levelId: string): void;
}) {
  return (
    <label className="field">
      <span>Level</span>
      <select value={value} onChange={(e) => onPick(e.target.value)}>
        {project.levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
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
        <LevelSelect project={project} value={wall.levelId} onPick={(levelId) => onWallPatch(wall.id, { levelId })} />
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

function FloorProperties({
  project,
  floor,
  onFloorPatch,
  onDeleteSelection,
}: PropertiesPanelProps & { floor: Floor }) {
  const type = floorTypeById(project, floor.floorTypeId);
  return (
    <>
      <h2>Floor</h2>
      <div className="props">
        <LevelSelect project={project} value={floor.levelId} onPick={(levelId) => onFloorPatch(floor.id, { levelId })} />
        <label className="field">
          <span>Floor type</span>
          <select value={floor.floorTypeId} onChange={(e) => onFloorPatch(floor.id, { floorTypeId: e.target.value })}>
            {project.floorTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {floor.boundary.length} boundary points
          {type ? ` · thickness ${type.thickness} mm` : ""}
        </p>
        <dl className="stats">
          <dt>Area</dt>
          <dd>{floorAreaM2(floor).toFixed(2)} m²</dd>
          <dt>Perimeter</dt>
          <dd>{(floorPerimeterMm(floor) / 1000).toFixed(2)} m</dd>
          <dt>Volume</dt>
          <dd>{(floorVolumeMm3(floor, project) / 1e9).toFixed(3)} m³</dd>
        </dl>
        <button className="danger wide" onClick={onDeleteSelection}>
          Delete floor
        </button>
      </div>
    </>
  );
}

function RoomProperties({ project, room, onRoomPatch, onDeleteSelection }: PropertiesPanelProps & { room: Room }) {
  return (
    <>
      <h2>Room</h2>
      <div className="props">
        <label className="field">
          <span>Name</span>
          <RenameField label="Name" value={room.name} onCommit={(name) => onRoomPatch(room.id, { name })} />
        </label>
        <label className="field">
          <span>Number</span>
          <RenameField label="Number" value={room.number} onCommit={(number) => onRoomPatch(room.id, { number })} />
        </label>
        <LevelSelect project={project} value={room.levelId} onPick={(levelId) => onRoomPatch(room.id, { levelId })} />
        <dl className="stats">
          <dt>Area</dt>
          <dd>{roomAreaM2(room).toFixed(2)} m²</dd>
          <dt>Boundary points</dt>
          <dd>{room.boundary.length}</dd>
        </dl>
        <button className="danger wide" onClick={onDeleteSelection}>
          Delete room
        </button>
      </div>
    </>
  );
}

function ColumnProperties({
  project,
  column,
  onColumnPatch,
  onDeleteSelection,
}: PropertiesPanelProps & { column: Column }) {
  const type = columnTypeById(project, column.columnTypeId);
  return (
    <>
      <h2>Column</h2>
      <div className="props">
        <LevelSelect project={project} value={column.levelId} onPick={(levelId) => onColumnPatch(column.id, { levelId })} />
        <label className="field">
          <span>Column type</span>
          <select value={column.columnTypeId} onChange={(e) => onColumnPatch(column.id, { columnTypeId: e.target.value })}>
            {project.columnTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Height (mm)"
          value={column.height}
          step={1}
          integer
          min={1}
          onCommit={(mm) => onColumnPatch(column.id, { height: mm })}
        />
        <p className="muted">
          Position {column.position.x}, {column.position.y} mm
          {type ? ` · section ${type.width} × ${type.depth} mm` : ""}
        </p>
        <button className="danger wide" onClick={onDeleteSelection}>
          Delete column
        </button>
      </div>
    </>
  );
}

function CeilingProperties({
  project,
  ceiling,
  onCeilingPatch,
  onDeleteSelection,
}: PropertiesPanelProps & { ceiling: Ceiling }) {
  const type = ceilingTypeById(project, ceiling.ceilingTypeId);
  return (
    <>
      <h2>Ceiling</h2>
      <div className="props">
        <LevelSelect project={project} value={ceiling.levelId} onPick={(levelId) => onCeilingPatch(ceiling.id, { levelId })} />
        <label className="field">
          <span>Ceiling type</span>
          <select value={ceiling.ceilingTypeId} onChange={(e) => onCeilingPatch(ceiling.id, { ceilingTypeId: e.target.value })}>
            {project.ceilingTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Height above level (mm)"
          value={ceiling.height}
          step={1}
          integer
          min={1}
          onCommit={(mm) => onCeilingPatch(ceiling.id, { height: mm })}
        />
        <p className="muted">
          {ceiling.boundary.length} boundary points
          {type ? ` · thickness ${type.thickness} mm` : ""}
        </p>
        <button className="danger wide" onClick={onDeleteSelection}>
          Delete ceiling
        </button>
      </div>
    </>
  );
}

function RoofProperties({ project, roof, onRoofPatch, onDeleteSelection }: PropertiesPanelProps & { roof: Roof }) {
  const type = roofTypeById(project, roof.roofTypeId);
  return (
    <>
      <h2>Roof</h2>
      <div className="props">
        <LevelSelect project={project} value={roof.levelId} onPick={(levelId) => onRoofPatch(roof.id, { levelId })} />
        <label className="field">
          <span>Roof type</span>
          <select value={roof.roofTypeId} onChange={(e) => onRoofPatch(roof.id, { roofTypeId: e.target.value })}>
            {project.roofTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Overhang (mm)"
          value={roof.overhang}
          step={1}
          integer
          min={0}
          onCommit={(mm) => onRoofPatch(roof.id, { overhang: mm })}
        />
        <NumberField
          label="Rise (mm)"
          value={roof.rise}
          step={1}
          integer
          min={1}
          onCommit={(mm) => onRoofPatch(roof.id, { rise: mm })}
        />
        <p className="muted">
          Rectangular hip roof{type ? ` · thickness ${type.thickness} mm at the eaves` : ""}
        </p>
        <button className="danger wide" onClick={onDeleteSelection}>
          Delete roof
        </button>
      </div>
    </>
  );
}
