import test from "node:test";
import assert from "node:assert/strict";
import { fitArchiveView, constrainArchiveView, zoomArchiveAt, moveArchiveGesture } from "./chalkboardArchiveView.js";

const size = { width: 390, height: 600, imageWidth: 24000, imageHeight: 1000 };
test("panorama opens at readable height and overview fits the entire image", () => {
  assert.deepEqual(fitArchiveView(size), { scale: .6, x: 0, y: 0 });
  const overview = fitArchiveView(size, true);
  assert.equal(overview.scale * size.imageWidth, size.width);
  assert.equal(overview.y, (size.height - overview.scale * size.imageHeight) / 2);
});
test("zoom stays anchored under the finger while clamping overscroll and excessive zoom", () => {
  const start = { x: -500, y: -100, scale: 1 };
  const point = { x: 120, y: 220 };
  const result = zoomArchiveAt(start, 2, point, size);
  assert.equal((point.x - result.x) / result.scale, (point.x - start.x) / start.scale);
  assert.equal((point.y - result.y) / result.scale, (point.y - start.y) / start.scale);
  const clamped = constrainArchiveView({ x: -1e6, y: 1e6, scale: 500 }, size);
  assert.deepEqual(clamped, { scale: 3, x: size.width - size.imageWidth * 3, y: 0 });
});
test("pinching combines zoom and midpoint movement, then one remaining finger pans without a jump", () => {
  const start = { x: -500, y: -100, scale: 1 };
  const pinch = moveArchiveGesture(start, [{ x: 100, y: 200 }, { x: 200, y: 200 }], [{ x: 80, y: 240 }, { x: 280, y: 240 }], size);
  assert.equal(pinch.scale, 2);
  assert.equal((180 - pinch.x) / pinch.scale, (150 - start.x) / start.scale);
  assert.equal((240 - pinch.y) / pinch.scale, (200 - start.y) / start.scale);
  const pan = moveArchiveGesture(pinch, [{ x: 80, y: 240 }], [{ x: 100, y: 230 }], size);
  assert.equal(pan.scale, pinch.scale);
  assert.equal(pan.x, pinch.x + 20);
  assert.equal(pan.y, pinch.y - 10);
});
test("both image ends remain bounded at phone and desktop viewport sizes", () => {
  for (const width of [320, 390, 1440]) {
    const viewport = { ...size, width };
    for (const scale of [.001, .6, 1, 3, 100]) {
      const view = constrainArchiveView({ scale, x: -1e8, y: -1e8 }, viewport);
      assert.ok(view.scale * size.imageWidth >= width - 1e-6);
      assert.ok(view.x + view.scale * size.imageWidth >= width - 1e-6);
      assert.ok(view.y + view.scale * size.imageHeight >= Math.min(size.height, view.scale * size.imageHeight));
    }
  }
});
