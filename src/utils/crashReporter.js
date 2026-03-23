export const CRASH_STORAGE_KEY = "gobble_last_crash_v1";
export const SUPPORT_EMAIL = "support@gobble.fr";
const CRASH_BREADCRUMB_LIMIT = 40;

function readTheme() {
  if (typeof document === "undefined" || !document.body) return null;
  return document.body.classList.contains("theme-dark") ? "dark" : "light";
}

function readBreadcrumbs() {
  if (typeof window === "undefined") return [];
  const list = Array.isArray(window.__gobbleCrashBreadcrumbs)
    ? window.__gobbleCrashBreadcrumbs
    : [];
  return list.slice(-CRASH_BREADCRUMB_LIMIT);
}

function readActiveElementSummary() {
  if (typeof document === "undefined") return null;
  const el = document.activeElement;
  if (!el) return null;
  const className =
    typeof el.className === "string" ? el.className.trim().slice(0, 180) : "";
  return {
    tag: String(el.tagName || "").toLowerCase() || null,
    id: typeof el.id === "string" ? el.id || null : null,
    className: className || null,
    name: typeof el.getAttribute === "function" ? el.getAttribute("name") || null : null,
    role: typeof el.getAttribute === "function" ? el.getAttribute("role") || null : null,
  };
}

function readConnectionSummary() {
  if (typeof navigator === "undefined") return null;
  const conn =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType || null,
    type: conn.type || null,
    downlink: Number.isFinite(conn.downlink) ? conn.downlink : null,
    rtt: Number.isFinite(conn.rtt) ? conn.rtt : null,
    saveData: typeof conn.saveData === "boolean" ? conn.saveData : null,
  };
}

function readMemorySummary() {
  if (typeof performance === "undefined" || !performance.memory) return null;
  const memory = performance.memory;
  return {
    jsHeapSizeLimit: Number.isFinite(memory.jsHeapSizeLimit) ? memory.jsHeapSizeLimit : null,
    totalJSHeapSize: Number.isFinite(memory.totalJSHeapSize) ? memory.totalJSHeapSize : null,
    usedJSHeapSize: Number.isFinite(memory.usedJSHeapSize) ? memory.usedJSHeapSize : null,
  };
}

export function pushCrashBreadcrumb(event, payload = {}) {
  if (typeof window === "undefined") return;
  const safeEvent = String(event || "").trim();
  if (!safeEvent) return;
  const nextEntry = {
    at: new Date().toISOString(),
    event: safeEvent,
    payload: payload && typeof payload === "object" ? payload : {},
  };
  const list = Array.isArray(window.__gobbleCrashBreadcrumbs)
    ? window.__gobbleCrashBreadcrumbs
    : [];
  list.push(nextEntry);
  if (list.length > CRASH_BREADCRUMB_LIMIT) {
    list.splice(0, list.length - CRASH_BREADCRUMB_LIMIT);
  }
  window.__gobbleCrashBreadcrumbs = list;
}

export function getCrashContext() {
  if (typeof window === "undefined") return {};
  const runtime =
    window.__gobbleCrashRuntime &&
    typeof window.__gobbleCrashRuntime === "object"
      ? window.__gobbleCrashRuntime
      : {};
  return {
    url: String(window.location?.href || ""),
    referrer: typeof document !== "undefined" ? String(document.referrer || "") : "",
    userAgent: typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "",
    language: typeof navigator !== "undefined" ? String(navigator.language || "") : "",
    languages:
      typeof navigator !== "undefined" && Array.isArray(navigator.languages)
        ? navigator.languages.slice(0, 10)
        : [],
    online: typeof navigator !== "undefined" ? navigator.onLine !== false : null,
    visibilityState: typeof document !== "undefined" ? document.visibilityState || null : null,
    hasFocus: typeof document !== "undefined" && typeof document.hasFocus === "function"
      ? document.hasFocus()
      : null,
    localTime: new Date().toString(),
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions?.().timeZone || null
        : null,
    viewport: {
      width: Number(window.innerWidth) || null,
      height: Number(window.innerHeight) || null,
      dpr: Number(window.devicePixelRatio) || null,
    },
    screen: typeof window.screen !== "undefined"
      ? {
          width: Number(window.screen.width) || null,
          height: Number(window.screen.height) || null,
          availWidth: Number(window.screen.availWidth) || null,
          availHeight: Number(window.screen.availHeight) || null,
        }
      : null,
    historyLength:
      typeof window.history !== "undefined" && Number.isFinite(window.history.length)
        ? window.history.length
        : null,
    activeElement: readActiveElementSummary(),
    connection: readConnectionSummary(),
    memory: readMemorySummary(),
    theme: readTheme(),
    build: String(window.__gobbleBuildTag || ""),
    runtime,
    breadcrumbs: readBreadcrumbs(),
  };
}

export function persistCrashReport(payload) {
  try {
    if (typeof window !== "undefined") {
      window.__gobbleLastCrash = payload;
    }
  } catch (_) {}
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(CRASH_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch (_) {}
}

export function loadPersistedCrashReport() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(CRASH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function buildCrashReport(kind, payload = {}) {
  return {
    kind: String(kind || "unknown"),
    at: new Date().toISOString(),
    ...payload,
    context: {
      ...getCrashContext(),
      ...(payload?.context && typeof payload.context === "object" ? payload.context : {}),
    },
  };
}

export async function sendCrashReport(report, { manual = false } = {}) {
  const payload = report && typeof report === "object" ? report : null;
  if (!payload || typeof window === "undefined") return { ok: false, skipped: true };
  try {
    const response = await fetch("/api/client-crash", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manual: !!manual,
        report: payload,
      }),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || "send_failed") };
  }
}

export function formatCrashReportText(report) {
  const payload = report && typeof report === "object" ? report : {};
  return JSON.stringify(payload, null, 2);
}

export function buildCrashMailtoHref(report) {
  const subject = encodeURIComponent("Rapport de crash Gobble");
  const body = encodeURIComponent(formatCrashReportText(report));
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
