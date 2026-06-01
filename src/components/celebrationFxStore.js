const EMPTY_SNAPSHOT = {
  gobbleFlash: null,
  invalidFlash: null,
  praiseFlash: null,
};

let snapshot = EMPTY_SNAPSHOT;
const listeners = new Set();
const timers = {
  gobbleFlash: null,
  invalidFlash: null,
  praiseFlash: null,
};

function emit(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeCelebrationFx(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCelebrationFxSnapshot() {
  return snapshot;
}

export function clearCelebrationFlash(key) {
  if (!Object.prototype.hasOwnProperty.call(timers, key)) return;
  if (timers[key]) {
    clearTimeout(timers[key]);
    timers[key] = null;
  }
  if (!snapshot[key]) return;
  emit({ ...snapshot, [key]: null });
}

export function clearAllCelebrationFlashes() {
  Object.keys(timers).forEach((key) => {
    if (timers[key]) {
      clearTimeout(timers[key]);
      timers[key] = null;
    }
  });
  if (
    !snapshot.gobbleFlash &&
    !snapshot.invalidFlash &&
    !snapshot.praiseFlash
  ) {
    return;
  }
  emit(EMPTY_SNAPSHOT);
}

export function showCelebrationFlash(key, flash, durationMs = 1200) {
  if (!Object.prototype.hasOwnProperty.call(timers, key) || !flash) return;
  if (timers[key]) {
    clearTimeout(timers[key]);
    timers[key] = null;
  }
  emit({ ...snapshot, [key]: flash });
  timers[key] = setTimeout(() => {
    timers[key] = null;
    if (snapshot[key]?.id !== flash.id) return;
    emit({ ...snapshot, [key]: null });
  }, Math.max(0, Number(durationMs) || 0));
}
