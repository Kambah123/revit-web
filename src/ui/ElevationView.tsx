import { useMemo } from "react";
import type { Project } from "../model/types";
import {
  buildElevation,
  elevationTitle,
  type ElevRect,
  type ElevationDirection,
} from "../geometry/elevation";

interface ElevationViewProps {
  project: Project;
  direction: ElevationDirection;
}

/**
 * A generated elevation: an SVG projection of the canonical model (walls, openings, slabs,
 * columns, roof silhouettes, level datums). SVG y is inverted (y = -z) so elevations read
 * upright. Read-only: modelling tools do not apply here.
 */
export function ElevationView({ project, direction }: ElevationViewProps) {
  const drawing = useMemo(() => buildElevation(project, direction), [project, direction]);
  const { minU, maxU, minZ, maxZ } = drawing;
  const width = maxU - minU;
  const height = maxZ - minZ;
  // y = -z: higher elevation maps to smaller SVG y.
  const viewBox = `${minU} ${-maxZ} ${width} ${height}`;
  const font = Math.round(height / 36);

  const rect = (s: ElevRect, i: number) => (
    <rect
      key={`${s.kind}-${i}`}
      className={`elev-${s.kind}`}
      x={Math.min(s.u0, s.u1)}
      y={-s.z1}
      width={Math.abs(s.u1 - s.u0)}
      height={s.z1 - s.z0}
    />
  );

  return (
    <div className="elevation-host" data-direction={direction}>
      <svg className="elevation-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={elevationTitle(direction)}>
        {drawing.shapes.map((s, i) =>
          s.kind === "roof" ? (
            <polygon
              key={`roof-${i}`}
              className="elev-roof"
              points={s.hull.map((pt) => `${pt.u},${-pt.z}`).join(" ")}
            />
          ) : (
            rect(s, i)
          ),
        )}
        {/* Level datums draw over the building, as on a real elevation sheet. */}
        {drawing.levels.map((l) => (
          <g key={l.levelId}>
            <line className="elev-level" x1={minU} y1={-l.z} x2={maxU} y2={-l.z} />
            <circle className="elev-level-tick" cx={minU + font * 0.6} cy={-l.z} r={font * 0.5} />
            <text className="elev-label" x={minU + font * 1.6} y={-l.z - font * 0.35} fontSize={font}>
              {l.name} · {l.z} mm
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
