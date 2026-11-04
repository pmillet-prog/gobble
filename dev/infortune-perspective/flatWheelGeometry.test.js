import test from "node:test";
import assert from "node:assert/strict";
import { flatWheelPoint, flatWheelTravel } from "./flatWheelGeometry.js";

test("2D touch coordinates account for square letterboxing on portrait and landscape viewports", () => {
  for (const [width, height] of [[390, 300], [300, 390], [800, 600]]) {
    const side = Math.min(width, height), scale = side / 640;
    const x = (width - side) / 2 + 320 * scale, y = (height - side) / 2 + 64 * scale;
    const point = flatWheelPoint(x, y, width, height);
    assert.equal(point.angle, -Math.PI / 2); assert.ok(Math.abs(point.radius - 270 / 640) < 1e-10);
    assert.equal(flatWheelTravel({ x, y }, { x: x + width / 10, y }, point, width), 0.1);
  }
});
