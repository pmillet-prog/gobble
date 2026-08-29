import React from "react";
import useDesktopLayoutController from "../../hooks/useDesktopLayoutController.js";
import { VIEWPORT_EVENTS } from "../../features/layout/createViewportEventHub.js";

function normalizeMeasuredPx(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number);
}

function isSameMeasuredPx(previous, next, epsilon = 1) {
  return (
    Math.abs(normalizeMeasuredPx(previous) - normalizeMeasuredPx(next)) <= epsilon
  );
}

function areDesktopHandleLayoutsEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      !a ||
      !b ||
      a.id !== b.id ||
      a.label !== b.label ||
      Math.abs((a.left || 0) - (b.left || 0)) > 0.5 ||
      Math.abs((a.top || 0) - (b.top || 0)) > 0.5
    ) {
      return false;
    }
  }
  return true;
}

export default function useDesktopSceneLayout({
  appView,
  connectionError,
  desktopColumnBaseDefs,
  desktopColumnDefaultFractions,
  desktopColumnFractionsRef,
  desktopColumnHandleLabels,
  desktopColumnMinWidthsPx,
  desktopColumnNodeMapRef,
  desktopColumnOrderRef,
  desktopColumnOrderSafe,
  desktopGridResizeMaxTrackWidthRef,
  hasDesktopResultsSummary,
  isLoggedIn,
  isMobileLayout,
  layoutFeature,
  maxGridWidth,
  minGridWidth,
  phase,
  setDesktopColumnFractions,
  setDesktopColumnHandleLayout,
  setDesktopColumnResizeActiveIndex,
  setDesktopGridMetrics,
  setDesktopMainGridHeight,
  setDesktopResultsDrawerLayout,
  setDesktopViewportResizeInProgress,
  setGridWidth,
  setPlayColumnHeight,
  showHelp,
}) {
  const mainGridDesktopRef = React.useRef(null);
  const playColumnRef = React.useRef(null);
  const desktopColumnResizeRef = React.useRef({
    active: false,
    moveHandler: null,
    upHandler: null,
    bodyCursor: "",
    bodyUserSelect: "",
  });
  const desktopViewportResizeTimerRef = React.useRef(null);

  const { startDesktopColumnResize } = useDesktopLayoutController(
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
    showHelp
  );

  React.useLayoutEffect(() => {
    if (isMobileLayout || typeof window === "undefined") {
      setDesktopColumnHandleLayout((previous) =>
        previous.length ? [] : previous
      );
      return undefined;
    }

    let frameId = 0;
    const measure = () => {
      const next = desktopColumnOrderSafe
        .map((id) => {
          const node = desktopColumnNodeMapRef.current.get(id);
          const rect = node?.getBoundingClientRect?.();
          if (!rect || rect.width <= 0 || rect.height <= 0) return null;
          return {
            id,
            label: desktopColumnHandleLabels.get(id) || id,
            left: rect.left + rect.width / 2,
            top: rect.top,
          };
        })
        .filter(Boolean);
      setDesktopColumnHandleLayout((previous) =>
        areDesktopHandleLayoutsEqual(previous, next) ? previous : next
      );
    };
    const scheduleMeasure = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;
    if (mainGridDesktopRef.current) observer?.observe(mainGridDesktopRef.current);
    desktopColumnOrderSafe.forEach((id) => {
      const node = desktopColumnNodeMapRef.current.get(id);
      if (node) observer?.observe(node);
    });
    scheduleMeasure();
    const unsubscribeViewport = layoutFeature.subscribeViewport(scheduleMeasure, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
    ]);
    window.addEventListener("scroll", scheduleMeasure, true);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer?.disconnect();
      unsubscribeViewport();
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [
    desktopColumnHandleLabels,
    desktopColumnNodeMapRef,
    desktopColumnOrderSafe,
    isMobileLayout,
    layoutFeature,
    setDesktopColumnHandleLayout,
  ]);

  React.useEffect(() => {
    const element = playColumnRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;

    const clampGridWidth = (rawValue) => {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value <= 0) return null;
      return Math.min(
        Math.max(1, Number(maxGridWidth) || 980),
        Math.max(Math.max(1, Number(minGridWidth) || 260), value - 24)
      );
    };
    const commitGridWidth = (value) => {
      const clamped = clampGridWidth(value);
      if (!clamped) return;
      setGridWidth((previous) =>
        isSameMeasuredPx(previous, clamped) ? previous : clamped
      );
    };
    const commitPlayColumnHeight = (value) => {
      const nextHeight = normalizeMeasuredPx(value);
      if (!nextHeight) return;
      setPlayColumnHeight((previous) =>
        isSameMeasuredPx(previous, nextHeight) ? previous : nextHeight
      );
    };
    const commitElementSize = (target) => {
      const rect = target?.getBoundingClientRect?.();
      if (!rect) return;
      if (rect.width) commitGridWidth(rect.width);
      if (rect.height) commitPlayColumnHeight(rect.height);
    };

    commitElementSize(element);
    const observer = new ResizeObserver((entries) => {
      commitElementSize(entries[0]?.target);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [
    appView,
    isLoggedIn,
    isMobileLayout,
    maxGridWidth,
    minGridWidth,
    phase,
    setGridWidth,
    setPlayColumnHeight,
  ]);

  return {
    mainGridDesktopRef,
    playColumnRef,
    startDesktopColumnResize,
  };
}
