const pending = new Map();

let nextRequestId = 1;
let worker = null;

function rejectPending(error) {
  const safeError = error instanceof Error ? error : new Error(String(error || "solver_worker_error"));
  pending.forEach(({ reject }) => reject(safeError));
  pending.clear();
}

function createWorker() {
  const instance = new Worker(new URL("../workers/gameSolver.worker.js", import.meta.url), {
    type: "module",
  });
  instance.addEventListener("message", (event) => {
    const message = event?.data || {};
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) {
      request.resolve(Array.isArray(message.solutions) ? message.solutions : []);
      return;
    }
    request.reject(new Error(message.error || "solver_worker_error"));
  });
  instance.addEventListener("error", (event) => {
    rejectPending(event?.error || new Error(event?.message || "solver_worker_crashed"));
    instance.terminate();
    if (worker === instance) worker = null;
  });
  return instance;
}

function getWorker() {
  if (!worker) worker = createWorker();
  return worker;
}

export function solveGridInWorker(board, special = null) {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("solver_worker_unavailable"));
  }
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, type: "solve", board, special });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

export function disposeClientSolverWorker(reason = "solver_worker_disposed") {
  rejectPending(new Error(reason));
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
