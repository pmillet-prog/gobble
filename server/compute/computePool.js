import { Worker } from "worker_threads";

export function createComputePool() {
  function createWorkerChannel(label) {
    let worker = null;
    let nextId = 1;
    const pending = new Map();
    let restartOnExit = true;

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

    function spawnWorker() {
      const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      w.on("message", handleMessage);
      w.on("error", handleCrash);
      w.on("exit", (code) => {
        if (!restartOnExit) {
          restartOnExit = true;
          worker = null;
          return;
        }
        const exitError =
          code === 0
            ? new Error(`${label} worker exited`)
            : new Error(`${label} worker exited with code ${code}`);
        handleCrash(exitError);
      });
      return w;
    }

    function handleCrash(err) {
      rejectAll(err);
      if (worker) {
        worker.removeAllListeners();
      }
      worker = spawnWorker();
    }

    function ensureWorker() {
      if (!worker) {
        worker = spawnWorker();
      }
    }

    ensureWorker();

    return {
      call(type, payload) {
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
      },
      cancelPending(reason = `${label}_cancelled`) {
        if (worker) {
          restartOnExit = false;
          void worker.terminate().catch(() => {});
        }
        rejectAll(new Error(reason));
      },
    };
  }

  const prepareChannel = createWorkerChannel("prepare");
  const analyzeChannel = createWorkerChannel("analyze");
  const bufferChannel = createWorkerChannel("buffer");

  return {
    prepareNextGrid(payload) {
      return prepareChannel.call("prepareNextGrid", payload);
    },
    analyzeGrid(payload) {
      return analyzeChannel.call("analyzeGrid", payload);
    },
    prepareBufferedGrid(payload) {
      return bufferChannel.call("prepareNextGrid", payload);
    },
    cancelBufferedPrepare() {
      bufferChannel.cancelPending("buffer_prepare_cancelled");
    },
  };
}
