export const HOME_DISPLAY_ACTIONS = Object.freeze({
  none: "none",
  enterFullscreen: "enter-fullscreen",
  exitFullscreen: "exit-fullscreen",
  iosInstall: "ios-install",
});

function getWindow(candidate) {
  if (candidate) return candidate;
  return typeof window !== "undefined" ? window : null;
}

function getDocument(candidate) {
  if (candidate) return candidate;
  return typeof document !== "undefined" ? document : null;
}

function getNavigator(candidate) {
  if (candidate) return candidate;
  return typeof navigator !== "undefined" ? navigator : null;
}

export function isStandaloneDisplayMode(windowObject = null) {
  const win = getWindow(windowObject);
  if (!win) return false;
  return !!(
    win.matchMedia?.("(display-mode: standalone)")?.matches ||
    win.navigator?.standalone === true
  );
}

export function isAppleMobileUserAgent(ua) {
  return /iPhone|iPad|iPod/i.test(String(ua || ""));
}

export function isAndroidWebViewUserAgent(ua) {
  const value = String(ua || "");
  if (!/Android/i.test(value)) return false;
  if (/; wv\)/i.test(value) || /\bwv\b/i.test(value)) return true;
  const hasVersionChrome = /Version\/[\d.]+\s+Chrome\/[\d.]+/i.test(value);
  const hasMobileSafari = /Mobile Safari\/[\d.]+/i.test(value);
  const looksBrowser = /(SamsungBrowser|CriOS|FxiOS|EdgA|OPR|YaBrowser|DuckDuckGo|UCBrowser)/i.test(
    value
  );
  return hasVersionChrome && hasMobileSafari && !looksBrowser;
}

export function isLikelyNativeWrapper({
  windowObject = null,
  documentObject = null,
  navigatorObject = null,
} = {}) {
  const win = getWindow(windowObject);
  const doc = getDocument(documentObject);
  const nav = getNavigator(navigatorObject) || win?.navigator || null;
  const ua = String(nav?.userAgent || "");
  const referrer = String(doc?.referrer || "");
  const hasExplicitGobbleBridge = !!(
    win?.GobbleNative ||
    win?.webkit?.messageHandlers?.gobble ||
    /GobbleAndroid|GobbleWrapper/i.test(ua)
  );
  const isTrustedWebActivity = /^android-app:\/\//i.test(referrer);
  return hasExplicitGobbleBridge || isTrustedWebActivity || isAndroidWebViewUserAgent(ua);
}

export function getFullscreenElement(documentObject = null) {
  const doc = getDocument(documentObject);
  return doc?.fullscreenElement || doc?.webkitFullscreenElement || null;
}

export function canRequestDocumentFullscreen(documentObject = null) {
  const doc = getDocument(documentObject);
  const root = doc?.documentElement;
  if (!doc || !root) return false;
  const standardAvailable =
    doc.fullscreenEnabled !== false && typeof root.requestFullscreen === "function";
  const webkitAvailable = typeof root.webkitRequestFullscreen === "function";
  return standardAvailable || webkitAvailable;
}

export function getDisplayModeSnapshot({
  windowObject = null,
  documentObject = null,
  navigatorObject = null,
} = {}) {
  const win = getWindow(windowObject);
  const doc = getDocument(documentObject);
  const nav = getNavigator(navigatorObject) || win?.navigator || null;
  const userAgent = String(nav?.userAgent || "");
  const isStandalone = isStandaloneDisplayMode(win);
  const isWrapper = isLikelyNativeWrapper({
    windowObject: win,
    documentObject: doc,
    navigatorObject: nav,
  });
  const isFullscreen = !!getFullscreenElement(doc);
  // Safari peut exposer des variantes WebKit de l'API sans autoriser le plein
  // écran arbitraire sur iPhone/iPod. On préfère alors le parcours d'ajout à
  // l'écran d'accueil, qui donne réellement une expérience sans barres.
  const isIphoneBrowser = /iPhone|iPod/i.test(userAgent) && !isStandalone && !isWrapper;
  const canFullscreen = !isIphoneBrowser && canRequestDocumentFullscreen(doc);
  const isIosBrowser = isAppleMobileUserAgent(userAgent) && !isStandalone && !isWrapper;
  let homeAction = HOME_DISPLAY_ACTIONS.none;
  if (!isStandalone && !isWrapper) {
    if (isFullscreen) homeAction = HOME_DISPLAY_ACTIONS.exitFullscreen;
    else if (canFullscreen) homeAction = HOME_DISPLAY_ACTIONS.enterFullscreen;
    else if (isIosBrowser) homeAction = HOME_DISPLAY_ACTIONS.iosInstall;
  }
  return {
    canFullscreen,
    homeAction,
    isFullscreen,
    isIosBrowser,
    isStandalone,
    isWrapper,
  };
}

export async function requestDocumentFullscreen(documentObject = null) {
  const doc = getDocument(documentObject);
  const root = doc?.documentElement;
  if (!root) return false;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (typeof request !== "function") return false;
  await request.call(root);
  return true;
}

export async function exitDocumentFullscreen(documentObject = null) {
  const doc = getDocument(documentObject);
  if (!doc) return false;
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
  if (typeof exit !== "function") return false;
  await exit.call(doc);
  return true;
}
