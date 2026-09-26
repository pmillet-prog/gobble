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

function readViewportMode() {
  const viewport = getViewportSize();
  const type = globalThis.screen?.orientation?.type;
  const angle = globalThis.window?.orientation;
  return {
    ...viewport,
    isMobileLayout: computeIsMobileLayout(),
    isUltraCompact: computeIsUltraCompact(),
    landscape: type?.startsWith("landscape") ? true : type?.startsWith("portrait") ? false
      : typeof angle === "number" ? Math.abs(angle) === 90 : viewport.width > viewport.height,
  };
}

export function createInitialLayoutState(viewport = readViewportMode()) {
  return {
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
    isMobileLayout: viewport.isMobileLayout,
    isUltraCompact: viewport.isUltraCompact,
    mobileHeaderOffsetPx: 0,
    mobileLayoutSizing: {
      bodyHeight: 0,
      gridSide: 0,
      liveFeedHeight: 0,
      liveFeedMinHeight: 0,
      liveActionBarHeight: 0,
      rankingHeight: 0,
      viewportHeight: 0,
      viewportWidth: 0,
      wordPreviewHeight: 0,
    },
    playColumnHeight: null,
  };
}

export function createLayoutFeature(
  context,
  {
    cancelAnimationFrameFn = (id) => globalThis.window?.cancelAnimationFrame?.(id),
    documentTarget = globalThis.document,
    HTMLElementCtor = globalThis.HTMLElement,
    requestAnimationFrameFn = (callback) =>
      globalThis.window?.requestAnimationFrame?.(callback),
    viewportEventsOptions = {},
    windowTarget = globalThis.window,
    readViewportModeFn = readViewportMode,
  } = {}
) {
  const viewportEvents = createViewportEventHub(
    { scope: context.scope },
    { windowTarget, ...viewportEventsOptions }
  );
  let feature = null;
  let foregroundGuardActive = false;
  let foregroundGuardAttached = false;
  let foregroundGuardConfig = {};
  let foregroundGridRafId = null;
  let foregroundPageShowUnsubscribe = null;
  let viewportMode = readViewportModeFn();
  let mobileLandscapeDesktopEnabled = false;
  const applyViewportMode = () => {
    const desktopOverride = mobileLandscapeDesktopEnabled && viewportMode.isMobileLayout && viewportMode.landscape;
    feature.patch({
      isMobileLayout: viewportMode.isMobileLayout && !desktopOverride,
      isUltraCompact: viewportMode.isUltraCompact && !desktopOverride,
    });
  };
  const refreshViewportMode = (event) => {
    if (!windowTarget || !feature) return;
    const viewport = readViewportModeFn();
    if (
      viewportMode.width > 0 &&
      Math.abs(viewport.width - viewportMode.width) <= 64 &&
      !event?.types?.includes(VIEWPORT_EVENTS.ORIENTATION_CHANGE)
    ) {
      // Keyboard and browser-chrome height changes must not switch the game
      // between its standard and ultra-compact layouts.
      return;
    }
    viewportMode = viewport;
    applyViewportMode();
  };
  function configureMobileLandscapeDesktop(enabled) {
    if (mobileLandscapeDesktopEnabled === (enabled === true)) return;
    mobileLandscapeDesktopEnabled = enabled === true;
    // Use the last rotation/width sample: an open keyboard must not turn a
    // portrait phone into a landscape display when changing this preference.
    applyViewportMode();
  }

  const cancelForegroundGridRestore = () => {
    if (foregroundGridRafId != null) cancelAnimationFrameFn?.(foregroundGridRafId);
    foregroundGridRafId = null;
  };

  const restoreForegroundGrid = () => {
    if (!foregroundGuardConfig.enabled) return;
    const gridElement = foregroundGuardConfig.gridElement;
    if (!gridElement) return;
    if (
      typeof HTMLElementCtor === "function" &&
      !(gridElement instanceof HTMLElementCtor)
    ) {
      return;
    }
    const inlineOpacity = `${gridElement.style?.opacity || ""}`.trim();
    const computedOpacity = Number.parseFloat(
      windowTarget?.getComputedStyle?.(gridElement)?.opacity || "1"
    );
    const looksHidden =
      inlineOpacity === "0" ||
      inlineOpacity === "0.0" ||
      (Number.isFinite(computedOpacity) && computedOpacity <= 0.05);
    if (!looksHidden || !gridElement.style) return;
    gridElement.style.opacity = "";
    gridElement.style.transition = "";
  };

  const scheduleForegroundGridRestore = () => {
    if (!foregroundGuardConfig.enabled) return;
    if (
      documentTarget?.visibilityState &&
      documentTarget.visibilityState !== "visible"
    ) {
      return;
    }
    cancelForegroundGridRestore();
    foregroundGridRafId = requestAnimationFrameFn?.(() => {
      foregroundGridRafId = null;
      restoreForegroundGrid();
    });
    if (foregroundGridRafId == null) restoreForegroundGrid();
  };

  const onForegroundVisibility = () => {
    if (documentTarget?.visibilityState === "visible") {
      scheduleForegroundGridRestore();
    }
  };

  function detachForegroundGridGuard() {
    if (!foregroundGuardAttached) return;
    foregroundGuardAttached = false;
    windowTarget?.removeEventListener?.("focus", scheduleForegroundGridRestore);
    documentTarget?.removeEventListener?.("visibilitychange", onForegroundVisibility);
    foregroundPageShowUnsubscribe?.();
    foregroundPageShowUnsubscribe = null;
    cancelForegroundGridRestore();
  }

  function reconcileForegroundGridGuard() {
    if (!foregroundGuardActive || !foregroundGuardConfig.enabled) {
      detachForegroundGridGuard();
      return;
    }
    if (!foregroundGuardAttached) {
      foregroundGuardAttached = true;
      windowTarget?.addEventListener?.("focus", scheduleForegroundGridRestore);
      documentTarget?.addEventListener?.("visibilitychange", onForegroundVisibility);
      foregroundPageShowUnsubscribe = viewportEvents.subscribe(
        scheduleForegroundGridRestore,
        [VIEWPORT_EVENTS.PAGE_SHOW]
      );
    }
    scheduleForegroundGridRestore();
  }

  function configureForegroundGridGuard(nextConfig = {}) {
    foregroundGuardConfig = { ...foregroundGuardConfig, ...nextConfig };
    reconcileForegroundGridGuard();
  }

  feature = createStateFeature(context, () => createInitialLayoutState(viewportMode), {
    start: ({ scope, store }) => {
      if (!windowTarget) return;
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
            windowTarget.clearTimeout(installSupportFallbackId);
            installSupportFallbackId = null;
          }
          return;
        }
        if (installSupportFallbackId != null) return;
        installSupportFallbackId = windowTarget.setTimeout(() => {
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
          windowTarget.clearTimeout(installMessageTimerId);
        }
        installMessageTimerId = windowTarget.setTimeout(() => {
          installMessageTimerId = null;
          store.set("installMessage", "");
        }, 3000);
        updatePlatformState();
      };
      const onVisibility = () => {
        if (documentTarget?.visibilityState === "visible") updatePlatformState();
      };
      viewportEvents.start();
      foregroundGuardActive = true;
      reconcileForegroundGridGuard();
      scope.add(
        viewportEvents.subscribe(refreshViewportMode, [
          VIEWPORT_EVENTS.WINDOW_RESIZE,
          VIEWPORT_EVENTS.ORIENTATION_CHANGE,
        ])
      );
      scope.listen(windowTarget, "beforeinstallprompt", onBeforeInstallPrompt);
      scope.listen(windowTarget, "appinstalled", onInstalled);
      scope.listen(windowTarget, "focus", updatePlatformState);
      if (documentTarget) {
        scope.listen(documentTarget, "visibilitychange", onVisibility);
      }
      updatePlatformState();
      scheduleInstallSupportFallback();
      const unsubscribeFallback = store.subscribe(scheduleInstallSupportFallback);
      scope.add(unsubscribeFallback);
      scope.add(() => {
        foregroundGuardActive = false;
        detachForegroundGridGuard();
        foregroundGuardConfig = {};
        if (installMessageTimerId != null) {
          windowTarget.clearTimeout(installMessageTimerId);
        }
        if (installSupportFallbackId != null) {
          windowTarget.clearTimeout(installSupportFallbackId);
        }
      });
    },
  });
  return Object.freeze({
    ...feature,
    configureForegroundGridGuard,
    configureMobileLandscapeDesktop,
    refreshViewportMode,
    subscribeViewport: viewportEvents.subscribe,
  });
}
