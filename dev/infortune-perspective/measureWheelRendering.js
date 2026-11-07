// Measure the real scene after shader warmup. Visibility changes discard the
// partial sample, so a background tab cannot be mistaken for a slow phone.
import { renderVisibility } from './wheelRenderPlatform.js';
export function measureWheelRendering({ draw, signal, duration = 1200, maxDuration = 4000,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  now = () => performance.now(), visibility = renderVisibility }) {
  return new Promise((resolve, reject) => {
    let frame = null, previous = null, elapsed = 0, visibleElapsed = 0, count = 0, settled = false;
    let intervals = [], costs = [];
    function finish(value, error) {
      if (settled) return;
      settled = true; if (frame !== null) cancelFrame(frame);
      visibility.removeEventListener("visibilitychange", reset);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value);
    }
    function abort() { finish(null); }
    function reset() { previous = null; elapsed = visibleElapsed = 0; count = 0; intervals = []; costs = []; }
    function tick(time) {
      frame = null;
      if (signal?.aborted) return abort();
      if (visibility.hidden) reset();
      else {
        try {
          const start = now(); draw(count++);
          const cost = now() - start;
          if (previous !== null) visibleElapsed += time - previous;
          if (previous !== null && count > 3) { intervals.push(time - previous); costs.push(now() - start); elapsed += time - previous; }
          previous = time;
          if (elapsed >= duration && intervals.length >= 8) return finish({ intervals, costs });
          // A 1 fps device must not spend another 8–12 seconds gathering a
          // statistically neat sample just to discover it needs the 2D view.
          if (visibleElapsed + cost >= maxDuration) return finish({
            intervals: intervals.length ? intervals : [Math.max(cost, visibleElapsed / Math.max(1, count - 1))],
            costs: costs.length ? costs : [cost],
          });
        } catch (error) { return finish(null, error); }
      }
      frame = requestFrame(tick);
    }
    if (signal?.aborted) return abort();
    visibility.addEventListener("visibilitychange", reset);
    signal?.addEventListener("abort", abort, { once: true });
    frame = requestFrame(tick);
  });
}
