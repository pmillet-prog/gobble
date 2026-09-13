import test from "node:test";
import assert from "node:assert/strict";
import { getChalkboardCanvasWindow, getChalkboardPointer } from "./chalkboardCanvasWindow.js";

const phone = { width: 390, height: 650, scale: .65, scrollLeft: 0 };
test("native scrolling retains a fixed world anchor while the visible area stays within the buffer", () => {
  const first = getChalkboardCanvasWindow(phone);
  assert.equal(first.left, 0);
  assert.equal(first.width, 1170);
  const next = getChalkboardCanvasWindow({ ...phone, scrollLeft: 350 }, first);
  assert.equal(next, first);
  // Even if no JS frame runs at all, both layers move by the browser's scroll.
  const markWorldX = 700, nativeScroll = 350;
  const markScreenX = (markWorldX * phone.scale - first.left) + first.left - nativeScroll;
  const backgroundScreenX = markWorldX * phone.scale - nativeScroll;
  assert.equal(markScreenX, backgroundScreenX);
});

test("rebasing and distant jumps cover the visible board with a bounded canvas", () => {
  let window = null;
  for (const scrollLeft of [0, 350, 900, 2500, 13000, 15210, 30, -40]) {
    window = getChalkboardCanvasWindow({ ...phone, scrollLeft }, window);
    const clamped = Math.max(0, Math.min(15210, scrollLeft));
    assert.ok(window.left <= clamped);
    assert.ok(window.left + window.width >= clamped + phone.width);
    assert.ok(window.width <= phone.width * 3);
    assert.ok(window.left + window.width <= 24000 * phone.scale);
  }
});

test("orientation and keyboard resizing invalidate the canvas window", () => {
  const first = getChalkboardCanvasWindow({ ...phone, scrollLeft: 2500 });
  const resized = getChalkboardCanvasWindow({ width: 780, height: 320, scale: .32, scrollLeft: 1100 }, first);
  assert.notEqual(first, resized);
  assert.equal(resized.height, 320);
  assert.equal(resized.width, 2340);
});

test("drawing and eraser coordinates use native scroll position, independently of the canvas origin", () => {
  const rect = { left: 12, top: 80 };
  const point = getChalkboardPointer({ clientX: 142, clientY: 210 }, rect, 1040, .65);
  assert.deepEqual(point, { screenX: 130, screenY: 130, worldX: 1800, worldY: 200 });
  assert.equal(getChalkboardPointer({ clientX: 0, clientY: 0 }, rect, -40, .65).worldX, 0);
});
