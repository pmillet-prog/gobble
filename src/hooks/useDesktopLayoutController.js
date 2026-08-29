import React, { useEffect, useLayoutEffect } from "react";
import {
  clampDesktopColumnResizeDelta,
  computeDesktopViewportHeight,
} from "../utils/desktopResponsiveLayout.js";
import {
  areDesktopFractionsEqual,
  normalizeDesktopColumnFractions,
  normalizeDesktopColumnOrder,
} from "../app/adapters/desktopLayoutStorage.js";
import { clampValue } from "../utils/numbers.js";

export default function useDesktopLayoutController(
  appView,
  connectionError,
  desktopColumnBaseDefs,
  desktopColumnDefaultFractions,
  desktopColumnFractionsRef,
  desktopColumnMinWidthsPx,
  desktopColumnOrderRef,
  desktopColumnResizeRef,
  desktopGridResizeMaxTrackWidthRef,
  desktopViewportResizeTimerRef,
  hasDesktopResultsSummary,
  isLoggedIn,
  isMobileLayout,
  mainGridDesktopRef,
  phase,
  setDesktopColumnFractions,
  setDesktopColumnResizeActiveIndex,
  setDesktopGridMetrics,
  setDesktopMainGridHeight,
  setDesktopResultsDrawerLayout,
  setDesktopViewportResizeInProgress,
  showHelp,
  mainGridDesktopNode,
) {
  const stopDesktopColumnResize = React.useCallback(() => {
    const resizeState = desktopColumnResizeRef.current;
    if (resizeState.moveHandler) {
      window.removeEventListener("pointermove", resizeState.moveHandler);
      resizeState.moveHandler = null;
    }
    if (resizeState.upHandler) {
      window.removeEventListener("pointerup", resizeState.upHandler);
      window.removeEventListener("pointercancel", resizeState.upHandler);
      resizeState.upHandler = null;
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.style.cursor = resizeState.bodyCursor || "";
      document.body.style.userSelect = resizeState.bodyUserSelect || "";
    }
    resizeState.bodyCursor = "";
    resizeState.bodyUserSelect = "";
    resizeState.active = false;
    setDesktopColumnResizeActiveIndex(null);
  }, []);

  const startDesktopColumnResize = React.useCallback(
    (separatorIndex, event) => {
      if (isMobileLayout) return;
      const host = mainGridDesktopNode || mainGridDesktopRef.current;
      if (!(host instanceof HTMLElement)) return;
      const maxSeparatorIndex = Math.max(0, desktopColumnFractionsRef.current.length - 2);
      if (
        !Number.isInteger(separatorIndex) ||
        separatorIndex < 0 ||
        separatorIndex > maxSeparatorIndex
      ) {
        return;
      }
      event.preventDefault?.();

      stopDesktopColumnResize();

      const rect = host.getBoundingClientRect();
      const hostWidth = Math.max(0, rect.width || host.clientWidth || 0);
      const computed = window.getComputedStyle(host);
      const gapRaw = parseFloat(computed.columnGap || computed.gap || "0");
      const gapPx = Number.isFinite(gapRaw) ? Math.max(0, gapRaw) : 0;
      const baseFractions = normalizeDesktopColumnFractions(
        desktopColumnFractionsRef.current,
        desktopColumnDefaultFractions
      );
      const contentWidth = Math.max(
        1,
        hostWidth - gapPx * Math.max(0, baseFractions.length - 1)
      );
      const baseWidths = baseFractions.map((fraction) => fraction * contentWidth);
      const baseMinWidths = baseFractions.map((_, idx) =>
        Math.max(120, Number(desktopColumnMinWidthsPx[idx]) || 120)
      );
      const minSum = baseMinWidths.reduce((acc, value) => acc + value, 0);
      const minScale = minSum > contentWidth ? contentWidth / minSum : 1;
      const minWidths = baseMinWidths.map((value) => value * minScale);
      const startX = Number(event.clientX) || 0;
      const leftStart = baseWidths[separatorIndex] || 0;
      const rightStart = baseWidths[separatorIndex + 1] || 0;
      const leftMin = minWidths[separatorIndex] || 120;
      const rightMin = minWidths[separatorIndex + 1] || 120;
      const currentOrder = normalizeDesktopColumnOrder(
        desktopColumnOrderRef.current,
        desktopColumnBaseDefs
      );
      const gridColumnIndex = currentOrder.indexOf("grid");
      const gridMaxTrackWidth = Math.max(
        baseWidths[gridColumnIndex] || 0,
        Number(desktopGridResizeMaxTrackWidthRef.current) || 0
      );
      const leftMax =
        separatorIndex === gridColumnIndex
          ? gridMaxTrackWidth
          : Number.POSITIVE_INFINITY;
      const rightMax =
        separatorIndex + 1 === gridColumnIndex
          ? gridMaxTrackWidth
          : Number.POSITIVE_INFINITY;

      const resizeState = desktopColumnResizeRef.current;
      resizeState.active = true;
      setDesktopColumnResizeActiveIndex(separatorIndex);
      if (typeof document !== "undefined" && document.body) {
        resizeState.bodyCursor = document.body.style.cursor || "";
        resizeState.bodyUserSelect = document.body.style.userSelect || "";
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }

      resizeState.moveHandler = (moveEvent) => {
        if (!desktopColumnResizeRef.current.active) return;
        const clientX = Number(moveEvent.clientX);
        if (!Number.isFinite(clientX)) return;
        const delta = clientX - startX;
        const clampedDelta = clampDesktopColumnResizeDelta({
          delta,
          leftMax,
          leftMin,
          leftStart,
          rightMax,
          rightMin,
          rightStart,
        });
        const leftNext = leftStart + clampedDelta;
        const rightNext = rightStart - clampedDelta;
        const nextWidths = [...baseWidths];
        nextWidths[separatorIndex] = leftNext;
        nextWidths[separatorIndex + 1] = rightNext;
        const nextFractions = normalizeDesktopColumnFractions(
          nextWidths.map((width) => width / contentWidth),
          desktopColumnDefaultFractions
        );
        setDesktopColumnFractions((prev) =>
          areDesktopFractionsEqual(prev, nextFractions) ? prev : nextFractions
        );
      };
      resizeState.upHandler = () => {
        stopDesktopColumnResize();
      };

      window.addEventListener("pointermove", resizeState.moveHandler);
      window.addEventListener("pointerup", resizeState.upHandler);
      window.addEventListener("pointercancel", resizeState.upHandler);
    },
    [
      desktopColumnBaseDefs,
      desktopColumnDefaultFractions,
      desktopColumnMinWidthsPx,
      isMobileLayout,
      mainGridDesktopNode,
      stopDesktopColumnResize,
    ]
  );

  useEffect(() => () => stopDesktopColumnResize(), [stopDesktopColumnResize]);

  useEffect(() => {
    if (isMobileLayout || typeof window === "undefined") {
      if (desktopViewportResizeTimerRef.current) {
        clearTimeout(desktopViewportResizeTimerRef.current);
        desktopViewportResizeTimerRef.current = null;
      }
      setDesktopViewportResizeInProgress(false);
      return;
    }

    const markResizing = () => {
      setDesktopViewportResizeInProgress(true);
      if (desktopViewportResizeTimerRef.current) {
        clearTimeout(desktopViewportResizeTimerRef.current);
      }
      desktopViewportResizeTimerRef.current = setTimeout(() => {
        desktopViewportResizeTimerRef.current = null;
        setDesktopViewportResizeInProgress(false);
      }, 160);
    };

    const vv = window.visualViewport;
    window.addEventListener("resize", markResizing);
    vv?.addEventListener("resize", markResizing);

    return () => {
      window.removeEventListener("resize", markResizing);
      vv?.removeEventListener("resize", markResizing);
      if (desktopViewportResizeTimerRef.current) {
        clearTimeout(desktopViewportResizeTimerRef.current);
        desktopViewportResizeTimerRef.current = null;
      }
    };
  }, [isMobileLayout]);

  useLayoutEffect(() => {
    if (isMobileLayout) {
      setDesktopMainGridHeight(null);
      setDesktopGridMetrics((prev) =>
        prev.width === 0 && prev.gapPx === 24 ? prev : { width: 0, gapPx: 24 }
      );
      return;
    }
    if (typeof window === "undefined") return;

    let rafId = null;
    let observer = null;

    const updateLayout = () => {
      const host = mainGridDesktopNode || mainGridDesktopRef.current;
      if (!(host instanceof HTMLElement)) return;
      const hostWidth = Math.max(0, host.getBoundingClientRect?.().width || host.clientWidth || 0);
      const computed = window.getComputedStyle(host);
      const gapRaw = parseFloat(computed.columnGap || computed.gap || "0");
      const gapPx = Number.isFinite(gapRaw) ? Math.max(0, gapRaw) : 0;
      setDesktopGridMetrics((prev) => {
        if (Math.abs(prev.width - hostWidth) < 0.1 && Math.abs(prev.gapPx - gapPx) < 0.1) {
          return prev;
        }
        return { width: hostWidth, gapPx };
      });
      const viewportHeight = Math.max(
        0,
        Math.round(window.innerHeight || document.documentElement?.clientHeight || 0)
      );
      if (viewportHeight <= 0) return;
      const rect = host.getBoundingClientRect?.();
      if (!rect) return;
      const top = Math.max(0, Math.round(rect.top));
      const nextHeight = computeDesktopViewportHeight({
        bottomInset: 16,
        hostTop: top,
        viewportHeight,
      });
      setDesktopMainGridHeight((prev) => {
        if (Number.isFinite(prev) && Math.abs(prev - nextHeight) <= 1) return prev;
        return nextHeight;
      });
    };

    const scheduleUpdate = () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateLayout();
      });
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    const observedHost = mainGridDesktopNode || mainGridDesktopRef.current;
    if (typeof ResizeObserver !== "undefined" && observedHost) {
      observer = new ResizeObserver(() => scheduleUpdate());
      observer.observe(observedHost);
    }

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      if (observer) observer.disconnect();
    };
  }, [
    isMobileLayout,
    showHelp,
    connectionError,
    appView,
    phase,
    isLoggedIn,
    mainGridDesktopNode,
  ]);

  useLayoutEffect(() => {
    if (!hasDesktopResultsSummary) {
      setDesktopResultsDrawerLayout(null);
      return;
    }
    if (typeof window === "undefined") return;

    let rafId = null;
    let observer = null;

    const updateLayout = () => {
      const host = mainGridDesktopNode || mainGridDesktopRef.current;
      const viewportHeight = Math.max(
        0,
        Math.round(window.innerHeight || document.documentElement?.clientHeight || 0)
      );
      const viewportWidth = Math.max(
        0,
        Math.round(window.innerWidth || document.documentElement?.clientWidth || 0)
      );
      if (viewportHeight <= 0 || viewportWidth <= 0) return;
      if (!(host instanceof HTMLElement)) return;
      const rect = host.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const gap = 8;
      const zoneBottom = clampValue(rect.bottom, 0, viewportHeight);
      const bottomOffset = Math.max(gap, Math.round(viewportHeight - zoneBottom + gap));
      const nextMaxWidth = clampValue(Math.round(rect.width * 0.52), 360, 820);
      const rawCenterX = rect.left + rect.width / 2;
      const clampedCenterX = clampValue(
        Math.round(rawCenterX),
        Math.round(nextMaxWidth / 2 + gap),
        Math.round(viewportWidth - nextMaxWidth / 2 - gap)
      );
      const nextMaxHeight = Math.max(
        220,
        Math.min(
          Math.round(rect.height * 0.74),
          Math.max(220, Math.round(viewportHeight - bottomOffset - 44))
        )
      );
      const next = {
        bottom: bottomOffset,
        centerX: clampedCenterX,
        maxWidth: nextMaxWidth,
        maxHeight: nextMaxHeight,
      };
      setDesktopResultsDrawerLayout((prev) => {
        if (
          prev &&
          prev.bottom === next.bottom &&
          prev.centerX === next.centerX &&
          prev.maxWidth === next.maxWidth &&
          prev.maxHeight === next.maxHeight
        ) {
          return prev;
        }
        return next;
      });
    };

    const scheduleUpdate = () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateLayout();
      });
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    const observedHost = mainGridDesktopNode || mainGridDesktopRef.current;
    if (typeof ResizeObserver !== "undefined" && observedHost) {
      observer = new ResizeObserver(() => scheduleUpdate());
      observer.observe(observedHost);
    }

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      if (observer) observer.disconnect();
    };
  }, [hasDesktopResultsSummary, mainGridDesktopNode]);

  return { startDesktopColumnResize };
}
