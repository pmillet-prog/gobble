import test from "node:test";
import assert from "node:assert/strict";
import { createProjection, STAGE_CAMERA } from "./projection.js";
import { screenGestureTravel } from "./wheelScreenGesture.js";

test("the same relative finger slide has the same power at different screen sizes, radii and focal lengths", () => {
  for (const width of [320, 760]) for (const focal of [14, 28, 85]) for (const radius of [0.18, 0.42]) {
    const projection = createProjection(width, width / 1.3, { ...STAGE_CAMERA, focal });
    const travel = screenGestureTravel({ x: 0, y: 0 }, { x: width * 0.1, y: 0 }, { angle: Math.PI / 2, radius }, projection);
    assert.ok(Math.abs(travel - 0.1) < 1e-10);
    const radial = screenGestureTravel({ x: 0, y: 0 }, { x: 0, y: width * 0.1 }, { angle: Math.PI / 2, radius }, projection);
    assert.ok(Math.abs(radial) < 1e-10, "Sliding toward the hub must not charge rotation");
  }
});
