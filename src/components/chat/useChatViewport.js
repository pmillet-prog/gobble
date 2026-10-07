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
import { lockMobileGameDocument } from "../../features/layout/mobileGameViewport.js";

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
  const layoutWidth =
    readPositiveNumber(windowTarget?.innerWidth) ||
    readPositiveNumber(documentTarget?.documentElement?.clientWidth);
  const layoutHeight =
    readPositiveNumber(windowTarget?.innerHeight) ||
    readPositiveNumber(documentTarget?.documentElement?.clientHeight);
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
  safeAreaInsets = {},
  topInsetPx = 0,
  viewportHeight,
  viewportWidth,
}) {
  const safeBaselineHeight = Math.max(0, Math.round(Number(baselineHeight) || 0));
  const safeViewportHeight = Math.max(0, Math.round(Number(viewportHeight) || 0));
  const safeViewportWidth = Math.max(0, Math.round(Number(viewportWidth) || 0));
  const safeOffsetLeft = Math.max(0, Math.round(Number(offsetLeft) || 0));
  const safeOffsetTop = Math.max(0, Math.round(Number(offsetTop) || 0));
  // The game surface and this portal both follow the visual viewport. Header
  // and hardware insets therefore stay at the same physical screen position.
  const safeTopInset = Math.max(
    0,
    Math.round(Number(topInsetPx) || 0),
    Math.round(Number(safeAreaInsets.top) || 0),
  );
  // WebKit can pan the visual viewport while the keyboard stays open. Its
  // offset is a position, not space returned by the keyboard.
  const keyboardInsetPx = Math.max(0, safeBaselineHeight - safeViewportHeight);
  const keyboardThresholdPx = Math.max(
    CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
    Math.round(safeBaselineHeight * 0.12)
  );
  const keyboardVisible = keyboardInsetPx >= keyboardThresholdPx;
  const keyboardOpen = keyboardFocused && keyboardVisible;
  const safeBottomInset = keyboardVisible
    ? 0
    : Math.max(0, Math.round(Number(safeAreaInsets.bottom) || 0));
  const availableVisibleHeight = Math.max(
    0, safeViewportHeight - safeTopInset - safeBottomInset,
  );
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
    availableVisibleHeight
  );
  const keyboardConstrained =
    keyboardVisible && availableVisibleHeight < nominalHeight;

  return {
    availableVisibleHeight,
    keyboardConstrained,
    keyboardInsetPx,
    keyboardOpen,
    keyboardVisible,
    orientation,
    overlayStyle: {
      bottom: "auto",
      boxSizing: "border-box",
      height: `${safeViewportHeight}px`,
      left: `${safeOffsetLeft}px`,
      maxHeight: `${safeViewportHeight}px`,
      paddingBottom: `${safeBottomInset}px`,
      paddingLeft: `${Math.max(0, Math.round(Number(safeAreaInsets.left) || 0))}px`,
      paddingRight: `${Math.max(0, Math.round(Number(safeAreaInsets.right) || 0))}px`,
      paddingTop: `${safeTopInset}px`,
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
  keyboardVisible = keyboardOpen,
  viewportSettled = true,
}) {
  if (!isChatOpen) {
    return { keyboardWasOpen: false, shouldCloseChat: false };
  }
  if (keyboardOpen) {
    return { keyboardWasOpen: true, shouldCloseChat: false };
  }
  if (keyboardWasOpen && (keyboardVisible || !viewportSettled)) {
    return { keyboardWasOpen: true, shouldCloseChat: false };
  }
  return {
    keyboardWasOpen: false,
    shouldCloseChat: !!keyboardWasOpen,
  };
}

export function updateChatViewportSession(previous, snapshot, {
  safeAreaInsets = {},
  topInsetPx = 0,
  settled = false,
} = {}) {
  let baseline = previous.baseline || { height: 0, width: 0 };
  let calibration = previous.calibration || null;
  let sessionCalibration = previous.sessionCalibration || null;
  const widthChanged =
    baseline.width > 0 && Math.abs(snapshot.viewportWidth - baseline.width) > 64;

  if (!(baseline.height > 0) || widthChanged) {
    baseline = {
      height: snapshot.keyboardFocused
        ? Math.max(snapshot.layoutHeight, snapshot.viewportHeight)
        : snapshot.viewportHeight,
      width: snapshot.viewportWidth,
    };
    sessionCalibration = calibration;
  } else if (!snapshot.keyboardFocused && snapshot.viewportHeight >= baseline.height - 48) {
    baseline = {
      height: snapshot.viewportHeight,
      width: snapshot.viewportWidth,
    };
  }

  const keyboardInsetPx = Math.max(0, baseline.height - snapshot.viewportHeight);
  const calibrationThreshold = Math.max(
    CHAT_DRAWER_CALIBRATION_MIN_KEYBOARD_PX,
    Math.round(baseline.height * 0.12)
  );
  if (
    settled &&
    !calibration &&
    snapshot.keyboardFocused &&
    keyboardInsetPx >= calibrationThreshold &&
    baseline.height > 0
  ) {
    const availableHeight = Math.max(
      1,
      snapshot.viewportHeight - Math.max(
        0, Number(topInsetPx) || 0, Number(safeAreaInsets.top) || 0,
      )
    );
    const observedHeightPx = clampValue(
      Math.round(availableHeight),
      Math.min(CHAT_DRAWER_MIN_HEIGHT_PX, availableHeight),
      Math.min(CHAT_DRAWER_MAX_HEIGHT_PX, availableHeight)
    );
    calibration = {
      ratio: clampValue(
        observedHeightPx / baseline.height,
        CHAT_DRAWER_CALIBRATION_MIN_RATIO,
        CHAT_DRAWER_CALIBRATION_MAX_RATIO
      ),
      heightPx: observedHeightPx,
      orientation: getChatDrawerOrientationKey(snapshot.viewportWidth, baseline.height),
    };
    // Learn for the next opening. Changing the nominal height during this
    // opening can grow the drawer just as the keyboard is taking up space.
  }

  return {
    baseline,
    calibration,
    sessionCalibration,
    layout: {
      ...computeChatViewportLayout({
        ...snapshot,
        baselineHeight: baseline.height,
        calibration: sessionCalibration,
        safeAreaInsets,
        topInsetPx,
      }),
      viewportSettled: settled,
    },
  };
}

function areLayoutsEqual(left, right) {
  return (
    left?.keyboardConstrained === right?.keyboardConstrained &&
    left?.keyboardInsetPx === right?.keyboardInsetPx &&
    left?.keyboardOpen === right?.keyboardOpen &&
    left?.keyboardVisible === right?.keyboardVisible &&
    left?.viewportSettled === right?.viewportSettled &&
    left?.orientation === right?.orientation &&
    left?.overlayStyle?.top === right?.overlayStyle?.top &&
    left?.overlayStyle?.left === right?.overlayStyle?.left &&
    left?.overlayStyle?.width === right?.overlayStyle?.width &&
    left?.overlayStyle?.height === right?.overlayStyle?.height &&
    left?.overlayStyle?.paddingTop === right?.overlayStyle?.paddingTop &&
    left?.overlayStyle?.paddingBottom === right?.overlayStyle?.paddingBottom &&
    left?.overlayStyle?.paddingLeft === right?.overlayStyle?.paddingLeft &&
    left?.overlayStyle?.paddingRight === right?.overlayStyle?.paddingRight &&
    left?.sheetStyle?.height === right?.sheetStyle?.height
  );
}

export default function useChatViewport({
  enabled,
  frozen = false,
  lockDocument = true,
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
    if (!enabled || !lockDocument || typeof document === "undefined") return undefined;
    return lockMobileGameDocument({});
  }, [enabled, lockDocument]);

  React.useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      baselineRef.current = { height: 0, width: 0 };
      return undefined;
    }
    if (frozen) return undefined;

    if (calibrationRef.current === null) {
      calibrationRef.current = readStoredChatDrawerCalibration();
    }
    const visualViewport = window.visualViewport;
    const safeAreaProbe = document.createElement("div");
    Object.assign(safeAreaProbe.style, {
      position: "fixed", visibility: "hidden", pointerEvents: "none",
      width: "0", height: "0", top: "0", left: "0",
      paddingTop: "env(safe-area-inset-top, 0px)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      paddingLeft: "env(safe-area-inset-left, 0px)",
      paddingRight: "env(safe-area-inset-right, 0px)",
    });
    document.body.appendChild(safeAreaProbe);
    let frameId = null;
    let settled = false;
    const settleTimerIds = new Set();

    const update = () => {
      frameId = null;
      const snapshot = readChatViewportSnapshot(window, document);
      const safeAreaStyle = window.getComputedStyle(safeAreaProbe);
      const safeAreaInsets = {
        top: Number.parseFloat(safeAreaStyle.paddingTop) || 0,
        bottom: Number.parseFloat(safeAreaStyle.paddingBottom) || 0,
        left: Number.parseFloat(safeAreaStyle.paddingLeft) || 0,
        right: Number.parseFloat(safeAreaStyle.paddingRight) || 0,
      };
      const next = updateChatViewportSession({
        baseline: baselineRef.current,
        calibration: calibrationRef.current,
        sessionCalibration: sessionCalibrationRef.current,
      }, snapshot, { topInsetPx, safeAreaInsets, settled });
      baselineRef.current = next.baseline;
      sessionCalibrationRef.current = next.sessionCalibration;
      if (next.calibration !== calibrationRef.current) {
        calibrationRef.current = next.calibration;
        writeStoredChatDrawerCalibration(next.calibration);
      }
      setLayout((previous) =>
        areLayoutsEqual(previous, next.layout) ? previous : next.layout
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
          if (settleTimerIds.size === 0) settled = true;
          scheduleUpdate();
        }, delayMs);
        settleTimerIds.add(timerId);
      }
    };

    const handleViewportChange = () => {
      settled = false;
      scheduleUpdate();
      scheduleSettledUpdates();
    };

    update();
    scheduleSettledUpdates();
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
      safeAreaProbe.remove();
    };
  }, [enabled, frozen, topInsetPx]);

  return layout;
}
