import React from "react";

import { clampValue } from "../../utils/numbers.js";
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
    left.liveActionBarHeight === right.liveActionBarHeight &&
    left.adaptiveRanking === right.adaptiveRanking &&
    left.targetHintHeight === right.targetHintHeight &&
    left.bodyHeight === right.bodyHeight
  );
}

export function resolveMobileGameViewportLock(previous, measured) {
  const measuredWidth = Math.max(0, Math.round(Number(measured?.width) || 0));
  const measuredHeight = Math.max(0, Math.round(Number(measured?.height) || 0));
  const previousWidth = Math.max(0, Math.round(Number(previous?.width) || 0));
  const previousHeight = Math.max(0, Math.round(Number(previous?.height) || 0));
  if (!(measuredWidth > 0) || !(measuredHeight > 0)) {
    return { width: previousWidth, height: previousHeight };
  }
  if (
    !(previousWidth > 0) ||
    !(previousHeight > 0) ||
    measuredWidth !== previousWidth
  ) {
    return { width: measuredWidth, height: measuredHeight };
  }
  return { width: previousWidth, height: previousHeight };
}

export function computeMobileGameLayoutSizing({
  baseFontSize,
  bodyHeight,
  maxGridWidth,
  adaptiveRanking = false,
  roundType = null,
  showLiveActionBar = false,
  viewportHeight,
  viewportWidth,
}) {
  const safeBodyHeight = Math.max(0, Number(bodyHeight) || 0);
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const safeMaxGridWidth = Math.max(1, Number(maxGridWidth) || 720);
  const safeBaseFontSize = Math.max(1, Number(baseFontSize) || 16);
  const verticalPadding = 4 + 8;
  let liveActionBarHeight = showLiveActionBar
    ? clampValue(Math.round(safeViewportWidth * 0.18), 66, 78)
    : 0;
  const layoutGaps = 8 + 4 + (liveActionBarHeight > 0 ? 4 : 0);
  const availableHeight = Math.max(
    0,
    safeBodyHeight - verticalPadding - layoutGaps - liveActionBarHeight,
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
  const reserveTargetFeed = showLiveActionBar &&
    (roundType === "target_long" || roundType === "target_score");
  if (adaptiveRanking || reserveTargetFeed) {
    // Compact the surrounding UI first, then shrink the board only if needed.
    const minTopBlock = reserveTargetFeed ? 80 : 90;
    const maxTopBlock = reserveTargetFeed ? 100 : 128;
    const minPreview = 30;
    // Target announcements include both the player and their completion time.
    const minFeed = reserveTargetFeed ? 60 : 40;
    const availableBelowGrid = Math.max(
      0, safeBodyHeight - verticalPadding - layoutGaps - availableWidth,
    );
    if (liveActionBarHeight > 0) {
      liveActionBarHeight = clampValue(
        availableBelowGrid - minTopBlock - minPreview - minFeed,
        52, // 44px touch targets + 8px of vertical breathing room.
        liveActionBarHeight,
      );
    }
    const contentHeight = Math.max(
      0, safeBodyHeight - verticalPadding - layoutGaps - liveActionBarHeight,
    );
    const gridSide = Math.min(
      availableWidth,
      Math.max(0, contentHeight - minTopBlock - minPreview - minFeed),
    );
    const remaining = Math.max(0, contentHeight - gridSide);
    const previewTarget = clampValue(Math.round(safeBodyHeight * 0.08), 30, 51);
    const wordPreviewHeight = clampValue(
      remaining - minTopBlock - liveFeedMinHeight, minPreview, previewTarget,
    );
    const topBlockHeight = clampValue(
      remaining - wordPreviewHeight - liveFeedMinHeight, minTopBlock, maxTopBlock,
    );
    const liveFeedHeight = Math.max(minFeed, remaining - topBlockHeight - wordPreviewHeight);
    return {
      adaptiveRanking: !reserveTargetFeed,
      ...(reserveTargetFeed ? { targetHintHeight: topBlockHeight } : {}),
      viewportWidth: safeViewportWidth,
      viewportHeight: safeViewportHeight,
      gridSide,
      rankingHeight: reserveTargetFeed ? 0 : topBlockHeight,
      wordPreviewHeight,
      liveFeedHeight,
      liveFeedMinHeight: minFeed,
      liveActionBarHeight,
      bodyHeight: safeBodyHeight,
    };
  }
  const minRanking = 118;
  const maxRanking = 128;
  const minPreview = 30;
  let rankingTarget = clampValue(
    Math.round(Math.max(safeBaseFontSize * 7.5, safeBodyHeight * 0.21)),
    minRanking,
    maxRanking,
  );
  let previewTarget = clampValue(
    Math.round(Math.max(safeBaseFontSize * 2.6, safeBodyHeight * 0.08)),
    minPreview,
    34 + liveFeedRowPx,
  );
  const minimumBlocksBelowGrid = minRanking + minPreview;
  const maxGridFromHeight = Math.max(
    100,
    blocksBudget - minimumBlocksBelowGrid,
  );
  const gridSide = Math.max(100, Math.min(availableWidth, maxGridFromHeight));
  const remaining = Math.max(0, blocksBudget - gridSide);
  let rankingHeight = 0;
  let wordPreviewHeight = 0;
  const totalTarget = rankingTarget + previewTarget;
  if (remaining >= totalTarget) {
    rankingHeight = rankingTarget;
    wordPreviewHeight = previewTarget;
  } else if (remaining >= minimumBlocksBelowGrid) {
    const extraSpace = remaining - minimumBlocksBelowGrid;
    const rankingExtraTarget = rankingTarget - minRanking;
    const previewExtraTarget = previewTarget - minPreview;
    const totalExtraTarget = rankingExtraTarget + previewExtraTarget;
    const previewExtra = Math.min(
      previewExtraTarget,
      Math.round(
        extraSpace * (previewExtraTarget / Math.max(1, totalExtraTarget)),
      ),
    );
    wordPreviewHeight = minPreview + previewExtra;
    rankingHeight = Math.min(
      rankingTarget,
      minRanking + Math.max(0, extraSpace - previewExtra),
    );
  } else if (remaining > 0) {
    const previewBias = 1.25;
    const weightedTotal = rankingTarget + previewTarget * previewBias;
    const previewShare =
      (previewTarget * previewBias) / Math.max(1, weightedTotal);
    const previewRaw = remaining * previewShare;
    wordPreviewHeight = Math.max(
      0,
      Math.min(previewTarget, Math.floor(previewRaw)),
    );
    rankingHeight = Math.max(0, remaining - wordPreviewHeight);
  }
  const liveFeedHeight = Math.max(
    0,
    remaining - rankingHeight - wordPreviewHeight,
  );

  return {
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    gridSide: gridSide || 0,
    rankingHeight: rankingHeight || 0,
    wordPreviewHeight: wordPreviewHeight || 0,
    liveFeedHeight,
    liveFeedMinHeight,
    liveActionBarHeight,
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

function minPositive(values) {
  const valid = values.filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  return valid.length ? Math.min(...valid) : 0;
}

export default function useMobileLayoutController({
  game,
  layout,
}) {
  const { gridSize, phase, roundType, showHelp } = game;
  const {
    isFullscreen,
    isMobileLayout,
    layoutFeature,
    maxGridWidth,
    adaptiveRanking = false,
    showLiveActionBar = false,
    setMobileHeaderOffsetPx,
    setMobileLayoutSizing,
  } = layout;
  const mobileHeaderRef = React.useRef(null);
  const mobileHelpRef = React.useRef(null);
  const mobileGameViewportLockRef = React.useRef({ width: 0, height: 0 });
  const safeAreaProbeRef = React.useRef(null);
  const safeAreaTopProbeRef = React.useRef(null);
  const documentScrollLockRef = React.useRef(0);

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

      mobileGameViewportLockRef.current = resolveMobileGameViewportLock(
        mobileGameViewportLockRef.current,
        { width: measuredWidth, height: measuredHeight },
      );
    };

    updateViewportLock();
    return layoutFeature.subscribeViewport(updateViewportLock, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
      VIEWPORT_EVENTS.ORIENTATION_CHANGE,
    ]);
  }, [
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
      const lockedHeight =
        Number(mobileGameViewportLockRef.current?.height) || 0;
      const lockedWidth = Number(mobileGameViewportLockRef.current?.width) || 0;
      const viewportHeight = lockedHeight || minPositive(
        [
          window.innerHeight,
          document.documentElement?.clientHeight,
        ],
      );
      const viewportWidth = lockedWidth || minPositive(
        [
          window.innerWidth,
          document.documentElement?.clientWidth,
        ],
      );
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
          adaptiveRanking,
          roundType,
          showLiveActionBar,
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
    const headerObserver = typeof ResizeObserver === "undefined"
      ? null : new ResizeObserver(scheduleComputeMobileLayout);
    if (mobileHeaderRef.current) headerObserver?.observe(mobileHeaderRef.current);
    const unsubscribeViewport = layoutFeature.subscribeViewport(
      scheduleComputeMobileLayout,
      [
        VIEWPORT_EVENTS.WINDOW_RESIZE,
        VIEWPORT_EVENTS.ORIENTATION_CHANGE,
        VIEWPORT_EVENTS.PAGE_SHOW,
      ],
    );
    document.addEventListener("visibilitychange", scheduleComputeMobileLayout);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
      unsubscribeViewport();
      headerObserver?.disconnect();
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
    adaptiveRanking,
    phase,
    roundType,
    setMobileHeaderOffsetPx,
    setMobileLayoutSizing,
    showLiveActionBar,
    showHelp,
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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileLayout || (phase !== "playing" && phase !== "results")) return;
    window.scrollTo(0, 0);
  }, [isMobileLayout, phase]);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const shouldLock =
      isMobileLayout && (phase === "playing" || phase === "results");
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
    if (!documentScrollLockRef.current) {
      documentScrollLockRef.current = window.scrollY || 0;
    }
    bodyStyle.top = `-${documentScrollLockRef.current}px`;
    window.scrollTo(0, 0);

    const applyLockedHeight = () => {
      const lockedGameHeight =
        Number(mobileGameViewportLockRef.current?.height) || 0;
      const candidates = lockedGameHeight
        ? [lockedGameHeight]
        : [window.innerHeight, document.documentElement?.clientHeight];
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
    return () => {
      Object.assign(bodyStyle, previous.body);
      Object.assign(rootStyle, previous.root);
      if (documentScrollLockRef.current) {
        window.scrollTo(0, documentScrollLockRef.current);
        documentScrollLockRef.current = 0;
      }
    };
  }, [
    isMobileLayout,
    phase,
  ]);

  return {
    mobileGameViewportLockRef,
    mobileHeaderRef,
    mobileHelpRef,
  };
}
