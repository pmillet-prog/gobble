import { parentPort } from "node:worker_threads";
import { createSeededRandom } from "./word-grid-frequency-core.mjs";

// Only this offline worker's random stream is replaced. Each client sends one
// job at a time; seeding per sample makes results independent of worker count.
parentPort.on("message", (message) => {
  Math.random = createSeededRandom(message.offlineSeed);
});
await import("../compute/worker.js");
parentPort.postMessage({ ready: true });
