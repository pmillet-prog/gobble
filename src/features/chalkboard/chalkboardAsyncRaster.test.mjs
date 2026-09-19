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

test("raster work is serialized, cached and retired after scrolling or unmounting", () => {
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
  assert.equal(stale.closed, true);
  assert.equal(messages.at(-1).groups[0].id, 4);
  complete(bitmap());
  assert.equal(raster.pending, false);
  raster.update(index, [[4, 0]]);
  assert.equal(messages.length, 3);
  raster.destroy();
  assert.equal(worker.terminated, true);
  assert.equal(cache.entries.size, 0);
  assert.equal(first.closed, true);
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
