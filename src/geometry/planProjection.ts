import type { Point } from "../model/types";
/** Local Shape coordinates before a -PI/2 X rotation.
 * Local +y becomes world -z; negating y here would mirror off-origin rooms/slabs.
 * Local extrusion +z becomes world +y (height).
 */
export function planShapeCoordinates(point: Point): [number, number] {
  return [point.x / 1000, point.y / 1000];
}
