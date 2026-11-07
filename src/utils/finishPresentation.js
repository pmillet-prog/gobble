import { subscribeForegroundClockRefresh } from "./realtimeClock.js";
import { createPresentationFrames } from "./createPresentationFrames.js";

export function nextPresentationTurn() {
  return new Promise(resolve => {
    const frames = createPresentationFrames();
    frames.requestFrame(() => { frames.dispose(); resolve(); });
  });
}

// Web Animations completion events can wait for a paint in a hidden tab.
// Keep the authored duration, but never hold game state behind that paint.
export function finishPresentation(animations, { now = Date.now, timers = globalThis,
  documentTarget = globalThis.document, windowTarget = globalThis.window } = {}) {
  const duration = Math.max(0, ...animations.map(animation => {
    const end = Number(animation.effect?.getComputedTiming?.().endTime) || 0;
    return Math.max(0, end - (Number(animation.currentTime) || 0));
  }));
  const deadline = now() + duration;
  return new Promise(resolve => {
    let done = false, timer, unsubscribe = () => {};
    const finish = () => {
      if (done) return;
      done = true; timers.clearTimeout(timer); unsubscribe(); resolve();
    };
    const expire = () => {
      if (now() < deadline || done) return;
      for (const animation of animations) { try { animation.finish(); } catch {} }
      finish();
    };
    unsubscribe = subscribeForegroundClockRefresh(expire, { documentTarget, windowTarget });
    timer = timers.setTimeout(expire, duration);
    Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
  });
}
