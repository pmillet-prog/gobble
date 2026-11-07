import { getMonotonicNowMs } from "./realtimeClock.js";

// Hidden pages need no GPU frames, but presentation completion must not gate
// gameplay on requestAnimationFrame. Timers may also be suspended by the OS:
// every callback receives elapsed wall time and catches up on visibility change.
export function createPresentationFrames({ documentTarget = globalThis.document,
  now = getMonotonicNowMs, timers = globalThis,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id) } = {}) {
  const jobs = new Map();
  let nextId = 0, disposed = false;
  function cancelScheduled(job) {
    if (job.timer) timers.clearTimeout(job.handle); else cancelFrame(job.handle);
  }
  function run(id) {
    const job = jobs.get(id);
    if (!job || disposed) return;
    jobs.delete(id); job.callback(now());
  }
  function schedule(id, job) {
    job.timer = documentTarget?.hidden === true;
    job.handle = job.timer ? timers.setTimeout(() => run(id), 1000) : requestFrame(() => run(id));
  }
  function visibility() {
    const pending = [...jobs.entries()];
    for (const [id, job] of pending) {
      if (!jobs.has(id)) continue;
      cancelScheduled(job);
      // Settle expired shots immediately when returning, before requesting paint.
      if (!documentTarget.hidden) run(id); else schedule(id, job);
    }
  }
  documentTarget?.addEventListener?.("visibilitychange", visibility);
  return { now,
    requestFrame(callback) {
      if (disposed) return null;
      const id = ++nextId, job = { callback };
      jobs.set(id, job); schedule(id, job); return id;
    },
    cancelFrame(id) { const job = jobs.get(id); if (job) { jobs.delete(id); cancelScheduled(job); } },
    dispose() {
      disposed = true;
      documentTarget?.removeEventListener?.("visibilitychange", visibility);
      for (const job of jobs.values()) cancelScheduled(job);
      jobs.clear();
    },
  };
}
