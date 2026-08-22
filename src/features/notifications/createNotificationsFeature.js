import { createFeatureStore } from "../../app/core/createFeatureStore.js";

export function createNotificationsFeature(
  { scope },
  { clearTimeoutFn = clearTimeout, setTimeoutFn = setTimeout } = {}
) {
  const store = createFeatureStore({ toasts: [] });
  const timers = new Map();

  function remove(id) {
    const timerId = timers.get(id);
    if (timerId != null) clearTimeoutFn(timerId);
    timers.delete(id);
    store.set("toasts", (current) => current.filter((entry) => entry.id !== id));
  }

  function clear() {
    for (const timerId of timers.values()) clearTimeoutFn(timerId);
    timers.clear();
    store.set("toasts", []);
  }

  function show(message, durationMs = 2800, options = {}) {
    const text = String(message || "").trim();
    if (!text) return null;
    const displayMs = Math.max(1500, Math.round((Number(durationMs) || 2800) + 500));
    const toast = Object.freeze({
      durationMs: displayMs,
      iconAlt: typeof options?.iconAlt === "string" ? options.iconAlt : "",
      iconSrc: typeof options?.iconSrc === "string" ? options.iconSrc : "",
      id: Date.now() + Math.random(),
      message: text,
      position: options?.position === "top-left" ? "top-left" : "top-right",
    });
    store.set("toasts", (current) => [...current, toast].slice(-6));
    const timerId = setTimeoutFn(() => {
      timers.delete(toast.id);
      store.set("toasts", (current) =>
        current.filter((entry) => entry.id !== toast.id)
      );
    }, displayMs);
    timers.set(toast.id, timerId);
    return toast;
  }

  function start() {
    scope.add(clear);
  }

  return Object.freeze({ clear, remove, show, start, store });
}
