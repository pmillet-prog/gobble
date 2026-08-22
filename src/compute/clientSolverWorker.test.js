import assert from "node:assert/strict";
import test from "node:test";

test("solver worker releases its dictionary memory after becoming idle", async () => {
  const originalWorker = globalThis.Worker;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let scheduledDispose = null;
  let instance = null;

  class FakeWorker {
    constructor() {
      this.listeners = new Map();
      this.terminated = false;
      instance = this;
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    postMessage(message) {
      this.lastMessage = message;
    }
    terminate() {
      this.terminated = true;
    }
  }

  globalThis.Worker = FakeWorker;
  globalThis.setTimeout = (callback) => {
    scheduledDispose = callback;
    return 1;
  };
  globalThis.clearTimeout = () => {};

  try {
    const solver = await import(`./clientSolverWorker.js?test=${Date.now()}`);
    const pending = solver.solveGridInWorker([{ letter: "A" }]);
    instance.listeners.get("message")({
      data: { id: instance.lastMessage.id, ok: true, solutions: [] },
    });
    await pending;

    assert.equal(instance.terminated, false);
    assert.equal(typeof scheduledDispose, "function");
    scheduledDispose();
    assert.equal(instance.terminated, true);
  } finally {
    globalThis.Worker = originalWorker;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
