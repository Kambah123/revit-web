import { useState } from "react";
import { NumberField } from "./NumberField";
import { RenameField } from "./RenameField";
import { wallsOnLevel } from "../model/project";
import type { Project } from "../model/types";

interface LevelsPanelProps {
  project: Project;
  activeLevelId: string;
  onSelect(levelId: string): void;
  onAdd(name: string, elevation: number): void;
  onRename(levelId: string, name: string): void;
  onElevation(levelId: string, elevation: number): void;
  onDelete(levelId: string): void;
}

export function LevelsPanel(props: LevelsPanelProps) {
  const { project, activeLevelId } = props;
  const [newName, setNewName] = useState("");
  const [newElevation, setNewElevation] = useState(3000);

  return (
    <>
      <h2>Levels</h2>
      <ul className="levels">
        {project.levels.map((level) => (
          <li key={level.id} className={level.id === activeLevelId ? "active" : ""}>
            <button className="level-select" onClick={() => props.onSelect(level.id)}>
              <span className="level-name">{level.name}</span>
              <span className="muted">
                {level.elevation} mm · {wallsOnLevel(project, level.id).length} walls
              </span>
            </button>
            <div className="level-actions">
              <RenameField
                label={`Rename ${level.name}`}
                value={level.name}
                onCommit={(name) => props.onRename(level.id, name)}
              />
              <button
                className="danger"
                disabled={project.levels.length <= 1}
                onClick={() => props.onDelete(level.id)}
                title="Delete level and its walls"
              >
                ✕
              </button>
            </div>
            <div className="level-elevation">
              <NumberField
                label="Elevation (mm)"
                value={level.elevation}
                step={1}
                integer
                onCommit={(mm) => props.onElevation(level.id, mm)}
              />
            </div>
          </li>
        ))}
      </ul>
      <h3>Add level</h3>
      <div className="add-level">
        <input
          aria-label="New level name"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <NumberField label="Elevation (mm)" value={newElevation} step={1} integer onCommit={setNewElevation} />
        <button
          onClick={() => {
            props.onAdd(newName, newElevation);
            setNewName("");
          }}
        >
          Add level
        </button>
      </div>
    </>
  );
}
