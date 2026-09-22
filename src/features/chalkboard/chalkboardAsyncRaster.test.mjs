import test from "node:test";
import assert from "node:assert/strict";
import { ChalkboardAsyncRaster } from "./chalkboardAsyncRaster.js";
import { ChalkboardTileCache } from "./chalkboardTileLayer.js";

function setup() {
  const messages = [];
  const worker = { postMessage: message => messages.push(message), terminate() { this.terminated = true; } };
  const cache = new ChalkboardTileCache(3);
  const raster = new ChalkboardAsyncRaster(cache, worker, () => {});
  const index = new Map(Array.from({ length: 5 }, (_, x) => [`${x}:0`, [{ element: { id: x, items: [] } }]]));
  const bitmap = () => ({ closed: false, close() { this.closed = true; } });
  const complete = image => worker.onmessage({ data: { id: messages.at(-1).id, bitmap: image } });
  return { raster, worker, cache, messages, index, bitmap, complete };
}

test("raster work is serialized and visited areas, including late offscreen tiles, survive scrolling", () => {
  const { raster, worker, cache, messages, index, bitmap, complete } = setup();
  raster.update(index, [[0, 0], [1, 0]]);
  assert.equal(messages.length, 1);
  assert.equal(raster.pending, true);
  const first = bitmap();
  complete(first);
  assert.equal(messages.length, 2);
  assert.equal(raster.getTile(0, 0), first);
  raster.update(index, [[4, 0]]);
  const stale = bitmap();
  complete(stale);
  assert.equal(stale.closed, false);
  assert.equal(messages.at(-1).groups[0].id, 4);
  complete(bitmap());
  assert.equal(raster.pending, false);
  raster.update(index, [[4, 0]]);
  assert.equal(messages.length, 3);
  raster.update(index, [[0, 0], [1, 0]]);
  assert.equal(raster.pending, false);
  assert.equal(raster.getTile(0, 0), first);
  assert.equal(raster.getTile(1, 0), stale);
  assert.equal(messages.length, 3, "returning to visited tiles must not ask the worker to redraw");
  raster.destroy();
  assert.equal(worker.terminated, true);
  assert.equal(cache.entries.size, 0);
  assert.equal(first.closed, true);
});

test("visited tiles obey the LRU budget and changed or deleted content is invalidated offscreen", () => {
  const { raster, cache, messages, index, bitmap, complete } = setup();
  const images = [];
  for (let x = 0; x < 4; x++) {
    raster.update(index, [[x, 0]]);
    images.push(bitmap()); complete(images.at(-1));
  }
  assert.equal(cache.entries.size, 3);
  assert.equal(images[0].closed, true);
  const changed = new Map(index);
  changed.set("1:0", [{ element: { id: "changed", items: [] } }]);
  changed.delete("2:0");
  raster.update(changed, [[3, 0]]);
  assert.equal(images[1].closed, true);
  assert.equal(images[2].closed, true);
  assert.equal(images[3].closed, false);
  raster.update(changed, [[1, 0]]);
  assert.equal(messages.at(-1).groups[0].id, "changed");
  complete(bitmap());
  raster.destroy();
});

test("higher-resolution cached tiles can be reused when zooming out", () => {
  const { raster, index, bitmap, complete, messages } = setup();
  raster.update(index, [[0, 0]], 1);
  complete(bitmap());
  raster.update(index, [[0, 0]], .5);
  assert.equal(raster.pending, false);
  assert.equal(messages.length, 1);
  raster.update(index, [[0, 0]], 1.35);
  assert.equal(raster.pending, true);
  assert.equal(messages.length, 2);
  raster.destroy();
});

test("obsolete fonts and resolutions cannot restore stale worker bitmaps", () => {
  const { raster, index, bitmap, complete } = setup();
  raster.update(index, [[0, 0]], .5);
  raster.clear();
  raster.update(index, [[0, 0]], .75);
  const stale = bitmap();
  complete(stale);
  assert.equal(stale.closed, true);
  const current = bitmap();
  complete(current);
  assert.equal(raster.getTile(0, 0), current);
  raster.destroy();
});

test("worker failures release resources and leave the synchronous fallback available", () => {
  const { raster, worker, index } = setup();
  raster.update(index, [[0, 0]]);
  worker.onerror();
  assert.equal(raster.failed, true);
  assert.equal(raster.pending, false);
  assert.equal(worker.terminated, true);
  raster.destroy();
});
