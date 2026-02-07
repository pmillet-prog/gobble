import { promises as fs } from "fs";
import path from "path";

export function createAsyncFileLogger({ filePath, flushIntervalMs = 250, maxQueue = 5000 }) {
  const queue = [];
  let flushing = false;
  let warnedDrop = false;
  let timer = null;
  const dir = path.dirname(filePath);

  async function flushOnce() {
    if (flushing || queue.length === 0) return;
    flushing = true;
    const batch = queue.splice(0, queue.length);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(filePath, batch.join(""), { encoding: "utf8" });
    } catch (_) {
      // Swallow errors to avoid crashing the main thread.
    } finally {
      flushing = false;
    }
  }

  function ensureTimer() {
    if (timer) return;
    timer = setInterval(flushOnce, flushIntervalMs);
    timer.unref?.();
  }

  function logLine(line) {
    const entry = String(line || "");
    if (!entry) return;
    if (queue.length >= maxQueue) {
      queue.shift();
      if (!warnedDrop) {
        warnedDrop = true;
        console.warn("[asyncFileLogger] queue full, dropping logs");
      }
    }
    queue.push(entry);
    ensureTimer();
  }

  return {
    logLine,
    flush: flushOnce,
  };
}
