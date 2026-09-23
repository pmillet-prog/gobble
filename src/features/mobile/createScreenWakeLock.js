// Retry on a new round/foreground transition, never poll or fight battery saver.
export function createScreenWakeLock({
  navigatorTarget = globalThis.navigator,
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
} = {}) {
  let active = false, enabled = false, pageHidden = false, generation = 0;
  let pending = null, lock = null, releaseListener = null;
  const wanted = () => active && enabled && !pageHidden && documentTarget?.visibilityState === "visible";
  const safelyRelease = (sentinel) => {
    try { Promise.resolve(sentinel?.release()).catch(() => {}); } catch (_) {}
  };
  function release() {
    generation += 1;
    if (lock) {
      lock.removeEventListener?.("release", releaseListener);
      safelyRelease(lock);
    }
    lock = null;
    releaseListener = null;
  }
  function request() {
    if (!wanted() || lock || pending || !navigatorTarget?.wakeLock?.request) return;
    const token = generation;
    const task = Promise.resolve().then(() => {
      if (!wanted() || token !== generation) return null;
      return navigatorTarget.wakeLock.request("screen");
    });
    pending = task;
    task.then((sentinel) => {
      if (!sentinel) return;
      if (!wanted() || token !== generation) { safelyRelease(sentinel); return; }
      if (sentinel.released) return;
      lock = sentinel;
      const onRelease = () => {
        sentinel.removeEventListener?.("release", onRelease);
        if (lock === sentinel) { lock = null; releaseListener = null; }
      };
      releaseListener = onRelease;
      sentinel.addEventListener?.("release", onRelease);
    }).catch(() => {}).finally(() => {
      if (pending === task) pending = null;
      // A hidden -> visible transition may have occurred while request waited.
      if (token !== generation && wanted()) request();
    });
  }
  function sync() { if (wanted()) request(); else release(); }
  const onPageHide = () => { pageHidden = true; release(); };
  const onPageShow = () => { pageHidden = false; sync(); };
  return Object.freeze({
    setEnabled(value) {
      if (enabled === !!value) return;
      enabled = !!value;
      sync();
    },
    start() {
      if (active) return;
      active = true;
      pageHidden = false;
      documentTarget?.addEventListener?.("visibilitychange", sync);
      windowTarget?.addEventListener?.("pagehide", onPageHide);
      windowTarget?.addEventListener?.("pageshow", onPageShow);
      sync();
    },
    stop() {
      active = false;
      release();
      documentTarget?.removeEventListener?.("visibilitychange", sync);
      windowTarget?.removeEventListener?.("pagehide", onPageHide);
      windowTarget?.removeEventListener?.("pageshow", onPageShow);
    },
  });
}
