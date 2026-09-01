function safeInvoke(callback) {
  try {
    const result = callback?.();
    result?.catch?.(() => {});
  } catch (_) {}
}

export function createDailyApplicationRuntime() {
  let active = false;
  let config = {};
  let loadKey = null;

  function syncHubData() {
    if (!config.enabled) {
      loadKey = null;
      return;
    }
    const nextLoadKey = String(config.installId || "anonymous");
    if (loadKey === nextLoadKey) return;
    loadKey = nextLoadKey;
    safeInvoke(config.fetchDailyStatus);
    safeInvoke(config.fetchDailyBoard);
    safeInvoke(() => config.fetchDailyHistory?.(10));
    safeInvoke(config.fetchDuelStatus);
  }

  function configure(nextConfig = {}) {
    config = nextConfig;
    if (active) syncHubData();
  }

  function start() {
    if (active) return stop;
    active = true;
    syncHubData();
    return stop;
  }

  function stop() {
    if (!active) return;
    active = false;
    loadKey = null;
  }

  return Object.freeze({ configure, start, stop });
}
