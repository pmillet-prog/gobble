import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import { ChalkboardRenderer } from "../../src/features/chalkboard/chalkboardRenderer.js";
import { getElementBounds } from "../../src/features/chalkboard/chalkboardModel.js";
import { createEraserGesture, appendEraserGesture } from "../../src/features/chalkboard/chalkboardEraserGesture.js";

const canvas = () => Object.assign(createCanvas(1, 1), { style: {} });
globalThis.document = { createElement: canvas };
globalThis.window = { devicePixelRatio: 1 };

function contribution(id, canErase, points, color = "#ffffff") {
  const stroke = { id, type: "stroke", seed: 42, color, size: 20, points };
  return { id, canErase, elements: [stroke], bounds: getElementBounds(stroke) };
}

const own = contribution("mine", true, [
  { x: 160, y: 180 }, { x: 1120, y: 180 }, { x: 1120, y: 800 },
  { x: 160, y: 800 }, { x: 160, y: 180 },
]);
const other = contribution("other", false, [{ x: 160, y: 920 }, { x: 1100, y: 920 }], "#ff0000");

function pixels(renderer) {
  const { canvas } = renderer;
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
}

function footprintDifference(before, after) {
  let ink = 0, missing = 0, extra = 0;
  for (let index = 3; index < before.length; index += 4) {
    if (before[index] > 64) {
      ink++;
      if (after[index] < 32) missing++;
    } else if (before[index] < 32 && after[index] > 64) extra++;
  }
  assert.ok(ink > 100, "fixture must contain visible chalk");
  return (missing + extra) / ink;
}

function setup(t, dpr) {
  window.devicePixelRatio = dpr;
  const native = new Worker(new URL("../scripts/helpers/chalkboardWorkerHarness.mjs", import.meta.url));
  const worker = {
    postMessage: data => native.postMessage(data),
    terminate() {},
  };
  native.on("message", data => {
    assert.ok(!data.error, "the production raster worker must render successfully");
    const { width, height, pixels } = data.bitmap;
    const bitmap = createCanvas(width, height);
    bitmap.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
    bitmap.close = () => {};
    worker.onmessage?.({ data: { ...data, bitmap } });
  });
  const renderer = new ChalkboardRenderer(canvas(), { worker });
  t.after(async () => { renderer.destroy(); await native.terminate(); });
  async function render(view) {
    renderer.render(view);
    while (renderer.loading) {
      await once(native, "message");
      renderer.render(view);
    }
  }
  return { renderer, render };
}

for (const [scale, dpr] of [[.25, 1], [.5, 1], [.75, 1], [.5, 2], [.8, 2]]) {
  test(`worker-backed sponge preserves a drawing across tile edges at scale ${scale}, DPR ${dpr}`, { timeout: 20000 }, async t => {
    const { renderer, render } = setup(t, dpr);
    const view = { width: 1280 * scale, height: 1000 * scale, scale, scrollLeft: 0 };
    renderer.setInterventions([own], 1, "test");
    await render(view);
    const published = pixels(renderer);
    await render({ ...view, onlyOwn: true });
    const selected = pixels(renderer);
    const difference = footprintDifference(published, selected);
    assert.ok(difference < .04, `selecting the sponge moved or lost ${(difference * 100).toFixed(1)}% of the drawing`);

    // Erase across x=512: the mask must follow the same world coordinates.
    const gesture = createEraserGesture(470, 180, 80, [own]);
    appendEraserGesture(gesture, 550, 180);
    await render({ ...view, onlyOwn: true, draftElements: gesture.masks });
    const erased = pixels(renderer);
    const pixel = (x, y) => ((Math.round(y * scale * dpr) * renderer.canvas.width + Math.round(x * scale * dpr)) * 4 + 3);
    for (const x of [490, 512, 530]) assert.equal(erased[pixel(x, 180)], 0, "ink beneath the sponge must disappear");
    for (const [x, y] of [[250, 180], [800, 180], [1120, 600], [800, 800]]) {
      assert.equal(erased[pixel(x, y)], selected[pixel(x, y)], "untouched ink must stay in place");
      assert.ok(erased[pixel(x, y)] > 64);
    }
    await render({ ...view, onlyOwn: true });
    assert.deepEqual(pixels(renderer), selected, "undo must restore the original sponge preview");
    await render(view);
    assert.deepEqual(pixels(renderer), published, "leaving the tool restores the published drawing");
  });
}

test("worker-backed sponge hides other authors and preserves their ink after erasing and scrolling", { timeout: 20000 }, async t => {
  const { renderer, render } = setup(t, 1);
  const view = { width: 500, height: 500, scale: .5, scrollLeft: 100 };
  renderer.setInterventions([own, other], 1, "test");
  await render(view);
  const published = pixels(renderer);
  const otherPixel = (460 * renderer.canvas.width + 100) * 4 + 3;
  assert.ok(published[otherPixel] > 64);
  await render({ ...view, onlyOwn: true });
  assert.equal(pixels(renderer)[otherPixel], 0);
  const gesture = createEraserGesture(470, 180, 80, [own, other]);
  appendEraserGesture(gesture, 550, 180);
  await render({ ...view, onlyOwn: true, draftElements: gesture.masks });
  await render({ ...view, scrollLeft: 250, onlyOwn: true, draftElements: gesture.masks });
  await render({ ...view, draftElements: gesture.masks });
  assert.equal(pixels(renderer)[otherPixel], published[otherPixel], "erasing must never alter another author's ink");
});
