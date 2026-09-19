import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import { ChalkboardRenderer } from "../../src/features/chalkboard/chalkboardRenderer.js";

const makeCanvas = () => { const canvas = createCanvas(1, 1); canvas.style = {}; return canvas; };
globalThis.document = { createElement: makeCanvas };
globalThis.window = { devicePixelRatio: 1 };
const elements = Array.from({ length: 240 }, (_, index) => ({
  id: `stroke-${index}`, type: "stroke", seed: index, size: 11, color: "#f4f0df",
  points: Array.from({ length: 50 }, (_, p) => ({ x: 50 + index % 20 * 55 + p * 2,
    y: 40 + Math.floor(index / 20) * 55 + Math.sin(p * .17) * 22 })),
}));
const entries = [{ id: "drawing", elements, bounds: { minX: 0, minY: 0, maxX: 1500, maxY: 1000 } }];
const view = { width: 800, height: 500, scale: .5, scrollLeft: 0 };
const sync = new ChalkboardRenderer(makeCanvas());
const syncStart = performance.now();
sync.setInterventions(entries, 1, "benchmark");
sync.render(view);
const synchronousMainMs = performance.now() - syncStart;
sync.destroy();

const thread = new Worker(new URL("../tests/chalkboardWorkerHarness.mjs", import.meta.url));
const adapter = { postMessage: message => thread.postMessage(message), terminate: () => thread.terminate() };
let maxMainMs = 0, maxHeartbeatGapMs = 0, ticks = 0, previous = performance.now();
const heartbeat = setInterval(() => {
  const now = performance.now();
  maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - previous);
  previous = now;
  ticks++;
}, 16);
const start = performance.now();
let resolve, reject;
const done = new Promise((yes, no) => { resolve = yes; reject = no; });
const timeout = setTimeout(() => reject(new Error("worker_timeout")), 60000);
thread.on("error", reject);
const renderer = new ChalkboardRenderer(makeCanvas(), { worker: adapter, onChange: () => {
  const tick = performance.now();
  renderer.render(view);
  maxMainMs = Math.max(maxMainMs, performance.now() - tick);
  if (renderer.asyncRaster.failed) reject(new Error("worker_failed"));
  else if (!renderer.loading) resolve();
} });
thread.on("message", data => {
  const tick = performance.now();
  if (data.bitmap) {
    const { width, height, pixels } = data.bitmap;
    const canvas = createCanvas(width, height);
    canvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
    data.bitmap = canvas;
  }
  adapter.onmessage?.({ data });
  maxMainMs = Math.max(maxMainMs, performance.now() - tick);
});
try {
  const initial = performance.now();
  renderer.setInterventions(entries, 1, "benchmark");
  renderer.render(view);
  maxMainMs = Math.max(maxMainMs, performance.now() - initial);
  await done;
  console.log(JSON.stringify({ strokes: elements.length, points: 12000, canvas: "Skia, Node worker thread, 800x500",
    synchronousMainMs: +synchronousMainMs.toFixed(1), workerTotalMs: +(performance.now() - start).toFixed(1),
    workerMaxMainMs: +maxMainMs.toFixed(1), heartbeatTicks: ticks, maxHeartbeatGapMs: +maxHeartbeatGapMs.toFixed(1),
    cachedRasterMiB: +([...renderer.asyncRaster.cache.entries.values()].reduce((sum, item) => sum + item.canvas.width * item.canvas.height * 4, 0) / 1048576).toFixed(2),
  }, null, 2));
} finally {
  clearInterval(heartbeat);
  clearTimeout(timeout);
  renderer.destroy();
  await thread.terminate();
}
