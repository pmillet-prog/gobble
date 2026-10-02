import { isPullToRefreshSurfaceAtTop } from "./nativePullToRefreshPolicy.js";

const PULL_THRESHOLD = 96;
const TOUCH_SLOP = 12;

function createIndicator(document) {
  let indicator;
  return {
    show(progress, loading = false) {
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.setAttribute("role", "status");
        indicator.setAttribute("data-native-pull-refresh", "");
        indicator.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;border-radius:24px;padding:10px 16px;background:#f8fafc;color:#172033;box-shadow:0 3px 16px #0005;font:600 14px system-ui;white-space:nowrap";
        document.body.appendChild(indicator);
      }
      const label = loading ? "Actualisation…" : progress >= 1 ? "Relâche pour actualiser" : "↓ Tire pour actualiser";
      if (indicator.textContent !== label) indicator.textContent = label;
      indicator.style.opacity = String(loading ? 1 : Math.min(1, 0.5 + progress / 2));
    },
    hide() { indicator?.remove(); indicator = null; },
  };
}

// Browser touch events know which nested scroller was touched; Android's outer
// WebView scroll position alone cannot safely distinguish the home from a dialog.
export function createNativePullToRefresh({
  document = globalThis.document,
  window = globalThis.window,
  canRefresh,
  reload,
  feedback = createIndicator(document),
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout,
}) {
  let gesture = null, refreshing = false, resetTimer = null, started = false;
  const eligible = target => canRefresh() && isPullToRefreshSurfaceAtTop(target, document, window);
  const reset = () => {
    gesture = null;
    refreshing = false;
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = null;
    feedback.hide();
  };
  const onStart = event => {
    if (refreshing) return;
    reset();
    if (event.touches.length !== 1 || !eligible(event.target)) return;
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, target: event.target, distance: 0 };
  };
  const onMove = event => {
    if (!gesture) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== gesture.id || !eligible(gesture.target)) { reset(); return; }
    const dx = Math.abs(touch.clientX - gesture.x), dy = touch.clientY - gesture.y;
    if (dy < -TOUCH_SLOP || (dx > TOUCH_SLOP && dx > Math.max(TOUCH_SLOP, dy * 0.65))) { reset(); return; }
    if (dy <= TOUCH_SLOP && gesture.distance === 0) return;
    if (!event.cancelable) { reset(); return; }
    event.preventDefault();
    gesture.distance = Math.max(0, dy);
    feedback.show(gesture.distance / PULL_THRESHOLD);
  };
  const onEnd = event => {
    if (!gesture) return;
    const target = gesture.target;
    const shouldReload = event.touches.length === 0 && gesture.distance >= PULL_THRESHOLD && eligible(gesture.target);
    gesture = null;
    if (!shouldReload) { reset(); return; }
    if (event.cancelable) event.preventDefault();
    refreshing = true;
    feedback.show(1, true);
    // The native promise acknowledges reload; the old document then disappears.
    // Recover the indicator if Android cannot replace the page for any reason.
    resetTimer = setTimeout(reset, 8000);
    Promise.resolve().then(() => {
      if (!started || !refreshing || !eligible(target)) { reset(); return; }
      return reload();
    }).catch(reset);
  };
  const touchOptions = { capture: true, passive: false };
  const handlers = { touchstart: onStart, touchmove: onMove, touchend: onEnd, touchcancel: reset, focusin: reset };
  return {
    start() {
      if (started) return;
      started = true;
      for (const [name, listener] of Object.entries(handlers)) document.addEventListener(name, listener, touchOptions);
      window.addEventListener("pagehide", reset);
      window.addEventListener("blur", reset);
    },
    stop() {
      if (!started) return;
      started = false;
      for (const [name, listener] of Object.entries(handlers)) document.removeEventListener(name, listener, touchOptions);
      window.removeEventListener("pagehide", reset);
      window.removeEventListener("blur", reset);
      reset();
    },
  };
}
