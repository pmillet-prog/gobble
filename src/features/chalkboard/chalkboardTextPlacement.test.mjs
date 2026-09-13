import test from "node:test";
import assert from "node:assert/strict";
import { findChalkboardTextPlacement } from "./chalkboardTextPlacement.js";
import { boundsIntersect, getElementBounds } from "./chalkboardModel.js";

const text = { type: "text", cx: 500, cy: 500, width: 600, fontSize: 68, scale: 1, angle: 0 };

test("direct writing uses the current location when it is clear", () => {
  assert.deepEqual(findChalkboardTextPlacement(text), { cx: 500, cy: 500 });
});

test("consecutive messages occupy separate spaces and can continue farther along the board", () => {
  const occupied = [];
  let crossedFirstScreen = false;
  for (let index = 0; index < 30; index++) {
    const position = findChalkboardTextPlacement(text, occupied);
    assert.ok(position);
    const bounds = getElementBounds({ ...text, ...position });
    assert.equal(occupied.some(other => boundsIntersect(bounds, other)), false);
    assert.ok(bounds.minX >= 0 && bounds.maxX <= 24000 && bounds.minY >= 0 && bounds.maxY <= 1000);
    crossedFirstScreen ||= position.cx > 1500;
    occupied.push(bounds);
  }
  assert.equal(crossedFirstScreen, true);
});

test("a full board requires manual placement instead of silently overlapping a message", () => {
  assert.equal(findChalkboardTextPlacement(text, [{ minX: 0, minY: 0, maxX: 24000, maxY: 1000 }]), null);
});
