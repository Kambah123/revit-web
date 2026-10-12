import type { VisualStyle } from "../viewer/BimScene";

export const SCALES = [20, 50, 100, 200, 500] as const;
export const DETAIL_LEVELS = ["Coarse", "Medium", "Fine"] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

interface ViewControlBarProps {
  view: "plan" | "3d";
  onView(view: "plan" | "3d"): void;
  scale: number;
  onScale(scale: number): void;
  detail: DetailLevel;
  onDetail(detail: DetailLevel): void;
  visualStyle: VisualStyle;
  onVisualStyle(style: VisualStyle): void;
  shadows: boolean;
  onShadows(on: boolean): void;
}

/** The view control bar pinned to the bottom of the viewport. Every control drives real view state. */
export function ViewControlBar(props: ViewControlBarProps) {
  return (
    <div className="view-control-bar" role="toolbar" aria-label="View controls">
      <div className="group" role="group" aria-label="View mode">
        <button className={props.view === "plan" ? "active" : ""} onClick={() => props.onView("plan")} title="Orthographic plan">
          Plan
        </button>
        <button className={props.view === "3d" ? "active" : ""} onClick={() => props.onView("3d")} title="Perspective 3D view">
          3D
        </button>
      </div>
      <label title="Annotation scale (paper denominator). Room labels follow the scale.">
        Scale
        <select value={props.scale} onChange={(e) => props.onScale(Number(e.target.value))}>
          {SCALES.map((s) => (
            <option key={s} value={s}>
              1:{s}
            </option>
          ))}
        </select>
      </label>
      <label title="Detail level. Coarse hides room labels; finer levels keep them.">
        Detail
        <select value={props.detail} onChange={(e) => props.onDetail(e.target.value as DetailLevel)}>
          {DETAIL_LEVELS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label title="Visual style of the viewport.">
        Style
        <select value={props.visualStyle} onChange={(e) => props.onVisualStyle(e.target.value as VisualStyle)}>
          <option value="shaded">Shaded</option>
          <option value="hiddenLine">Hidden line</option>
          <option value="wireframe">Wireframe</option>
        </select>
      </label>
      <label title="Cast shadows from the sun.">
        <input
          type="checkbox"
          checked={props.shadows}
          onChange={(e) => props.onShadows(e.target.checked)}
        />
        Shadows
      </label>
    </div>
  );
}
