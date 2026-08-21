import { shouldUseMobileLayout } from "../../utils/desktopResponsiveLayout.js";
import {
  isAndroidWebViewUserAgent,
  isAppleMobileUserAgent,
  isLikelyNativeWrapper,
  isStandaloneDisplayMode,
} from "../../utils/displayMode.js";

const MOBILE_LAYOUT_MAX_WIDTH = 520;
const TOUCH_LAYOUT_MAX_MIN_DIM = 820;
const ULTRA_COMPACT_MAX_MIN_DIM = 760;
const LITE_VISUAL_FX_QUERY_PARAM = "liteFx";

export function getViewportSize() {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  const width = Math.round(
    window.innerWidth ||
      (typeof document !== "undefined" ? document.documentElement?.clientWidth : 0) ||
      0
  );
  const height = Math.round(
    window.innerHeight ||
      (typeof document !== "undefined" ? document.documentElement?.clientHeight : 0) ||
      0
  );
  return { width, height };
}

function hasCoarsePointer() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches
  );
}

function hasFinePointer() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(pointer: fine)").matches ||
    window.matchMedia("(any-pointer: fine)").matches
  );
}

export function computeIsMobileLayout() {
  if (typeof window === "undefined") return false;
  const { width, height } = getViewportSize();
  const coarsePointer = hasCoarsePointer();
  const finePointer = hasFinePointer();
  const touchCapable =
    coarsePointer ||
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  return shouldUseMobileLayout({
    coarsePointer,
    finePointer,
    mobileMaxWidth: MOBILE_LAYOUT_MAX_WIDTH,
    touchCapable,
    touchMaxMinDimension: TOUCH_LAYOUT_MAX_MIN_DIM,
    viewportHeight: height,
    viewportWidth: width,
  });
}

export function computeIsUltraCompact() {
  if (typeof window === "undefined") return false;
  const { width, height } = getViewportSize();
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);
  const aspect = minDim > 0 ? maxDim / minDim : 0;
  const isTouch =
    hasCoarsePointer() ||
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  const isHybridDesktop = hasFinePointer() && width >= 900;
  return (
    isTouch &&
    !isHybridDesktop &&
    minDim <= ULTRA_COMPACT_MAX_MIN_DIM &&
    aspect > 0 &&
    aspect <= 1.35
  );
}

export function computeIsIosStandalone() {
  if (typeof navigator === "undefined") return false;
  return isAppleMobileUserAgent(navigator.userAgent || "") && isStandaloneDisplayMode();
}

export function computeIsAndroidWebBrowser() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && !isStandaloneDisplayMode() && !isLikelyNativeWrapper();
}

export function isLikelySamsungDeviceUserAgent(ua) {
  const value = String(ua || "");
  return /SM-[A-Z0-9]+/i.test(value) || /SAMSUNG/i.test(value);
}

function isLikelyLowEndAndroidDeviceUserAgent(ua) {
  return /(TECNO|Infinix|itel|SPARK|CAMON|POVA|HiOS|XOS)/i.test(String(ua || ""));
}

export function computePreferLiteVisualEffects() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    const forced = new URLSearchParams(window.location.search).get(
      LITE_VISUAL_FX_QUERY_PARAM
    );
    if (/^(1|true|on)$/i.test(String(forced || ""))) return true;
    if (/^(0|false|off)$/i.test(String(forced || ""))) return false;
  } catch (_) {}
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;
  if (isLikelyLowEndAndroidDeviceUserAgent(ua)) return true;
  const deviceMemory = Number(navigator.deviceMemory);
  const cpuCount = Number(navigator.hardwareConcurrency);
  if (Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 3) return true;
  return (
    Number.isFinite(cpuCount) &&
    cpuCount > 0 &&
    cpuCount <= 4 &&
    isAndroidWebViewUserAgent(ua)
  );
}

export function isFirefoxMobileUserAgent(ua) {
  const value = String(ua || "");
  return /(Firefox|FxiOS)/i.test(value) && /Android|iPhone|iPad|iPod|Mobile/i.test(value);
}

export function getDefaultRoomId() {
  return "room-4x4";
}
