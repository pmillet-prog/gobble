import React from "react";

import { clampValue } from "../../utils/numbers.js";
import {
  createMobileViewportPanGuard,
  isViewportKeyboardTarget,
} from "./createMobileViewportPanGuard.js";
import { VIEWPORT_EVENTS } from "./createViewportEventHub.js";

export function areMobileLayoutSizingsEqual(left, right) {
  if (!left || !right) return false;
  return (
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight &&
    left.gridSide === right.gridSide &&
    left.rankingHeight === right.rankingHeight &&
    left.wordPreviewHeight === right.wordPreviewHeight &&
    left.liveFeedHeight === right.liveFeedHeight &&
    left.liveFeedMinHeight === right.liveFeedMinHeight &&
    left.bodyHeight === right.bodyHeight
  );
}

export function computeMobileGameLayoutSizing({
  baseFontSize,
  bodyHeight,
  maxGridWidth,
  viewportHeight,
  viewportWidth,
}) {
  const safeBodyHeight = Math.max(0, Number(bodyHeight) || 0);
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const safeMaxGridWidth = Math.max(1, Number(maxGridWidth) || 720);
  const safeBaseFontSize = Math.max(1, Number(baseFontSize) || 16);
  const verticalPadding = 4 + 8;
  const layoutGaps = 8 + 4;
  const availableHeight = Math.max(
    0,
    safeBodyHeight - verticalPadding - layoutGaps,
  );
  const blocksBudget = availableHeight > 0 ? availableHeight : safeBodyHeight;
  const availableWidth = Math.max(
    0,
    Math.min(safeViewportWidth - 24, safeMaxGridWidth),
  );
  const liveFeedRowPx = Math.max(12, Math.round(safeBaseFontSize * 1.05));
  const liveFeedHeaderPx = Math.max(12, Math.round(safeBaseFontSize * 1.05));
  const liveFeedGapPx = 4;
  const liveFeedPaddingPx = 16;
  const liveFeedMinHeight =
    liveFeedPaddingPx +
    liveFeedHeaderPx +
    liveFeedGapPx +
    liveFeedRowPx * 3 +
    liveFeedGapPx * 2;
  const minRanking = 120;
  const maxRanking = 150;
  const minPreview = 36;
  let rankingTarget = clampValue(
    Math.round(Math.max(safeBaseFontSize * 7, safeBodyHeight * 0.26)),
    minRanking,
    maxRanking,
  );
  let previewTarget = clampValue(
    Math.round(Math.max(safeBaseFontSize * 2.6, safeBodyHeight * 0.08)),
    minPreview,
    68,
  );
  let requiredBelowGrid = rankingTarget + previewTarget + liveFeedMinHeight;
  let maxGridFromHeight = Math.max(100, blocksBudget - requiredBelowGrid);

  if (maxGridFromHeight < availableWidth) {
    let needed = Math.max(0, availableWidth - maxGridFromHeight);
    if (needed > 0) {
      const previewShrink = Math.min(needed, previewTarget - minPreview);
      previewTarget -= previewShrink;
      needed -= previewShrink;
    }
    if (needed > 0) {
      const rankingShrink = Math.min(needed, rankingTarget - minRanking);
      rankingTarget -= rankingShrink;
    }
    requiredBelowGrid = rankingTarget + previewTarget;
    maxGridFromHeight = Math.max(100, blocksBudget - requiredBelowGrid);
  }

  const gridSide = Math.max(100, Math.min(availableWidth, maxGridFromHeight));
  const remaining = Math.max(0, blocksBudget - gridSide);
  if (remaining <= 0) {
    return {
      viewportWidth: safeViewportWidth,
      viewportHeight: safeViewportHeight,
      gridSide,
      rankingHeight: rankingTarget,
      wordPreviewHeight: previewTarget,
      liveFeedHeight: 0,
      liveFeedMinHeight,
      bodyHeight: safeBodyHeight,
    };
  }

  const reservedLiveFeed = Math.min(remaining, liveFeedMinHeight);
  const remainingAfterFeed = Math.max(0, remaining - reservedLiveFeed);
  let rankingHeight = 0;
  let wordPreviewHeight = 0;
  if (remainingAfterFeed > 0) {
    const previewBias = 1.25;
    const totalTarget = rankingTarget + previewTarget;
    if (remainingAfterFeed >= totalTarget) {
      rankingHeight = rankingTarget;
      wordPreviewHeight = previewTarget;
    } else {
      const weightedTotal = rankingTarget + previewTarget * previewBias;
      const previewShare =
        (previewTarget * previewBias) / Math.max(1, weightedTotal);
      const previewRaw = remainingAfterFeed * previewShare;
      wordPreviewHeight = Math.max(
        0,
        Math.min(previewTarget, Math.floor(previewRaw)),
      );
      rankingHeight = Math.max(0, remainingAfterFeed - wordPreviewHeight);
    }
  }
  const leftover = Math.max(
    0,
    remaining - reservedLiveFeed - rankingHeight - wordPreviewHeight,
  );

  return {
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    gridSide: gridSide || 0,
    rankingHeight: rankingHeight || 0,
    wordPreviewHeight: wordPreviewHeight || 0,
    liveFeedHeight: reservedLiveFeed + leftover,
    liveFeedMinHeight,
    bodyHeight: safeBodyHeight,
  };
}

function createSafeAreaProbe(property, value) {
  if (typeof document === "undefined" || !document.body) return null;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "0";
  probe.style.top = "0";
  probe.style.height = "0";
  probe.style[property] = value;
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  return probe;
}

function removeProbe(probeRef) {
  const probe = probeRef.current;
  if (probe?.parentNode) probe.parentNode.removeChild(probe);
  probeRef.current = null;
}

export default function useMobileLayoutController({
  chat,
  game,
  layout,
}) {
  const {
    gameViewportFreezeHeightRef,
    isChatClosing,
    isChatClosingRef,
    isChatOpenMobile,
    isChatOpenMobileRef,
  } = chat;
  const { gridSize, phase, showHelp } = game;
  const {
    isFullscreen,
    isMobileLayout,
    layoutFeature,
    maxGridWidth,
    setMobileHeaderOffsetPx,
    setMobileLayoutSizing,
  } = layout;
  const mobileHeaderRef = React.useRef(null);
  const mobileHelpRef = React.useRef(null);
  const mobileGameViewportLockRef = React.useRef({ width: 0, height: 0 });
  const safeAreaProbeRef = React.useRef(null);
  const safeAreaTopProbeRef = React.useRef(null);
  const chatScrollLockRef = React.useRef(0);
  const viewportPanGuardRef = React.useRef(null);

  React.useEffect(
    () =>
      layoutFeature.subscribeViewport(() => {
        if (isChatOpenMobileRef.current) return;
        layoutFeature.refreshViewportMode();
      }, [VIEWPORT_EVENTS.VISUAL_RESIZE]),
    [isChatOpenMobileRef, layoutFeature],
  );

  React.useEffect(() => {
    if (!isMobileLayout || typeof screen === "undefined") return;
    const orientation = screen.orientation;
    if (!orientation || typeof orientation.lock !== "function") return;
    orientation.lock("portrait").catch(() => {});
  }, [isMobileLayout]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldLockViewport =
      isMobileLayout && (phase === "playing" || phase === "results");
    if (!shouldLockViewport) {
      mobileGameViewportLockRef.current = { width: 0, height: 0 };
      return;
    }

    const updateViewportLock = () => {
      if (isChatOpenMobileRef.current || isChatClosingRef.current) return;
      const widthCandidates = [
        window.innerWidth,
        document.documentElement?.clientWidth,
      ].filter((value) => Number.isFinite(value) && value > 0);
      const heightCandidates = [
        window.innerHeight,
        document.documentElement?.clientHeight,
      ].filter((value) => Number.isFinite(value) && value > 0);
      const measuredWidth = widthCandidates.length
        ? Math.min(...widthCandidates)
        : 0;
      const measuredHeight = heightCandidates.length
        ? Math.min(...heightCandidates)
        : 0;
      if (!(measuredWidth > 0) || !(measuredHeight > 0)) return;

      const previous = mobileGameViewportLockRef.current || {
        width: 0,
        height: 0,
      };
      const previousWidth = Number(previous.width) || 0;
      const previousHeight = Number(previous.height) || 0;
      const widthDelta = Math.abs(measuredWidth - previousWidth);
      if (!(previousWidth > 0) || !(previousHeight > 0) || widthDelta > 64) {
        mobileGameViewportLockRef.current = {
          width: Math.round(measuredWidth),
          height: Math.round(measuredHeight),
        };
        return;
      }

      const nextHeight = Math.min(previousHeight, Math.round(measuredHeight));
      if (nextHeight !== previousHeight) {
        mobileGameViewportLockRef.current = {
          width: previousWidth,
          height: nextHeight,
        };
      }
    };

    updateViewportLock();
    return layoutFeature.subscribeViewport(updateViewportLock, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
      VIEWPORT_EVENTS.ORIENTATION_CHANGE,
      VIEWPORT_EVENTS.VISUAL_RESIZE,
    ]);
  }, [
    isChatClosing,
    isChatClosingRef,
    isChatOpenMobile,
    isMobileLayout,
    layoutFeature,
    phase,
  ]);

  const measureSafeAreaTopPx = React.useCallback(() => {
    if (typeof window === "undefined") return 0;
    const probe = safeAreaTopProbeRef.current;
    if (!probe) return 0;
    const paddingTop = window.getComputedStyle(probe).paddingTop || "0";
    const value = parseFloat(paddingTop);
    return Number.isFinite(value) ? value : 0;
  }, []);

  const getSafeTopPx = React.useCallback(
    (forceFullscreen = false) => {
      if (!forceFullscreen && !isFullscreen) return 0;
      const measured = measureSafeAreaTopPx();
      if (measured > 0) return Math.round(measured);
      if (typeof window === "undefined") return 0;
      return Math.round(Math.min(48, Math.max(0, window.innerHeight * 0.03)));
    },
    [isFullscreen, measureSafeAreaTopPx],
  );

  const getHeaderOffsetPx = React.useCallback(() => {
    const headerElement = mobileHeaderRef.current;
    if (!headerElement) return 0;
    const rect = headerElement.getBoundingClientRect?.();
    const rectBottom =
      rect && Number.isFinite(rect.bottom) ? Math.round(rect.bottom) : 0;
    if (rectBottom > 0) return rectBottom;
    return Math.round(headerElement.offsetHeight || 0) + getSafeTopPx();
  }, [getSafeTopPx]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileLayout || !(phase === "playing" || phase === "results")) {
      return;
    }

    let frameId = null;
    let timeoutId = null;
    const commitMobileLayoutSizing = (nextLayout) => {
      if (!nextLayout) return;
      setMobileLayoutSizing((previous) =>
        areMobileLayoutSizingsEqual(previous, nextLayout)
          ? previous
          : nextLayout,
      );
    };
    const computeMobileLayoutNow = () => {
      if (document.visibilityState === "hidden") return;
      if (isChatOpenMobileRef.current) return;
      const lockedHeight =
        Number(mobileGameViewportLockRef.current?.height) || 0;
      const lockedWidth = Number(mobileGameViewportLockRef.current?.width) || 0;
      const viewportHeightCandidates = [
        lockedHeight,
        window.innerHeight,
        document.documentElement?.clientHeight,
      ].filter((value) => Number.isFinite(value) && value > 0);
      const viewportWidthCandidates = [
        lockedWidth,
        window.innerWidth,
        document.documentElement?.clientWidth,
      ].filter((value) => Number.isFinite(value) && value > 0);
      const viewportHeight = viewportHeightCandidates.length
        ? Math.min(...viewportHeightCandidates)
        : 0;
      const viewportWidth = viewportWidthCandidates.length
        ? Math.min(...viewportWidthCandidates)
        : 0;
      if (viewportHeight < 120 || viewportWidth < 120) return;

      if (!safeAreaProbeRef.current) {
        safeAreaProbeRef.current = createSafeAreaProbe(
          "paddingBottom",
          "env(safe-area-inset-bottom)",
        );
      }
      if (!safeAreaTopProbeRef.current) {
        safeAreaTopProbeRef.current = createSafeAreaProbe(
          "paddingTop",
          "env(safe-area-inset-top)",
        );
      }

      const headerOffsetPx = getHeaderOffsetPx();
      if (headerOffsetPx > 0) {
        setMobileHeaderOffsetPx((previous) =>
          previous === headerOffsetPx ? previous : headerOffsetPx,
        );
      }
      const helpElement = mobileHelpRef.current;
      const helpHeight = helpElement?.offsetHeight || 0;
      const helpMargins = helpElement
        ? (() => {
            const styles = window.getComputedStyle(helpElement);
            return (
              (parseFloat(styles.marginTop || "0") || 0) +
              (parseFloat(styles.marginBottom || "0") || 0)
            );
          })()
        : 0;
      const safeAreaBottomPx =
        isFullscreen && safeAreaProbeRef.current
          ? parseFloat(
              window.getComputedStyle(safeAreaProbeRef.current).paddingBottom ||
                "0",
            ) || 0
          : 0;
      const bodyHeight = Math.max(
        0,
        viewportHeight -
          headerOffsetPx -
          helpHeight -
          helpMargins -
          5 -
          safeAreaBottomPx,
      );
      if (bodyHeight < 120) return;
      const baseFontSize =
        parseFloat(
          window.getComputedStyle(document.documentElement).fontSize || "16",
        ) || 16;
      commitMobileLayoutSizing(
        computeMobileGameLayoutSizing({
          baseFontSize,
          bodyHeight,
          maxGridWidth,
          viewportHeight,
          viewportWidth,
        }),
      );
    };
    const scheduleComputeMobileLayout = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(computeMobileLayoutNow);
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(computeMobileLayoutNow, 180);
    };

    scheduleComputeMobileLayout();
    const unsubscribeViewport = layoutFeature.subscribeViewport(
      scheduleComputeMobileLayout,
      [
        VIEWPORT_EVENTS.WINDOW_RESIZE,
        VIEWPORT_EVENTS.ORIENTATION_CHANGE,
        VIEWPORT_EVENTS.PAGE_SHOW,
        VIEWPORT_EVENTS.VISUAL_RESIZE,
      ],
    );
    document.addEventListener("visibilitychange", scheduleComputeMobileLayout);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
      unsubscribeViewport();
      document.removeEventListener(
        "visibilitychange",
        scheduleComputeMobileLayout,
      );
      removeProbe(safeAreaProbeRef);
      removeProbe(safeAreaTopProbeRef);
    };
  }, [
    getHeaderOffsetPx,
    gridSize,
    isFullscreen,
    isMobileLayout,
    layoutFeature,
    maxGridWidth,
    phase,
    setMobileHeaderOffsetPx,
    setMobileLayoutSizing,
    showHelp,
  ]);

  React.useEffect(() => {
    if (
      !isMobileLayout ||
      typeof window === "undefined" ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const headerElement = mobileHeaderRef.current;
    if (!headerElement) return;
    const updateHeight = () => {
      const nextOffset = getHeaderOffsetPx();
      if (!nextOffset) return;
      setMobileHeaderOffsetPx((previous) =>
        previous === nextOffset ? previous : nextOffset,
      );
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(headerElement);
    const unsubscribeViewport = layoutFeature.subscribeViewport(updateHeight, [
      VIEWPORT_EVENTS.VISUAL_RESIZE,
    ]);
    return () => {
      observer.disconnect();
      unsubscribeViewport();
    };
  }, [
    getHeaderOffsetPx,
    isFullscreen,
    isMobileLayout,
    layoutFeature,
    setMobileHeaderOffsetPx,
  ]);

  React.useLayoutEffect(() => {
    if (!isMobileLayout) return;
    const headerElement = mobileHeaderRef.current;
    if (!headerElement) return;
    const nextOffset = getHeaderOffsetPx();
    if (!nextOffset) return;
    setMobileHeaderOffsetPx((previous) =>
      previous === nextOffset ? previous : nextOffset,
    );
  }, [
    getHeaderOffsetPx,
    isFullscreen,
    isMobileLayout,
    setMobileHeaderOffsetPx,
  ]);

  const shouldGuardViewportPan =
    isMobileLayout && (phase === "playing" || phase === "results");

  React.useEffect(() => {
    if (!shouldGuardViewportPan) return undefined;
    const guard = createMobileViewportPanGuard({
      documentTarget: document,
      isChatKeyboardExpected: () =>
        isChatOpenMobileRef.current &&
        isViewportKeyboardTarget(document.activeElement),
      subscribeViewport: (listener) =>
        layoutFeature.subscribeViewport(listener, [
          VIEWPORT_EVENTS.VISUAL_RESIZE,
          VIEWPORT_EVENTS.VISUAL_SCROLL,
        ]),
      windowTarget: window,
    });
    viewportPanGuardRef.current = guard;
    return () => {
      if (viewportPanGuardRef.current === guard) {
        viewportPanGuardRef.current = null;
      }
      guard.dispose();
    };
  }, [isChatOpenMobileRef, layoutFeature, shouldGuardViewportPan]);

  React.useEffect(() => {
    if (!shouldGuardViewportPan || isChatOpenMobile || isChatClosing) return;
    viewportPanGuardRef.current?.scheduleRecovery();
    layoutFeature.refreshViewportMode();
  }, [
    isChatClosing,
    isChatOpenMobile,
    layoutFeature,
    shouldGuardViewportPan,
  ]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileLayout || (phase !== "playing" && phase !== "results")) return;
    window.scrollTo(0, 0);
  }, [isMobileLayout, phase]);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const shouldLock =
      (isMobileLayout && (phase === "playing" || phase === "results")) ||
      isChatOpenMobile ||
      isChatClosing;
    if (!shouldLock) return;

    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    const previous = {
      body: {
        height: bodyStyle.height,
        left: bodyStyle.left,
        overflow: bodyStyle.overflow,
        overscrollBehavior: bodyStyle.overscrollBehavior,
        position: bodyStyle.position,
        right: bodyStyle.right,
        top: bodyStyle.top,
        touchAction: bodyStyle.touchAction,
        width: bodyStyle.width,
      },
      root: {
        height: rootStyle.height,
        left: rootStyle.left,
        overflow: rootStyle.overflow,
        overscrollBehavior: rootStyle.overscrollBehavior,
        position: rootStyle.position,
        right: rootStyle.right,
        width: rootStyle.width,
      },
    };

    bodyStyle.overflow = "hidden";
    rootStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";
    rootStyle.overscrollBehavior = "none";
    rootStyle.position = "fixed";
    rootStyle.width = "100%";
    rootStyle.left = "0";
    rootStyle.right = "0";
    bodyStyle.position = "fixed";
    bodyStyle.width = "100%";
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.touchAction = "none";
    if (!chatScrollLockRef.current) chatScrollLockRef.current = window.scrollY || 0;
    bodyStyle.top = `-${chatScrollLockRef.current}px`;
    window.scrollTo(0, 0);

    const applyLockedHeight = () => {
      const frozen =
        (isChatOpenMobileRef.current || isChatClosing) &&
        gameViewportFreezeHeightRef.current > 0
          ? gameViewportFreezeHeightRef.current
          : 0;
      const lockedGameHeight =
        Number(mobileGameViewportLockRef.current?.height) || 0;
      const candidates = frozen
        ? [frozen]
        : [
            lockedGameHeight,
            window.innerHeight,
            document.documentElement?.clientHeight,
          ];
      const validCandidates = candidates.filter(
        (value) => Number.isFinite(value) && value > 0,
      );
      const height = validCandidates.length
        ? Math.min(...validCandidates)
        : 0;
      if (height > 0) {
        const pixels = `${Math.round(height)}px`;
        bodyStyle.height = pixels;
        rootStyle.height = pixels;
      }
    };
    applyLockedHeight();
    const unsubscribeViewport = layoutFeature.subscribeViewport(
      applyLockedHeight,
      [VIEWPORT_EVENTS.WINDOW_RESIZE, VIEWPORT_EVENTS.VISUAL_RESIZE],
    );
    return () => {
      unsubscribeViewport();
      Object.assign(bodyStyle, previous.body);
      Object.assign(rootStyle, previous.root);
      if (chatScrollLockRef.current) {
        window.scrollTo(0, chatScrollLockRef.current);
        chatScrollLockRef.current = 0;
      }
    };
  }, [
    gameViewportFreezeHeightRef,
    isChatClosing,
    isChatOpenMobile,
    isChatOpenMobileRef,
    isMobileLayout,
    layoutFeature,
    phase,
  ]);

  return {
    mobileGameViewportLockRef,
    mobileHeaderRef,
    mobileHelpRef,
  };
}
