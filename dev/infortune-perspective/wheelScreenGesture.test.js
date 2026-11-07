import test from "node:test";
import assert from "node:assert/strict";
import { createProjection, STAGE_CAMERA } from "./projection.js";
import { screenGestureTravel, screenWheelDiameter } from "./wheelScreenGesture.js";

test("the same relative finger slide has the same power at different screen sizes, radii and focal lengths", () => {
  for (const width of [320, 760]) for (const focal of [14, 28, 85]) for (const radius of [0.18, 0.42]) {
    const projection = createProjection(width, width / 1.3, { ...STAGE_CAMERA, focal });
    const diameter = screenWheelDiameter(projection);
    const travel = screenGestureTravel({ x: 0, y: 0 }, { x: diameter * 0.1, y: 0 }, { angle: Math.PI / 2, radius }, projection);
    assert.ok(Math.abs(travel - 0.1) < 1e-10);
    const radial = screenGestureTravel({ x: 0, y: 0 }, { x: 0, y: width * 0.1 }, { angle: Math.PI / 2, radius }, projection);
    assert.ok(Math.abs(radial) < 1e-10, "Sliding toward the hub must not charge rotation");
  }
});

test("extra room beside the wheel does not weaken the same touch gesture", () => {
  const travels = [390, 844, 1366].map(width => {
    const initial = createProjection(width, 400, STAGE_CAMERA);
    // Keep the rendered wheel at 300 CSS px while changing the surrounding room.
    const projection = createProjection(width, 400, { ...STAGE_CAMERA, framing: STAGE_CAMERA.framing * 300 / screenWheelDiameter(initial) });
    assert.ok(Math.abs(screenWheelDiameter(projection) - 300) < 1e-10);
    return screenGestureTravel({ x: 0, y: 0 }, { x: 120, y: 0 }, { angle: Math.PI / 2, radius: 0.3 }, projection);
  });
  for (const travel of travels) assert.ok(Math.abs(travel - travels[0]) < 1e-10);
});
