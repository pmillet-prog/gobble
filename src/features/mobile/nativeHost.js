export function getNativeHost(windowObject = globalThis.window) {
  const host = windowObject?.GobbleNative;
  return host?.protocol === 1 && host?.ownsAssets === true ? host : null;
}

export function getNativeReload(windowObject = globalThis.window) {
  const host = getNativeHost(windowObject);
  return typeof host?.reload === "function" ? () => host.reload() : null;
}

export function getOrientationPort({ windowObject = globalThis.window, orientation = globalThis.screen?.orientation } = {}) {
  const host = getNativeHost(windowObject);
  if (typeof host?.setOrientation !== "function") return orientation;
  return {
    get type() { return orientation?.type; },
    lock: mode => host.setOrientation(mode),
    unlock: () => { void host.setOrientation("portrait").catch(() => {}); },
    addEventListener: (...args) => orientation?.addEventListener?.(...args),
    removeEventListener: (...args) => orientation?.removeEventListener?.(...args),
  };
}
