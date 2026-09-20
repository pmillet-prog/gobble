import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { createGobblarsRewardQueue } from "./createGobblarsRewardQueue.js";

export function createNotificationsFeature(
  { scope },
  { clearTimeoutFn = clearTimeout, setTimeoutFn = setTimeout, now = Date.now } = {}
) {
  const store = createFeatureStore({ toasts: [], gobblarsReward: null });
  const timers = new Map();
  const gobblars = createGobblarsRewardQueue({
    publish: reward => store.set("gobblarsReward", reward), now, clearTimeoutFn, setTimeoutFn,
  });

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
    gobblars.clear();
  }

  function show(message, durationMs = 2800, options = {}) {
    if (options?.gobblarsReward) return gobblars.enqueue(options.gobblarsReward);
    const text = String(message || "").trim();
    if (!text) return null;
    const displayMs = Math.max(1500, Math.round((Number(durationMs) || 2800) + 500));
    const toast = Object.freeze({
      durationMs: displayMs,
      iconAlt: typeof options?.iconAlt === "string" ? options.iconAlt : "",
      iconSrc: typeof options?.iconSrc === "string" ? options.iconSrc : "",
      id: Date.now() + Math.random(),
      message: text,
      avatarReward: options?.avatarReward || null,
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
