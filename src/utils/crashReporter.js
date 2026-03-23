export const CRASH_STORAGE_KEY = "gobble_last_crash_v1";
export const SUPPORT_EMAIL = "support@gobble.fr";

function readTheme() {
  if (typeof document === "undefined" || !document.body) return null;
  return document.body.classList.contains("theme-dark") ? "dark" : "light";
}

export function getCrashContext() {
  if (typeof window === "undefined") return {};
  return {
    url: String(window.location?.href || ""),
    userAgent: typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "",
    language: typeof navigator !== "undefined" ? String(navigator.language || "") : "",
    viewport: {
      width: Number(window.innerWidth) || null,
      height: Number(window.innerHeight) || null,
      dpr: Number(window.devicePixelRatio) || null,
    },
    theme: readTheme(),
    build: String(window.__gobbleBuildTag || ""),
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
