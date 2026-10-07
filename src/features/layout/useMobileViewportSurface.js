import { useLayoutEffect, useRef } from "react";
import { computeIsMobileLayout } from "../../app/adapters/deviceCapabilities.js";
import { acquireMobileGameViewportTracker, lockMobileGameDocument } from "./mobileGameViewport.js";

// Screens use the stable layout surface; the chat independently follows the
// keyboard-sized visual viewport. No React render is needed while it pans.
export default function useMobileViewportSurface({ enabled = true, lockDocument = false } = {}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let release = null;
    const reconcile = () => {
      const mobile = computeIsMobileLayout();
      if (mobile === !!release) return;
      if (!mobile) {
        release();
        release = null;
        return;
      }
      const acquired = acquireMobileGameViewportTracker();
      const style = element.style;
      const surfaceStyle = {
        position: "fixed", left: "0", right: "0", width: "100%",
        top: "var(--mobile-viewport-offset-top, 0px)",
        height: "var(--mobile-viewport-height)",
        minHeight: "var(--mobile-viewport-height)",
        maxHeight: "var(--mobile-viewport-height)",
      };
      const previous = Object.fromEntries(Object.keys(surfaceStyle).map(key => [key, style[key]]));
      Object.assign(style, surfaceStyle);
      const unlock = lockDocument ? lockMobileGameDocument({ tracker: acquired.tracker }) : null;
      release = () => {
        unlock?.();
        Object.assign(style, previous);
        acquired.release();
      };
    };
    reconcile();
    window.addEventListener("resize", reconcile, { passive: true });
    return () => {
      window.removeEventListener("resize", reconcile);
      release?.();
    };
  }, [enabled, lockDocument]);
  return ref;
}
