import test from "node:test";
import assert from "node:assert/strict";
import { chalkboardScale, resizeChalkboardViewport } from "./chalkboardViewport.js";
import { getChalkboardPointer, getChalkboardCanvasWindow } from "./chalkboardCanvasWindow.js";
import { CHALKBOARD_WORLD } from "./chalkboardModel.js";

const phone = { width: 390, height: 600, scrollLeft: 1500, scrollTop: 0 };
const center = view => getChalkboardPointer({ clientX: view.width / 2, clientY: view.height / 2 },
  { left: 0, top: 0 }, view.scrollLeft, chalkboardScale(view), view.scrollTop);

test("portrait, landscape and keyboard resizes fill the board height and retain the visible center", () => {
  let current = phone;
  for (const [width, height] of [[844, 260], [915, 305], [667, 210], [740, 145], [390, 600]]) {
    const resized = resizeChalkboardViewport(current, { width, height });
    assert.ok(Math.abs(center(resized).worldX - center(current).worldX) < 1e-8);
    assert.ok(Math.abs(center(resized).worldY - CHALKBOARD_WORLD.height / 2) < 1e-8);
    assert.equal(resized.scrollTop, 0);
    assert.equal(chalkboardScale(resized) * CHALKBOARD_WORLD.height, height);
    const canvas = getChalkboardCanvasWindow({ ...resized, scale: chalkboardScale(resized) });
    assert.ok(canvas.width <= width * 3);
    assert.equal(canvas.height, height);
    current = resized;
  }
  assert.ok(Math.abs(current.scrollLeft - phone.scrollLeft) < 1e-8);
});

test("rotation near either edge clamps scrolling without leaving blank space above or below", () => {
  for (const scrollLeft of [0, 14010]) for (const [width, height] of [[915, 260], [320, 600], [1200, 180]]) {
    const resized = resizeChalkboardViewport({ ...phone, scrollLeft, scrollTop: 200 }, { width, height });
    assert.ok(resized.scrollLeft >= 0);
    assert.ok(resized.scrollLeft + width <= CHALKBOARD_WORLD.width * chalkboardScale(resized));
    assert.equal(resized.scrollTop, 0);
    assert.equal(chalkboardScale(resized) * CHALKBOARD_WORLD.height, height);
  }
});
