import React from "react";

import { clampValue } from "../../utils/numbers.js";
import { VIEWPORT_EVENTS } from "./createViewportEventHub.js";
import {
  acquireMobileGameViewportTracker,
  lockMobileGameDocument,
} from "./mobileGameViewport.js";

export { resolveMobileGameViewportLock } from "./mobileGameViewport.js";

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

export function measureMobileGameInsets(headerElement, windowTarget = globalThis.window) {
  const container = headerElement?.parentElement;
  const styles = container ? windowTarget.getComputedStyle(container) : null;
  const safeTop = Math.max(0, parseFloat(styles?.paddingTop) || 0);
  const safeBottom = Math.max(0, parseFloat(styles?.paddingBottom) || 0);
  // A bounding rect includes WebKit's focus pan. Only local dimensions belong
  // in the board budget, including in a standalone PWA (no Fullscreen API).
  return { headerOffset: Math.round((headerElement?.offsetHeight || 0) + safeTop), safeBottom };
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
  const mobileGameViewportTrackerRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileLayout) {
      mobileGameViewportLockRef.current = { width: 0, height: 0 };
      return;
    }
    // Observe the lobby as well: entering the first round can unmount its
    // focused chat before the keyboard has finished closing.
    const acquired = acquireMobileGameViewportTracker({
      subscribeViewport: layoutFeature.subscribeViewport,
    });
    const { tracker } = acquired;
    mobileGameViewportTrackerRef.current = tracker;
    mobileGameViewportLockRef.current = tracker.getSnapshot();
    const unsubscribe = tracker.subscribe((viewport) => {
      mobileGameViewportLockRef.current = viewport;
    });
    return () => {
      unsubscribe();
      acquired.release();
      mobileGameViewportTrackerRef.current = null;
    };
  }, [
    isMobileLayout,
    layoutFeature,
  ]);

  const getHeaderOffsetPx = React.useCallback(() => {
    return measureMobileGameInsets(mobileHeaderRef.current).headerOffset;
  }, []);

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
      const safeAreaBottomPx = measureMobileGameInsets(mobileHeaderRef.current).safeBottom;
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
    const unsubscribeGameViewport = mobileGameViewportTrackerRef.current
      ?.subscribe(scheduleComputeMobileLayout);
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
      unsubscribeGameViewport?.();
      headerObserver?.disconnect();
      document.removeEventListener(
        "visibilitychange",
        scheduleComputeMobileLayout,
      );
    };
  }, [
    getHeaderOffsetPx,
    gridSize,
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

    const tracker = mobileGameViewportTrackerRef.current;
    if (!tracker) return;
    return lockMobileGameDocument({ tracker });
  }, [
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
