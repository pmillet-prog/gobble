import { Worker } from "worker_threads";

export function createComputePool() {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function rejectAll(err) {
    const error = err instanceof Error ? err : new Error(String(err || "worker_error"));
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
  }

  function handleMessage(message) {
    const { id, ok, result, error } = message || {};
    if (!id || !pending.has(id)) return;
    const { resolve, reject } = pending.get(id);
    pending.delete(id);
    if (ok) {
      resolve(result);
    } else {
      reject(new Error(error || "worker_error"));
    }
  }

  function handleCrash(err) {
    rejectAll(err);
    if (worker) {
      worker.removeAllListeners();
    }
    worker = spawnWorker();
  }

  function spawnWorker() {
    const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    w.on("message", handleMessage);
    w.on("error", handleCrash);
    w.on("exit", (code) => {
      const exitError =
        code === 0
          ? new Error("compute worker exited")
          : new Error(`compute worker exited with code ${code}`);
      handleCrash(exitError);
    });
    return w;
  }

  function ensureWorker() {
    if (!worker) {
      worker = spawnWorker();
    }
  }

  ensureWorker();

  function callWorker(type, payload) {
    ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, type, payload });
      } catch (err) {
        pending.delete(id);
        reject(err);
      }
    });
  }

  return {
    prepareNextGrid(payload) {
      return callWorker("prepareNextGrid", payload);
    },
  };
}
