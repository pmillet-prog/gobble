import { parentPort } from "node:worker_threads";
import { createCanvas } from "@napi-rs/canvas";

// Run the production worker's canvas operations with Skia in Node. No browser,
// server, real board data, fonts endpoint or database is needed by this fixture.
globalThis.OffscreenCanvas = class {
  constructor(width, height) {
    const canvas = createCanvas(width, height);
    canvas.transferToImageBitmap = () => ({ width, height, pixels: canvas.getContext("2d").getImageData(0, 0, width, height).data });
    return canvas;
  }
};
globalThis.self = {
  location: { origin: "http://localhost" },
  postMessage: payload => parentPort.postMessage(payload),
};
await import("../../src/features/chalkboard/chalkboardRasterWorker.js");
parentPort.on("message", data => self.onmessage({ data }));
