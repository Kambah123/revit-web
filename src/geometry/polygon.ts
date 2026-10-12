import type { Point, Polygon } from "../model/types";

/**
 * Integer-safe polygon helpers. Signed areas are computed as exact "twice the area" integers
 * (shoelace) for integer coordinates; floating point appears only in display-scale quantities.
 */

/** Twice the signed area of a polygon (shoelace). Positive for counter-clockwise vertices. */
export function polygonArea2(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/** Signed area in square millimetres. */
export function polygonAreaMm2(poly: Polygon): number {
  return polygonArea2(poly) / 2;
}

/** Absolute area in square millimetres. */
export function polygonAbsAreaMm2(poly: Polygon): number {
  return Math.abs(polygonAreaMm2(poly));
}

/** Perimeter in millimetres (float; derived only). */
export function polygonPerimeterMm(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** Centroid of the polygon area, rounded to integer millimetres. Falls back to the vertex mean for degenerate cases. */
export function polygonCentroid(poly: Polygon): Point {
  const a2 = polygonArea2(poly);
  if (a2 !== 0) {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const cross = a.x * b.y - b.x * a.y;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }
    return { x: Math.round(cx / (3 * a2)), y: Math.round(cy / (3 * a2)) };
  }
  const sx = poly.reduce((s, p) => s + p.x, 0);
  const sy = poly.reduce((s, p) => s + p.y, 0);
  return { x: Math.round(sx / poly.length), y: Math.round(sy / poly.length) };
}

export function polygonBounds(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function orientation(a: Point, b: Point, c: Point): number {
  // Exact for integer coordinates within safe range: (b-a) × (c-a).
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/** True when segments a-b and c-d intersect (including collinear overlap or endpoint touching). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  // Strict crossing: the endpoints of each segment lie on opposite sides of the other.
  // Compare signs (not values) and keep the product small to stay in safe integer range.
  const s1 = Math.sign(o1);
  const s2 = Math.sign(o2);
  const s3 = Math.sign(o3);
  const s4 = Math.sign(o4);
  return s1 * s2 === -1 && s3 * s4 === -1;
}

/**
 * True when any two non-adjacent edges of the polygon intersect. Adjacent edges share one vertex
 * and are allowed to meet there.
 */
export function isSelfIntersecting(poly: Polygon): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j === i) continue;
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const c = poly[j];
      const d = poly[(j + 1) % n];
      if (adjacent) continue;
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Even-odd point-in-polygon test. Points on the boundary may return either result. */
export function pointInPolygon(point: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > point.y !== b.y > point.y) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Checks a boundary polygon against the model rules (DECISIONS.md D8). Returns a readable message
 * or null when the polygon is acceptable.
 */
export function boundaryError(poly: unknown): string | null {
  if (!Array.isArray(poly)) return "A boundary must be a list of points.";
  if (poly.length < 3) return "A boundary needs at least three points.";
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i] as Partial<Point> | null;
    if (typeof p !== "object" || p === null) return "A boundary must be a list of points.";
    if (typeof p.x !== "number" || typeof p.y !== "number" || !Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y)) {
      return "Boundary points must be whole millimetres.";
    }
  }
  const points = poly as Polygon;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a.x === b.x && a.y === b.y) return "A boundary cannot repeat a point twice in a row.";
  }
  if (isSelfIntersecting(points)) return "A boundary cannot cross itself.";
  if (polygonArea2(points) === 0) return "A boundary cannot have zero area.";
  return null;
}

/**
 * Checks that a polygon is an axis-aligned rectangle (the simple roof footprint rule).
 * Returns a readable message or null. Vertices may start at any corner and run either direction.
 */
export function rectangleError(poly: unknown): string | null {
  const base = boundaryError(poly);
  if (base) return base;
  const points = poly as Polygon;
  if (points.length !== 4) return "A roof footprint must be a rectangle with four points.";
  const xs = [...new Set(points.map((p) => p.x))];
  const ys = [...new Set(points.map((p) => p.y))];
  if (xs.length !== 2 || ys.length !== 2) return "A roof footprint must be an axis-aligned rectangle.";
  return null;
}

/** Bounds of an axis-aligned rectangle polygon. Call after `rectangleError` returned null. */
export function rectangleBounds(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  return polygonBounds(poly);
}
