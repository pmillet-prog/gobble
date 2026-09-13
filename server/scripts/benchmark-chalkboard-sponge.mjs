import { performance } from "node:perf_hooks";
import { createCanvas } from "@napi-rs/canvas";
import { ChalkboardRenderer } from "../../src/features/chalkboard/chalkboardRenderer.js";
import { getElementBounds } from "../../src/features/chalkboard/chalkboardModel.js";
import { createEraserGesture, appendEraserGesture } from "../../src/features/chalkboard/chalkboardEraserGesture.js";

const makeCanvas = () => { const canvas = createCanvas(1, 1); canvas.style = {}; return canvas; };
globalThis.document = { createElement: makeCanvas };
globalThis.window = { devicePixelRatio: 1 };
const count = 240, samples = 16;
const entries = Array.from({ length: count }, (_, index) => {
  const x = 60 + index % 18 * 65, y = 70 + Math.floor(index / 18) * 40;
  const stroke = { id: `stroke-${index}`, type: "stroke", seed: index, color: "#ffffff", size: 11,
    points: Array.from({ length: 8 }, (_, point) => ({ x: x + point * 5, y: y + Math.sin(point * .4) * 18 })) };
  const element = index % 4 === 0 ? stroke : { id: `text-${index}`, type: "text", seed: index, text: "GOBBLE", font: "chalk", cx: x, cy: y, width: 140, fontSize: 40, scale: 1, angle: 0 };
  return { id: `entry-${index}`, canErase: true, elements: [element], bounds: getElementBounds(element) };
});
const view = { width: 800, height: 500, scale: .5, scrollLeft: 0 };
function measure(onlyOwn) {
  const renderer = new ChalkboardRenderer(makeCanvas());
  renderer.setInterventions(entries, 1, "benchmark");
  renderer.render({ ...view, onlyOwn });
  const gesture = createEraserGesture(80, 220, 90, entries);
  const durations = [];
  for (let step = 0; step < samples; step++) {
    const start = performance.now();
    appendEraserGesture(gesture, 80 + step * 40, 220 + Math.sin(step / 5) * 30);
    renderer.render({ ...view, onlyOwn, draftElements: gesture.masks });
    durations.push(performance.now() - start);
  }
  const tiles = renderer.tileCache.entries.size;
  renderer.destroy();
  durations.sort((a, b) => a - b);
  return { medianMs: +durations[Math.floor(samples / 2)].toFixed(2), p95Ms: +durations[Math.floor(samples * .95)].toFixed(2), maxMs: +durations.at(-1).toFixed(2), cachedTiles: tiles };
}
const recomposed = measure(false), incremental = measure(true);
console.log(JSON.stringify({ interventions: count, strokes: count / 4, texts: count * .75, frames: samples, raster: "Skia Canvas, 800x500", recomposed, incremental, medianSpeedup: +(recomposed.medianMs / incremental.medianMs).toFixed(1) }, null, 2));
