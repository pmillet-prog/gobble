// Run this watchdog on the page: a worker blocked inside the graphics driver
// cannot run its own timeout. Count only visible time without real progress.
export function createWheelWorkerStartupGuard({ onTimeout, limit = 20_000,
  visibility = document, timers = globalThis, now = () => performance.now() } = {}) {
  let step = 'Démarrage du moteur 3D', elapsed = 0, since = visibility.hidden ? null : now();
  let timer = null, stopped = false;
  const duration = () => elapsed + (since === null ? 0 : now() - since);
  function dispose() {
    stopped = true;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null; visibility.removeEventListener('visibilitychange', changed);
  }
  function arm() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = !stopped && since !== null ? timers.setTimeout(() => {
      const idleMs = duration();
      if (idleMs < limit) { arm(); return; }
      dispose(); onTimeout({ step, idleMs });
    }, Math.max(0, limit - duration())) : null;
  }
  function changed() {
    elapsed = duration(); since = visibility.hidden ? null : now(); arm();
  }
  visibility.addEventListener('visibilitychange', changed); arm();
  return { dispose, progress(status) {
    if (stopped) return;
    if (status.phase === 'ready' || status.phase === 'error') { dispose(); return; }
    if (!status.message || status.message === step) return;
    step = status.message; elapsed = 0; since = visibility.hidden ? null : now(); arm();
  } };
}
