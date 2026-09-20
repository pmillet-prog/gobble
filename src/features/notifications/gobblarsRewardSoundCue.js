import { GOBBLARS_COUNT_START } from "./gobblarsRewardAnimation.js";
export const GOBBLARS_SOUND_START = GOBBLARS_COUNT_START;

export function scheduleGobblarsRewardSound(reward, {
  play, visible = () => true, now = Date.now, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout,
}) {
  const due = reward.startedAt + GOBBLARS_SOUND_START;
  let handle;
  let cancelled = false;
  const delay = due - now();
  // Never replay an old jingle after remounting or returning from another tab.
  if (delay < -100) return () => {};
  const timer = setTimeoutFn(() => {
    if (!visible() || now() - due > 100) return;
    handle = play();
  }, Math.max(0, delay));
  return () => { if (cancelled) return; cancelled = true; clearTimeoutFn(timer); handle?.stop?.(); };
}
