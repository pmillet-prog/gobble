function safeInvoke(run) {
  try {
    const result = run?.();
    result?.catch?.(() => {});
  } catch (_) {}
}

export function createRefreshSchedulerFeature(
  { scope },
  {
    clearIntervalFn = clearInterval,
    documentTarget = globalThis.document,
    setIntervalFn = setInterval,
    windowTarget = globalThis.window,
  } = {}
) {
  const tasks = new Map();

  function stop(name) {
    const key = String(name || "").trim();
    const task = tasks.get(key);
    if (!task) return;
    tasks.delete(key);
    task.dispose();
  }

  function schedule(name, config = {}) {
    const key = String(name || "").trim();
    if (!key) throw new Error("Refresh tasks require a name");
    stop(key);
    if (config.enabled === false || typeof config.run !== "function") {
      return () => {};
    }

    let disposed = false;
    let intervalId = null;
    const removers = [];
    const run = () => {
      if (!disposed) safeInvoke(config.run);
    };
    const onVisible = () => {
      if (!documentTarget || documentTarget.visibilityState === "visible") run();
    };
    const listen = (target, event, handler) => {
      target?.addEventListener?.(event, handler);
      removers.push(() => target?.removeEventListener?.(event, handler));
    };

    const intervalMs = Math.max(0, Number(config.intervalMs) || 0);
    if (intervalMs > 0) intervalId = setIntervalFn(run, intervalMs);
    if (config.onFocus) listen(windowTarget, "focus", run);
    if (config.onPageShow) listen(windowTarget, "pageshow", run);
    if (config.onVisible) listen(documentTarget, "visibilitychange", onVisible);
    if (config.connection?.on && config.connection?.off) {
      config.connection.on("connect", run);
      removers.push(() => config.connection.off("connect", run));
    }

    const task = {
      dispose() {
        if (disposed) return;
        disposed = true;
        if (intervalId != null) clearIntervalFn(intervalId);
        intervalId = null;
        removers.splice(0).reverse().forEach((remove) => remove());
      },
    };
    tasks.set(key, task);
    if (config.immediate !== false) run();

    return () => {
      if (tasks.get(key) !== task) return;
      stop(key);
    };
  }

  function stopAll() {
    for (const name of [...tasks.keys()]) stop(name);
  }

  function start() {
    scope.add(stopAll);
  }

  return Object.freeze({ schedule, start, stop, stopAll });
}

