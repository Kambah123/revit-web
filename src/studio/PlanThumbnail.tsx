import { useId } from "react";
import type { Project } from "../model/types";
/** An actual projection of the project's geometry, also used for its dashboard preview. */
export function PlanThumbnail({ project }: { project: Project }) {
  const id = useId().replace(/:/g, "");
  const walls = project.walls.filter(
    (w) => w.levelId === project.levels[0]?.id,
  );
  if (!walls.length)
    return (
      <svg
        className="plan-thumbnail blank-plan"
        viewBox="0 0 340 220"
        aria-label="Empty project preview"
      >
        <path d="M140 85h60v50h-60Z" />
        <path d="M155 110h30m-15-15v30" />
      </svg>
    );
  const pts = walls.flatMap((w) => [w.start, w.end]);
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => -p.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    w = Math.max(...xs) - minX,
    h = Math.max(...ys) - minY,
    pad = Math.max(w, h) * 0.13;
  return (
    <svg
      className="plan-thumbnail"
      viewBox={`${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`}
      aria-label={`${project.name} floor plan`}
    >
      <defs>
        <pattern id={id} width="180" height="180" patternUnits="userSpaceOnUse">
          <path d="M0 180 180 0" stroke="#e2e8f0" strokeWidth="13" />
        </pattern>
      </defs>
      {project.rooms
        .filter((r) => r.levelId === project.levels[0]?.id)
        .map((r, i) => {
          const cx =
              r.boundary.reduce((a, p) => a + p.x, 0) / r.boundary.length,
            cy = -r.boundary.reduce((a, p) => a + p.y, 0) / r.boundary.length;
          return (
            <g key={r.id}>
              <polygon
                points={r.boundary.map((p) => `${p.x},${-p.y}`).join(" ")}
                fill={i === 0 ? `url(#${id})` : i % 2 ? "#f1f5f9" : "#f8fafc"}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                fill="#64748b"
                fontSize={Math.max(w, h) * 0.019}
                fontFamily="sans-serif"
              >
                {r.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      {walls.map((wall) => (
        <g key={wall.id}>
          <line
            x1={wall.start.x}
            y1={-wall.start.y}
            x2={wall.end.x}
            y2={-wall.end.y}
            stroke="#475569"
            strokeWidth={
              (project.wallTypes.find((t) => t.id === wall.wallTypeId)
                ?.thickness ?? 200) + 45
            }
          />
          <line
            x1={wall.start.x}
            y1={-wall.start.y}
            x2={wall.end.x}
            y2={-wall.end.y}
            stroke="#fcfcfa"
            strokeWidth={
              project.wallTypes.find((t) => t.id === wall.wallTypeId)
                ?.thickness ?? 200
            }
          />
        </g>
      ))}
      {project.openings.map((o) => {
        const wall = walls.find((w) => w.id === o.hostWallId),
          t = project.openingTypes.find((t) => t.id === o.openingTypeId);
        if (!wall || !t) return null;
        const len = Math.hypot(
            wall.end.x - wall.start.x,
            wall.end.y - wall.start.y,
          ),
          dx = (wall.end.x - wall.start.x) / len,
          dy = -(wall.end.y - wall.start.y) / len,
          cx = wall.start.x + dx * o.offset,
          cy = -wall.start.y + dy * o.offset,
          angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <g key={o.id} transform={`translate(${cx} ${cy}) rotate(${angle})`}>
            <path
              d={`M${-t.width / 2} 0H${t.width / 2}`}
              stroke="#fafbf9"
              strokeWidth="240"
            />
            {t.kind === "window" ? (
              <path
                d={`M${-t.width / 2} 0H${t.width / 2}`}
                stroke="#828f91"
                strokeWidth="38"
              />
            ) : (
              <path
                d={`M${-t.width / 2} 0v${t.width}M${-t.width / 2} ${t.width}A${t.width} ${t.width} 0 0 0 ${t.width / 2} 0`}
                fill="none"
                stroke="#969b94"
                strokeWidth="25"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
