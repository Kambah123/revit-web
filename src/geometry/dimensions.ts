import type { Dimension, Point } from "../model/types";
/** Aligned, static linear measurement. Stored points never follow other elements. */
export function dimensionGeometry(
  d: Pick<Dimension, "start" | "end" | "offset">,
) {
  const length = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
  if (!Number.isFinite(length) || length < 1)
    throw new Error("Dimension points must be at least 1 mm apart.");
  const axis = {
    x: (d.end.x - d.start.x) / length,
    y: (d.end.y - d.start.y) / length,
  };
  const normal = { x: -axis.y, y: axis.x };
  const shift = (p: Point, n: number): Point => ({
    x: p.x + normal.x * n,
    y: p.y + normal.y * n,
  });
  const a = shift(d.start, d.offset),
    b = shift(d.end, d.offset),
    sign = Math.sign(d.offset) || 1;
  const tick = (p: Point): [Point, Point] => [
    { x: p.x - (axis.x + normal.x) * 100, y: p.y - (axis.y + normal.y) * 100 },
    { x: p.x + (axis.x + normal.x) * 100, y: p.y + (axis.y + normal.y) * 100 },
  ];
  const segments: [Point, Point][] = [
    [a, b],
    [d.start, shift(a, sign * 150)],
    [d.end, shift(b, sign * 150)],
    tick(a),
    tick(b),
  ];
  return {
    length,
    axis,
    normal,
    a,
    b,
    segments,
    label: shift({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, sign * 420),
  };
}
export function dimensionOffset(start: Point, end: Point, at: Point): number {
  const { normal } = dimensionGeometry({ start, end, offset: 0 });
  return Math.round((at.x - start.x) * normal.x + (at.y - start.y) * normal.y);
}
export function dimensionLabel(
  d: Pick<Dimension, "start" | "end" | "unit">,
): string {
  const mm = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
  return d.unit === "m"
    ? `${(mm / 1000).toFixed(3)} m`
    : `${Number(mm.toFixed(1))} mm`;
}
