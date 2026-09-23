import { mobileBackRegistry } from "./mobileBackRegistry.js";

export const MOBILE_HISTORY_KEY = "__gobbleMobileNavigation";

export function createMobileNavigation({
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  registry = mobileBackRegistry,
} = {}) {
  let active = false, config = {}, armed = false, removing = false;
  let unsubscribe = null, unloadBound = false, sequence = 0;
  const opened = new Map();
  const history = windowTarget?.history;
  const ownsEntry = () => !!history?.state?.[MOBILE_HISTORY_KEY];
  function target() {
    if (!config.enabled) return null;
    // The native <dialog> top layer must keep its cancel/busy semantics.
    const nativeDialog = documentTarget?.querySelector?.("dialog[open]");
    if (nativeDialog) return () => {
      if (typeof nativeDialog.requestClose === "function") nativeDialog.requestClose();
      else {
        const cancel = new windowTarget.Event("cancel", { cancelable: true });
        if (nativeDialog.dispatchEvent(cancel)) nativeDialog.close();
      }
    };
    if (config.confirming) return config.cancelExit;
    const local = registry.top();
    if (local) return local;
    const candidates = (config.targets || []).filter((item) => item.open);
    candidates.sort((a, b) => (opened.get(b.id) || 0) - (opened.get(a.id) || 0));
    return candidates[0]?.onBack || (config.protectExit ? config.requestExit : config.onBack);
  }
  function addEntry() {
    if (ownsEntry()) { armed = true; return; }
    try {
      history.pushState({ ...history.state, [MOBILE_HISTORY_KEY]: true }, "", windowTarget.location.href);
      armed = true;
    } catch (_) { armed = false; }
  }
  function removeEntry() {
    if (!armed || !ownsEntry() || removing) return;
    armed = false;
    removing = true;
    history.back();
  }
  function onBeforeUnload(event) {
    if (!config.enabled || !config.protectExit) return;
    event.preventDefault();
    event.returnValue = "";
  }
  function sync() {
    if (!active || !history?.pushState) return;
    const needsUnload = !!(config.enabled && config.protectExit);
    if (needsUnload !== unloadBound) {
      windowTarget[needsUnload ? "addEventListener" : "removeEventListener"]("beforeunload", onBeforeUnload);
      unloadBound = needsUnload;
    }
    if (removing) return;
    // No DOM query or sorting on game renders; resolve the top target only
    // when the player actually presses Back.
    const needed = config.enabled && (config.confirming || registry.top() ||
      (config.targets || []).some(item => item.open) || config.protectExit || config.onBack);
    if (needed) addEntry();
    else removeEntry();
  }
  function onPopState() {
    if (removing) { removing = false; sync(); return; }
    if (!armed) return;
    armed = false;
    const onBack = target();
    if (!onBack) return;
    // Reuse the single consumed entry, truncating forward history. A React
    // commit removes it when the last panel/screen closes.
    addEntry();
    onBack();
  }
  return Object.freeze({
    configure(next) {
      config = next;
      const ids = new Set();
      for (const item of next.targets || []) {
        if (!item.open) continue;
        ids.add(item.id);
        if (!opened.has(item.id)) opened.set(item.id, ++sequence);
      }
      for (const id of opened.keys()) if (!ids.has(id)) opened.delete(id);
      sync();
    },
    start() {
      if (active || !windowTarget) return;
      active = true;
      armed = ownsEntry();
      windowTarget.addEventListener("popstate", onPopState);
      unsubscribe = registry.subscribe(sync);
      sync();
    },
    stop() {
      active = false;
      removeEntry();
      windowTarget?.removeEventListener?.("popstate", onPopState);
      windowTarget?.removeEventListener?.("beforeunload", onBeforeUnload);
      unloadBound = false;
      unsubscribe?.();
      unsubscribe = null;
    },
  });
}
