import { createStateFeature } from "../../app/core/createStateFeature.js";
import {
  computeIsAndroidWebBrowser,
  computeIsIosStandalone,
  computeIsMobileLayout,
  computeIsUltraCompact,
  getViewportSize,
} from "../../app/adapters/deviceCapabilities.js";

export function createInitialLayoutState() {
  const viewport = getViewportSize();
  return {
    chatKeyboardInsetPx: 0,
    desktopColumnDragId: null,
    desktopColumnFractions: null,
    desktopColumnHandleLayout: [],
    desktopColumnOrder: null,
    desktopColumnResizeActiveIndex: null,
    desktopGridMetrics: { gapPx: 24, width: 0 },
    desktopMainGridHeight: null,
    desktopResultsDrawerLayout: null,
    desktopViewportResizeInProgress: false,
    gridWidth: null,
    installMessage: "",
    installPrompt: null,
    installSupport: "unknown",
    isAndroidWebBrowser: computeIsAndroidWebBrowser(),
    isIosStandalone: computeIsIosStandalone(),
    isMobileLayout: computeIsMobileLayout(viewport.width),
    isUltraCompact: computeIsUltraCompact(viewport.width, viewport.height),
    mobileHeaderOffsetPx: 0,
    mobileLayoutSizing: {
      bodyHeight: 0,
      gridSide: 0,
      liveFeedHeight: 0,
      liveFeedMinHeight: 0,
      rankingHeight: 0,
      viewportHeight: 0,
      viewportWidth: 0,
      wordPreviewHeight: 0,
    },
    mobileSpecial3Step1GhostStyle: null,
    mobileSpecial3Step2OverlayStyle: null,
    playColumnHeight: null,
  };
}

export function createLayoutFeature(context) {
  return createStateFeature(context, createInitialLayoutState, {
    start: ({ scope, store }) => {
      if (typeof window === "undefined") return;
      let frameId = null;
      const update = () => {
        frameId = null;
        const viewport = getViewportSize();
        store.patch({
          isMobileLayout: computeIsMobileLayout(viewport.width),
          isUltraCompact: computeIsUltraCompact(viewport.width, viewport.height),
        });
      };
      const schedule = () => {
        if (frameId != null) return;
        frameId = window.requestAnimationFrame(update);
      };
      scope.listen(window, "resize", schedule, { passive: true });
      scope.listen(window, "orientationchange", schedule, { passive: true });
      scope.add(() => {
        if (frameId != null) window.cancelAnimationFrame(frameId);
      });
    },
  });
}
