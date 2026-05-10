import { Worker } from "worker_threads";

const MAX_REQUEUE_ATTEMPTS = 2;

export function createPersistenceClient() {
  let worker = null;
  let nextId = 1;
  let ready = false;
  let restartTimer = null;
  const pending = new Map();
  const backlog = [];

  function spawnWorker() {
    const w = new Worker(new URL("./persistenceWorker.js", import.meta.url), { type: "module" });
    ready = false;
    w.once("online", () => {
      ready = true;
      flushBacklog();
    });
    w.on("message", handleMessage);
    w.on("error", handleCrash);
    w.on("exit", (code) => {
      if (worker === w) {
        handleCrash(new Error(`persistence worker exited with code ${code}`));
      }
    });
    return w;
  }

  function ensureWorker() {
    if (!worker) {
      worker = spawnWorker();
    }
    return worker;
  }

  function scheduleRestart() {
    if (restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      ensureWorker();
    }, 500);
    restartTimer.unref?.();
  }

  function requeuePendingAfterCrash(err) {
    for (const entry of pending.values()) {
      pending.delete(entry.id);
      if (entry.fireAndForget && entry.attempts < MAX_REQUEUE_ATTEMPTS) {
        backlog.unshift({ ...entry, attempts: entry.attempts + 1 });
        continue;
      }
      entry.reject(err);
    }
  }

  function handleCrash(err) {
    const error = err instanceof Error ? err : new Error(String(err || "persistence_worker_error"));
    if (worker) {
      worker.removeAllListeners();
      worker = null;
    }
    ready = false;
    requeuePendingAfterCrash(error);
    scheduleRestart();
  }

  function handleMessage(message) {
    const { id, ok, result, error } = message || {};
    if (!id || !pending.has(id)) return;
    const entry = pending.get(id);
    pending.delete(id);
    if (ok) {
      entry.resolve(result);
    } else {
      entry.reject(new Error(error || "persistence_worker_error"));
    }
  }

  function post(entry) {
    const target = ensureWorker();
    if (!ready) {
      backlog.push(entry);
      return;
    }
    pending.set(entry.id, entry);
    try {
      target.postMessage({ id: entry.id, type: entry.type, payload: entry.payload });
    } catch (err) {
      pending.delete(entry.id);
      entry.reject(err);
    }
  }

  function flushBacklog() {
    if (!ready || !worker) return;
    while (backlog.length) {
      post(backlog.shift());
    }
  }

  function call(type, payload, { fireAndForget = false } = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      post({
        id,
        type,
        payload,
        resolve,
        reject,
        fireAndForget,
        attempts: 0,
      });
    });
  }

  function enqueue(type, payload) {
    void call(type, payload, { fireAndForget: true }).catch((err) => {
      console.warn(`[persistence] ${type} failed`, err?.message || err);
    });
  }

  ensureWorker();

  return {
    recordPlayerRoundStats(payload) {
      enqueue("recordPlayerRoundStats", payload);
    },
    recordLiveHeadToHeadOutcomes(payload) {
      enqueue("recordLiveHeadToHeadOutcomes", payload);
    },
    health() {
      return call("health", {});
    },
    shutdown() {
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      if (worker) {
        const current = worker;
        worker = null;
        ready = false;
        return current.terminate();
      }
      return Promise.resolve();
    },
  };
}

