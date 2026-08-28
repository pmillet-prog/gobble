const FLASH_KEYS = Object.freeze([
  "gobbleFlash",
  "invalidFlash",
  "praiseFlash",
]);
const EMPTY_SNAPSHOT = Object.freeze({
  gobbleFlash: null,
  invalidFlash: null,
  praiseFlash: null,
});

export function createCelebrationFeature(
  { scope },
  {
    clearTimeoutFn = clearTimeout,
    setTimeoutFn = setTimeout,
  } = {}
) {
  let snapshot = EMPTY_SNAPSHOT;
  let stopped = false;
  const listeners = new Set();
  const timers = new Map();

  function isValidKey(key) {
    return FLASH_KEYS.includes(key);
  }

  function emit(next) {
    if (stopped || next === snapshot) return false;
    snapshot = next;
    for (const listener of [...listeners]) listener();
    return true;
  }

  function cancelTimer(key) {
    const timerId = timers.get(key);
    if (timerId == null) return;
    clearTimeoutFn(timerId);
    timers.delete(key);
  }

  function clearCelebrationFlash(key) {
    if (!isValidKey(key)) return false;
    cancelTimer(key);
    if (!snapshot[key]) return false;
    return emit({ ...snapshot, [key]: null });
  }

  function clearAllCelebrationFlashes() {
    for (const key of FLASH_KEYS) cancelTimer(key);
    if (FLASH_KEYS.every((key) => !snapshot[key])) return false;
    return emit(EMPTY_SNAPSHOT);
  }

  function showCelebrationFlash(key, flash, durationMs = 1200) {
    if (stopped || !isValidKey(key) || !flash) return false;
    cancelTimer(key);
    emit({ ...snapshot, [key]: flash });
    const timerId = setTimeoutFn(() => {
      if (timers.get(key) !== timerId) return;
      timers.delete(key);
      if (stopped || snapshot[key]?.id !== flash.id) return;
      emit({ ...snapshot, [key]: null });
    }, Math.max(0, Number(durationMs) || 0));
    timers.set(key, timerId);
    return true;
  }

  function getSnapshot() {
    return snapshot;
  }

  function subscribe(listener) {
    if (stopped || typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function start() {
    stopped = false;
    scope.add(() => {
      for (const key of FLASH_KEYS) cancelTimer(key);
      stopped = true;
      snapshot = EMPTY_SNAPSHOT;
      listeners.clear();
    });
  }

  return Object.freeze({
    clearAllCelebrationFlashes,
    clearCelebrationFlash,
    getSnapshot,
    showCelebrationFlash,
    start,
    subscribe,
  });
}
