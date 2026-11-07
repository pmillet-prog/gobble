// A timer cannot interrupt a synchronous driver call. Check again between GPU
// jobs, so an overrun stops the remaining work instead of starting more passes.
import { renderVisibility } from './wheelRenderPlatform.js';
export function createWheelStartupBudget({ onSlow, limit = 8000, now = () => performance.now(), timers = globalThis, visibility = renderVisibility }) {
  let elapsed = 0, since = visibility.hidden ? null : now(), timer = null, reported = false, stopped = false, disposed = false;
  const duration = () => elapsed + (since === null ? 0 : now() - since);
  function check() {
    if (!disposed && !reported && duration() >= limit) {
      reported = true; stopped = onSlow({ elapsed: duration(), limit }) === true;
    }
    return stopped;
  }
  function arm() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = !disposed && !reported && since !== null ? timers.setTimeout(check, Math.max(0, limit - duration())) : null;
  }
  function changed() {
    elapsed = duration(); since = visibility.hidden ? null : now(); arm();
  }
  visibility.addEventListener("visibilitychange", changed); arm();
  return { check, dispose() {
    disposed = true; if (timer !== null) timers.clearTimeout(timer);
    visibility.removeEventListener("visibilitychange", changed);
  } };
}
