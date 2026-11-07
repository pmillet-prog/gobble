import test from "node:test";
import assert from "node:assert/strict";
import { flatWheelLayout, flatWheelPoint, flatWheelTravel, flatWheelDiameter } from "./flatWheelGeometry.js";

test("2D pointers follow the wheel below or between the contestant desks", () => {
  for (const [width, height] of [[390, 514], [300, 430], [550, 724], [560, 475], [800, 678], [280, 320], [240, 250], [300,190], [824,154]]) {
    const { side, left, top, compact, shallow } = flatWheelLayout(width, height), scale = side / 640;
    assert.ok(left >= 0 && left + side <= width);
    assert.ok(top >= (shallow ? 12 : compact ? height < 420 ? 112 : 150 : 72));
    assert.ok(top + side <= height - (shallow ? 8 : 40));
    if (shallow) { assert.ok(left>=width*.25);assert.ok(left+side<=width*.75);assert.ok(side>=width*.4||side>=height-20); }
    const x = left + 320 * scale, y = top + 64 * scale;
    const point = flatWheelPoint(x, y, width, height);
    assert.equal(point.angle, -Math.PI / 2); assert.ok(Math.abs(point.radius - 270 / 640) < 1e-10);
    const diameter = flatWheelDiameter(width, height);
    assert.ok(Math.abs(flatWheelTravel({ x, y }, { x: x + diameter / 10, y }, point, diameter) - 0.1) < 1e-10);
    const right = flatWheelPoint(left + 590 * scale, top + 334 * scale, width, height);
    assert.ok(Math.abs(right.angle) < 1e-10); assert.ok(Math.abs(right.radius - 270 / 640) < 1e-10);
  }
});

test("touch power uses the wheel diameter even when a wide stage leaves a small wheel", () => {
  const narrow = flatWheelDiameter(700, 400), wide = flatWheelDiameter(1366, 400);
  assert.equal(narrow, wide);
  assert.equal(flatWheelTravel({ x: 0, y: 0 }, { x: 100, y: 0 }, { angle: -Math.PI / 2 }, narrow),
    flatWheelTravel({ x: 0, y: 0 }, { x: 100, y: 0 }, { angle: -Math.PI / 2 }, wide));
});
