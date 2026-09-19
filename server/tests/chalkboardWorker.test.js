import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { createCanvas } from "@napi-rs/canvas";
import { ChalkboardRenderer } from "../../src/features/chalkboard/chalkboardRenderer.js";
import { getElementBounds } from "../../src/features/chalkboard/chalkboardModel.js";
import { getTileBounds, TILE_RASTER_RATIO } from "../../src/features/chalkboard/chalkboardTileLayer.js";

globalThis.document = { createElement: () => createCanvas(1, 1) };

test("the production worker preserves chalk pixels, erasure isolation and stacking", async () => {
  const worker = new Worker(new URL("./chalkboardWorkerHarness.mjs", import.meta.url));
  const renderer = new ChalkboardRenderer(createCanvas(1, 1));
  const stroke = (id, color) => ({ id, type: "stroke", seed: 17, color, size: 14,
    points: [{ x: 30, y: 100 }, { x: 200, y: 100 }, { x: 260, y: 180 }] });
  const mask = { type: "erase", id: "sponge", size: 70, points: [{ x: 120, y: 100 }] };
  const items = [stroke("behind", "#ffffff"), stroke("own", "#ffff00"), stroke("after", "#ff7777")];
  const interventions = items.map((element, index) => ({ id: element.id, bounds: getElementBounds(element),
    elements: index === 1 ? [element, mask] : [element] }));
  try {
    renderer.setInterventions(interventions, 1, "test");
    const expected = renderer.published.getTile(0, 0);
    const reply = once(worker, "message");
    worker.postMessage({ id: 1, groups: renderer.published.index.get("0:0").map(entry => entry.element),
      fonts: [], ratio: TILE_RASTER_RATIO, bounds: getTileBounds(0, 0) });
    const [result] = await reply;
    assert.equal(result.error, undefined);
    assert.deepEqual(result.bitmap.pixels, expected.getContext("2d").getImageData(0, 0, expected.width, expected.height).data);
  } finally {
    renderer.destroy();
    await worker.terminate();
  }
});
