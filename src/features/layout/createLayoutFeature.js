import { createStateFeature } from "../../app/core/createStateFeature.js";
import {
  computeIsAndroidWebBrowser,
  computeIsIosStandalone,
  computeIsMobileLayout,
  computeIsUltraCompact,
  getViewportSize,
} from "../../app/adapters/deviceCapabilities.js";
import { isStandaloneDisplayMode } from "../../utils/displayMode.js";
import {
  VIEWPORT_EVENTS,
  createViewportEventHub,
} from "./createViewportEventHub.js";

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
    installSupport: isStandaloneDisplayMode() ? "installed" : "unknown",
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
  const viewportEvents = createViewportEventHub({ scope: context.scope });
  let feature = null;
  const refreshViewportMode = () => {
    if (typeof window === "undefined" || !feature) return;
    const viewport = getViewportSize();
    feature.patch({
      isMobileLayout: computeIsMobileLayout(viewport.width),
      isUltraCompact: computeIsUltraCompact(viewport.width, viewport.height),
    });
  };
  feature = createStateFeature(context, createInitialLayoutState, {
    start: ({ scope, store }) => {
      if (typeof window === "undefined") return;
      let installMessageTimerId = null;
      let installSupportFallbackId = null;
      const updatePlatformState = () => {
        store.patch({
          isAndroidWebBrowser: computeIsAndroidWebBrowser(),
          isIosStandalone: computeIsIosStandalone(),
        });
      };
      const scheduleInstallSupportFallback = () => {
        const state = store.getState();
        if (!state.isMobileLayout || state.installSupport !== "unknown") {
          if (installSupportFallbackId != null) {
            window.clearTimeout(installSupportFallbackId);
            installSupportFallbackId = null;
          }
          return;
        }
        if (installSupportFallbackId != null) return;
        installSupportFallbackId = window.setTimeout(() => {
          installSupportFallbackId = null;
          const current = store.getState();
          if (!current.isMobileLayout || current.installSupport !== "unknown") return;
          const isChromium = /(?:Chrome|CriOS|EdgA|SamsungBrowser)/i.test(
            String(globalThis.navigator?.userAgent || "")
          );
          store.set("installSupport", isChromium ? "maybe" : "unavailable");
        }, 2500);
      };
      const onBeforeInstallPrompt = (event) => {
        event.preventDefault();
        store.patch({ installPrompt: event, installSupport: "available" });
      };
      const onInstalled = () => {
        store.patch({
          installMessage: "Ajouté à l'écran d'accueil",
          installPrompt: null,
          installSupport: "installed",
        });
        if (installMessageTimerId != null) {
          window.clearTimeout(installMessageTimerId);
        }
        installMessageTimerId = window.setTimeout(() => {
          installMessageTimerId = null;
          store.set("installMessage", "");
        }, 3000);
        updatePlatformState();
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") updatePlatformState();
      };
      viewportEvents.start();
      scope.add(
        viewportEvents.subscribe(refreshViewportMode, [
          VIEWPORT_EVENTS.WINDOW_RESIZE,
          VIEWPORT_EVENTS.ORIENTATION_CHANGE,
        ])
      );
      scope.listen(window, "beforeinstallprompt", onBeforeInstallPrompt);
      scope.listen(window, "appinstalled", onInstalled);
      scope.listen(window, "focus", updatePlatformState);
      if (typeof document !== "undefined") {
        scope.listen(document, "visibilitychange", onVisibility);
      }
      updatePlatformState();
      scheduleInstallSupportFallback();
      const unsubscribeFallback = store.subscribe(scheduleInstallSupportFallback);
      scope.add(unsubscribeFallback);
      scope.add(() => {
        if (installMessageTimerId != null) {
          window.clearTimeout(installMessageTimerId);
        }
        if (installSupportFallbackId != null) {
          window.clearTimeout(installSupportFallbackId);
        }
      });
    },
  });
  return Object.freeze({
    ...feature,
    refreshViewportMode,
    subscribeViewport: viewportEvents.subscribe,
  });
}
