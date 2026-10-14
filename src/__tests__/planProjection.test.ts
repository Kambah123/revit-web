import { describe, expect, it } from "vitest";
import { Vector3, Matrix4, Shape, Vector2, ExtrudeGeometry } from "three";
import { planShapeCoordinates } from "../geometry/planProjection";
describe("plan shape to native scene projection", () => {
  it.each([
    { x: 3200, y: 4100 },
    { x: -800, y: -5600 },
    { x: 0, y: 2000 },
  ])("does not mirror an off-origin plan vertex %j", (p) => {
    const [x, y] = planShapeCoordinates(p);
    const world = new Vector3(x, y, 0).applyMatrix4(
      new Matrix4().makeRotationX(-Math.PI / 2),
    );
    expect(world.x).toBeCloseTo(p.x / 1000);
    expect(world.y).toBeCloseTo(0);
    expect(world.z).toBeCloseTo(-p.y / 1000);
  });
  it("extrudes a positive-Y plan boundary upward without moving it across the origin", () => {
    const points = [
      { x: 1000, y: 2000 },
      { x: 4000, y: 2000 },
      { x: 4000, y: 5000 },
      { x: 1000, y: 5000 },
    ];
    const shape = new Shape(
      points.map((p) => new Vector2(...planShapeCoordinates(p))),
    );
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.2,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.z).toBeCloseTo(-5);
    expect(geometry.boundingBox!.max.z).toBeCloseTo(-2);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(0.2);
    geometry.dispose();
  });
});
