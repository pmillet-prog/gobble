// All writers still share one lane: an interactive request may pass queued
// background jobs, but never interrupts a transaction already running.
export function createSqliteWriteScheduler({ maxInteractiveBurst = 4 } = {}) {
  const normal = [], interactive = [];
  let running = false, burst = 0;
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (normal.length || interactive.length) {
        const urgent = interactive.length && (!normal.length || burst < maxInteractiveBurst);
        const job = (urgent ? interactive : normal).shift();
        burst = urgent ? burst + 1 : 0;
        try { job.resolve(await job.task()); }
        catch (error) { job.reject(error); }
      }
    } finally { running = false; burst = 0; }
  }
  return (task, { priority = "normal" } = {}) => new Promise((resolve, reject) => {
    (priority === "interactive" ? interactive : normal).push({ task, resolve, reject });
    queueMicrotask(drain);
  });
}
