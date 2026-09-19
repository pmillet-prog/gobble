import test from "node:test";
import assert from "node:assert/strict";
import { chalkboardScale, resizeChalkboardViewport } from "./chalkboardViewport.js";
import { getChalkboardPointer, getChalkboardCanvasWindow } from "./chalkboardCanvasWindow.js";
import { getChalkboardTextViewport, layoutChalkboardText } from "./chalkboardTextLayout.js";

const phone = { width: 390, height: 600, zoom: 1, scrollLeft: 1500, scrollTop: 0 };
const center = view => getChalkboardPointer({ clientX: view.width / 2, clientY: view.height / 2 },
  { left: 0, top: 0 }, view.scrollLeft, chalkboardScale(view), view.scrollTop);

test("zoom retains the world point under the viewport center, including vertical scrolling", () => {
  const zoomed = resizeChalkboardViewport(phone, { zoom: 2 });
  assert.equal(center(zoomed).worldX, center(phone).worldX);
  assert.equal(center(zoomed).worldY, center(phone).worldY);
  assert.ok(zoomed.scrollTop > 0);
  assert.deepEqual(resizeChalkboardViewport(zoomed, { zoom: 1 }), phone);
});

test("zoom out and board edges never produce unreachable scroll positions", () => {
  const wide = resizeChalkboardViewport(phone, { zoom: .5 });
  assert.equal(wide.scrollTop, 0);
  assert.equal(center(wide).worldX, center(phone).worldX);
  for (const zoom of [.5, 1, 2]) {
    const edge = resizeChalkboardViewport({ ...phone, scrollLeft: 14010 }, { zoom });
    assert.ok(edge.scrollLeft >= 0 && edge.scrollLeft + edge.width <= 24000 * chalkboardScale(edge));
  }
});

test("resizing a zoomed phone retains both center coordinates and bounds the canvas", () => {
  const zoomed = resizeChalkboardViewport(phone, { zoom: 2 });
  const resized = resizeChalkboardViewport(zoomed, { width: 600, height: 390 });
  assert.ok(Math.abs(center(resized).worldX - center(zoomed).worldX) < 1e-8);
  assert.ok(Math.abs(center(resized).worldY - center(zoomed).worldY) < 1e-8);
  const canvas = getChalkboardCanvasWindow({ ...resized, height: resized.height * resized.zoom, scale: chalkboardScale(resized) });
  assert.ok(canvas.width <= resized.width * 3);
  assert.equal(canvas.height, 780);
});

test("text placement uses the zoomed visible height and width", () => {
  const viewport = { width: 800, height: 600, scale: 1.2 };
  const visible = getChalkboardTextViewport(viewport);
  assert.equal(visible.width, 800 / 1.2);
  assert.equal(visible.height, 500);
  const element = layoutChalkboardText("UN MESSAGE A LIRE EN ZOOMANT SUR LE GRAND TABLEAU", "chalk", viewport, text => text.length * 30);
  assert.ok(element.width * element.scale * viewport.scale <= viewport.width);
});
