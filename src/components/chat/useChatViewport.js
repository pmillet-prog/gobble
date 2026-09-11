import React from "react";

import {
  CHAT_DRAWER_CALIBRATION_MAX_RATIO,
  CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
  CHAT_DRAWER_CALIBRATION_MIN_RATIO,
  CHAT_DRAWER_MAX_HEIGHT_PX,
  CHAT_DRAWER_MIN_HEIGHT_PX,
  CHAT_DRAWER_TOP_GAP_PX,
  getChatDrawerOrientationKey,
  readStoredChatDrawerCalibration,
  writeStoredChatDrawerCalibration,
} from "../../app/adapters/chatDrawerCalibration.js";
import { clampValue } from "../../utils/numbers.js";

const CHAT_DRAWER_FIXED_HEIGHT_RATIO = 0.58;
const CHAT_VIEWPORT_SETTLE_DELAYS_MS = Object.freeze([60, 180, 360]);

function isKeyboardTarget(element) {
  const tagName = String(element?.tagName || "").toUpperCase();
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    element?.isContentEditable === true
  );
}

function readPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function readVisualViewportOffset(primaryOffset, pageOffset, layoutScroll) {
  const primary = Math.max(0, Number(primaryOffset) || 0);
  const page = Math.max(0, Number(pageOffset) || 0);
  const scroll = Math.max(0, Number(layoutScroll) || 0);
  return Math.max(primary, page - scroll);
}

export function readChatViewportSnapshot(
  windowTarget = globalThis.window,
  documentTarget = globalThis.document
) {
  const visualViewport = windowTarget?.visualViewport;
  const layoutWidth = Math.max(
    readPositiveNumber(windowTarget?.innerWidth),
    readPositiveNumber(documentTarget?.documentElement?.clientWidth)
  );
  const layoutHeight = Math.max(
    readPositiveNumber(windowTarget?.innerHeight),
    readPositiveNumber(documentTarget?.documentElement?.clientHeight)
  );
  const offsetLeft = readVisualViewportOffset(
    visualViewport?.offsetLeft,
    visualViewport?.pageLeft,
    windowTarget?.scrollX ?? windowTarget?.pageXOffset
  );
  const offsetTop = readVisualViewportOffset(
    visualViewport?.offsetTop,
    visualViewport?.pageTop,
    windowTarget?.scrollY ?? windowTarget?.pageYOffset
  );
  const viewportWidth =
    readPositiveNumber(visualViewport?.width) || layoutWidth;
  const viewportHeight =
    readPositiveNumber(visualViewport?.height) || layoutHeight;

  return {
    keyboardFocused: isKeyboardTarget(documentTarget?.activeElement),
    layoutHeight: Math.max(layoutHeight, offsetTop + viewportHeight),
    offsetLeft: Math.round(offsetLeft),
    offsetTop: Math.round(offsetTop),
    viewportHeight: Math.floor(viewportHeight),
    viewportWidth: Math.floor(viewportWidth),
  };
}

export function computeChatViewportLayout({
  baselineHeight,
  calibration = null,
  keyboardFocused = false,
  offsetLeft = 0,
  offsetTop = 0,
  topInsetPx = 0,
  viewportHeight,
  viewportWidth,
}) {
  const safeBaselineHeight = Math.max(0, Math.round(Number(baselineHeight) || 0));
  const safeViewportHeight = Math.max(0, Math.round(Number(viewportHeight) || 0));
  const safeViewportWidth = Math.max(0, Math.round(Number(viewportWidth) || 0));
  const safeOffsetLeft = Math.max(0, Math.round(Number(offsetLeft) || 0));
  const safeOffsetTop = Math.max(0, Math.round(Number(offsetTop) || 0));
  const safeTopInset = Math.max(0, Math.round(Number(topInsetPx) || 0));
  const visibleBottom = safeOffsetTop + safeViewportHeight;
  const keyboardInsetPx = Math.max(0, safeBaselineHeight - visibleBottom);
  const keyboardThresholdPx = Math.max(
    CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
    Math.round(safeBaselineHeight * 0.12)
  );
  const keyboardVisible = keyboardInsetPx >= keyboardThresholdPx;
  const keyboardOpen = keyboardFocused && keyboardVisible;
  const availableVisibleHeight = Math.max(0, safeViewportHeight - safeTopInset);
  const orientation = getChatDrawerOrientationKey(
    safeViewportWidth,
    safeBaselineHeight
  );
  const calibrationMatchesOrientation =
    !!calibration &&
    String(calibration.orientation || "portrait") === orientation;
  const nominalCeiling = Math.max(
    0,
    safeBaselineHeight - safeTopInset - CHAT_DRAWER_TOP_GAP_PX
  );
  const nominalHeight = nominalCeiling
    ? calibrationMatchesOrientation
      ? clampValue(
          Number.isFinite(calibration?.ratio)
            ? Math.round(safeBaselineHeight * calibration.ratio)
            : Math.round(Number(calibration?.heightPx) || 0),
          Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, nominalCeiling),
          Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, nominalCeiling)
        )
      : clampValue(
          Math.round(safeBaselineHeight * CHAT_DRAWER_FIXED_HEIGHT_RATIO),
          Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, nominalCeiling),
          Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, nominalCeiling)
        )
    : 0;

  // The keyboard may only shrink the drawer. Letting the first few pixels of
  // keyboard animation expand it to the full visual viewport causes a large
  // open/close jump before it settles.
  const sheetHeightPx = Math.min(
    nominalHeight,
    availableVisibleHeight || nominalHeight
  );
  const keyboardConstrained =
    keyboardVisible && availableVisibleHeight < nominalHeight;

  return {
    keyboardConstrained,
    keyboardInsetPx,
    keyboardOpen,
    keyboardVisible,
    orientation,
    overlayStyle: {
      bottom: "auto",
      height: `${safeViewportHeight}px`,
      left: `${safeOffsetLeft}px`,
      maxHeight: `${safeViewportHeight}px`,
      right: "auto",
      top: `${safeOffsetTop}px`,
      width: `${safeViewportWidth}px`,
    },
    sheetStyle: sheetHeightPx
      ? {
          height: `${sheetHeightPx}px`,
          maxHeight: `${sheetHeightPx}px`,
        }
      : undefined,
  };
}

export function computeChatKeyboardSessionTransition({
  isChatOpen,
  keyboardOpen,
  keyboardWasOpen,
}) {
  if (!isChatOpen) {
    return { keyboardWasOpen: false, shouldCloseChat: false };
  }
  if (keyboardOpen) {
    return { keyboardWasOpen: true, shouldCloseChat: false };
  }
  return {
    keyboardWasOpen: false,
    shouldCloseChat: !!keyboardWasOpen,
  };
}

function areLayoutsEqual(left, right) {
  return (
    left?.keyboardConstrained === right?.keyboardConstrained &&
    left?.keyboardInsetPx === right?.keyboardInsetPx &&
    left?.keyboardOpen === right?.keyboardOpen &&
    left?.keyboardVisible === right?.keyboardVisible &&
    left?.orientation === right?.orientation &&
    left?.overlayStyle?.top === right?.overlayStyle?.top &&
    left?.overlayStyle?.left === right?.overlayStyle?.left &&
    left?.overlayStyle?.width === right?.overlayStyle?.width &&
    left?.overlayStyle?.height === right?.overlayStyle?.height &&
    left?.sheetStyle?.height === right?.sheetStyle?.height
  );
}

export default function useChatViewport({
  enabled,
  frozen = false,
  topInsetPx = 0,
}) {
  const baselineRef = React.useRef({ height: 0, width: 0 });
  const calibrationRef = React.useRef(null);
  const sessionCalibrationRef = React.useRef(null);
  const [layout, setLayout] = React.useState(() =>
    computeChatViewportLayout({
      baselineHeight: 0,
      topInsetPx,
      viewportHeight: 0,
      viewportWidth: 0,
    })
  );

  React.useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      baselineRef.current = { height: 0, width: 0 };
      return undefined;
    }
    if (frozen) return undefined;

    if (calibrationRef.current === null) {
      calibrationRef.current = readStoredChatDrawerCalibration();
    }
    if (baselineRef.current.height <= 0) {
      sessionCalibrationRef.current = calibrationRef.current;
    }

    const visualViewport = window.visualViewport;
    let frameId = null;
    const settleTimerIds = new Set();

    const update = () => {
      frameId = null;
      const snapshot = readChatViewportSnapshot(window, document);
      const previousBaseline = baselineRef.current;
      const widthChanged =
        previousBaseline.width > 0 &&
        Math.abs(snapshot.viewportWidth - previousBaseline.width) > 64;
      const visibleBottom = snapshot.offsetTop + snapshot.viewportHeight;
      let baselineHeight = previousBaseline.height;

      if (!(baselineHeight > 0) || widthChanged) {
        baselineHeight = Math.max(snapshot.layoutHeight, visibleBottom);
        baselineRef.current = {
          height: baselineHeight,
          width: snapshot.viewportWidth,
        };
        sessionCalibrationRef.current = calibrationRef.current;
      } else if (!snapshot.keyboardFocused && visibleBottom >= baselineHeight - 48) {
        baselineHeight = Math.max(baselineHeight, snapshot.layoutHeight, visibleBottom);
        baselineRef.current = {
          height: baselineHeight,
          width: snapshot.viewportWidth,
        };
      }

      const keyboardInsetPx = Math.max(0, baselineHeight - visibleBottom);
      const calibrationThreshold = Math.max(
        CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
        Math.round(baselineHeight * 0.12)
      );
      if (
        !calibrationRef.current &&
        snapshot.keyboardFocused &&
        keyboardInsetPx >= calibrationThreshold &&
        baselineHeight > 0
      ) {
        const availableHeight = Math.max(
          1,
          snapshot.viewportHeight - Math.max(0, Number(topInsetPx) || 0)
        );
        const observedHeightPx = clampValue(
          Math.round(availableHeight),
          Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, availableHeight),
          Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, availableHeight)
        );
        const nextCalibration = {
          ratio: clampValue(
            observedHeightPx / baselineHeight,
            CHAT_DRAWER_CALIBRATION_MIN_RATIO,
            CHAT_DRAWER_CALIBRATION_MAX_RATIO
          ),
          heightPx: observedHeightPx,
          orientation: getChatDrawerOrientationKey(
            snapshot.viewportWidth,
            baselineHeight
          ),
        };
        calibrationRef.current = nextCalibration;
        sessionCalibrationRef.current = nextCalibration;
        writeStoredChatDrawerCalibration(nextCalibration);
      }

      const nextLayout = computeChatViewportLayout({
        ...snapshot,
        baselineHeight,
        calibration: sessionCalibrationRef.current,
        topInsetPx,
      });
      setLayout((previous) =>
        areLayoutsEqual(previous, nextLayout) ? previous : nextLayout
      );
    };

    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(update);
    };

    const scheduleSettledUpdates = () => {
      for (const timerId of settleTimerIds) window.clearTimeout(timerId);
      settleTimerIds.clear();
      for (const delayMs of CHAT_VIEWPORT_SETTLE_DELAYS_MS) {
        const timerId = window.setTimeout(() => {
          settleTimerIds.delete(timerId);
          scheduleUpdate();
        }, delayMs);
        settleTimerIds.add(timerId);
      }
    };

    const handleViewportChange = () => {
      scheduleUpdate();
      scheduleSettledUpdates();
    };

    update();
    window.addEventListener("resize", handleViewportChange, { passive: true });
    window.addEventListener("orientationchange", handleViewportChange, { passive: true });
    window.addEventListener("focusin", handleViewportChange, true);
    window.addEventListener("focusout", handleViewportChange, true);
    visualViewport?.addEventListener("resize", handleViewportChange, { passive: true });
    visualViewport?.addEventListener("scroll", handleViewportChange, { passive: true });

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      window.removeEventListener("focusin", handleViewportChange, true);
      window.removeEventListener("focusout", handleViewportChange, true);
      visualViewport?.removeEventListener("resize", handleViewportChange);
      visualViewport?.removeEventListener("scroll", handleViewportChange);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      for (const timerId of settleTimerIds) window.clearTimeout(timerId);
      settleTimerIds.clear();
    };
  }, [enabled, frozen, topInsetPx]);

  return layout;
}
