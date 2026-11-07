import { advanceWheelBreak } from './advanceWheelBreak.js';

// A separate deadline also covers a lost "presented" acknowledgement after the
// economy has settled and cancelled its own spin timer.
export function scheduleWheelClosing({ room, round, publish, startNext, onError = console.warn, timers = globalThis, now = Date.now }) {
  const policy = round.infortune;
  if (!policy) return;
  let deadline;
  const current = () => room.currentRound === round && String(room.breakState?.roundId) === String(round.id);
  function advance(economy) {
    if (!current()) return;
    const value = advanceWheelBreak(room, round.id, economy, now());
    if (!value) return;
    timers.clearTimeout(deadline);
    publish(value);
    const timer = timers.setTimeout(() => {
      if (!current() || room.breakState.nextStartAt !== value.nextStartAt) return;
      Promise.resolve().then(() => startNext(room)).catch(onError);
    }, Math.max(0, value.nextStartAt - now()));
    timer?.unref?.();
  }
  deadline = timers.setTimeout(() => {
    if (!current() || room.breakState.wheelFinished) return;
    round.infortuneGame?.close();
    advance(round.infortuneGame?.snapshot());
  }, Math.max(0, policy.openedAt + policy.windowMs - now()));
  deadline?.unref?.();
  advance(round.infortuneGame?.snapshot());
  return advance;
}
