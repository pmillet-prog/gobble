import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { ChalkboardRenderer } from "../../src/features/chalkboard/chalkboardRenderer.js";
import { getElementBounds } from "../../src/features/chalkboard/chalkboardModel.js";
import { createEraserGesture, appendEraserGesture } from "../../src/features/chalkboard/chalkboardEraserGesture.js";

const canvas = () => { const node = createCanvas(800, 500); node.style = {}; return node; };
globalThis.document = { createElement: canvas };
globalThis.window = { devicePixelRatio: 1 };
const view = { width: 800, height: 500, scale: .5, scrollLeft: 0 };
const entry = (id, color, canErase, y = 200) => {
  const stroke = { type: "stroke", id, seed: 42, color, size: 30, points: [{ x: 100, y }, { x: 600, y }] };
  return { id, elements: [stroke], bounds: getElementBounds(stroke), canErase };
};
const pixels = renderer => renderer.canvas.getContext("2d").getImageData(0, 0, 800, 500).data;
const samePixels = (a, b) => Buffer.from(a).equals(Buffer.from(b));

test("the sponge hides other authors, preserves its author's pixels, and restores everybody on exit", () => {
  const mine = entry("mine", "#ffffff", true);
  const other = entry("other", "#ff0000", false, 500);
  const renderer = new ChalkboardRenderer(canvas());
  renderer.setInterventions([mine, other], 1, "week");
  renderer.render(view);
  const all = new Uint8ClampedArray(pixels(renderer));
  renderer.render({ ...view, onlyOwn: true });
  const reference = new ChalkboardRenderer(canvas());
  reference.setInterventions([mine], 1, "week");
  reference.render(view);
  assert.ok(samePixels(pixels(renderer), pixels(reference)), "author pixels should not change on selection");
  assert.ok(!samePixels(pixels(renderer), all), "other authors should be hidden");
  renderer.render(view);
  assert.ok(samePixels(pixels(renderer), all), "leaving the sponge restores all authors");
  renderer.destroy(); reference.destroy();
});

test("incremental sponge pixels match complete recomposition, including undo, tile boundaries and scroll", () => {
  const entries = [entry("one", "#ffffff", true), entry("two", "#ff0000", true, 230)];
  const fast = new ChalkboardRenderer(canvas()), reference = new ChalkboardRenderer(canvas());
  for (const renderer of [fast, reference]) renderer.setInterventions(entries, 1, "week");
  fast.render({ ...view, onlyOwn: true });
  const gesture = createEraserGesture(470, 200, 90, entries);
  for (let step = 0; step < 8; step++) {
    appendEraserGesture(gesture, 470 + step * 20, 200);
    fast.render({ ...view, onlyOwn: true, draftElements: gesture.masks });
    reference.render({ ...view, draftElements: gesture.masks });
  }
  const actual = pixels(fast), expected = pixels(reference);
  // Composing pre-rasterized tiles can differ only at antialiased edges by
  // rounding. No visibly retained/removed marks may differ.
  let significant = 0;
  for (let index = 3; index < actual.length; index += 4) if (Math.abs(actual[index] - expected[index]) > 8) significant++;
  assert.ok(significant < 80, `different alpha pixels: ${significant}`);
  fast.render({ ...view, onlyOwn: true, scrollLeft: 200, draftElements: gesture.masks });
  fast.render({ ...view, onlyOwn: true, draftElements: [] });
  reference.render(view);
  assert.ok(samePixels(pixels(fast), pixels(reference)), "undo must restore original pixels");
  fast.destroy(); reference.destroy();
});

test("world-anchored ink follows native scrolling without waiting for a repaint", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const reference = new ChalkboardRenderer(canvas());
  const entries = [entry("mine", "#ffffff", true)];
  renderer.setInterventions(entries, 1, "week");
  reference.setInterventions(entries, 1, "week");
  const mobile = { width: 390, height: 500, scale: .5, scrollLeft: 0 };
  renderer.renderWorldView(mobile);
  const origin = Number.parseFloat(renderer.canvas.style.left);
  const nativeScroll = 130;
  // Crop the existing backing canvas as the browser does while scrolling.
  // No render or React update occurs on the world renderer here.
  const actual = renderer.canvas.getContext("2d").getImageData(nativeScroll - origin, 0, 390, 500).data;
  reference.render({ ...mobile, scrollLeft: nativeScroll });
  const expected = reference.canvas.getContext("2d").getImageData(0, 0, 390, 500).data;
  assert.ok(samePixels(actual, expected), "ink must track the background before the scroll callback");
  renderer.renderWorldView({ ...mobile, scrollLeft: 140 });
  assert.equal(Number.parseFloat(renderer.canvas.style.left), origin);
  assert.ok(renderer.canvas.width <= 390 * 3);
  renderer.destroy(); reference.destroy();
});
