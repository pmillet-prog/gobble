import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppCrashBoundary from "./components/AppCrashBoundary.jsx";
import {
  buildCrashReport,
  persistCrashReport,
  pushCrashBreadcrumb,
  sendCrashReport,
} from "./utils/crashReporter.js";
import { maybeRecoverFromStaleChunk } from "./utils/staleChunkRecovery.js";
import "./index.css";

function persistGlobalCrash(kind, payload) {
  const report = buildCrashReport(kind, payload);
  persistCrashReport(report);
  try {
    console.error(`[global-crash:${kind}]`, report);
  } catch (_) {}
  void sendCrashReport(report);
}

if (typeof window !== "undefined") {
  window.__pushGobbleCrashBreadcrumb = pushCrashBreadcrumb;
  pushCrashBreadcrumb("boot", {
    href: String(window.location?.href || ""),
  });

  let lastResizeAt = 0;
  const onResize = () => {
    const now = Date.now();
    if (now - lastResizeAt < 1000) return;
    lastResizeAt = now;
    pushCrashBreadcrumb("resize", {
      width: Number(window.innerWidth) || null,
      height: Number(window.innerHeight) || null,
      dpr: Number(window.devicePixelRatio) || null,
    });
  };
  const onVisibility = () => {
    pushCrashBreadcrumb("visibility", {
      state: typeof document !== "undefined" ? document.visibilityState || null : null,
    });
  };
  const onOnline = () => {
    pushCrashBreadcrumb("network", { online: navigator.onLine !== false });
  };
  const onPageShow = () => {
    pushCrashBreadcrumb("pageshow", {});
  };
  const onPageHide = () => {
    pushCrashBreadcrumb("pagehide", {});
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOnline);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  window.addEventListener("error", (event) => {
    if (maybeRecoverFromStaleChunk(event?.error || event?.message || "")) {
      event.preventDefault?.();
      return;
    }
    pushCrashBreadcrumb("window-error", {
      message: String(event?.message || ""),
      source: String(event?.filename || ""),
      line: Number(event?.lineno) || null,
      col: Number(event?.colno) || null,
    });
    persistGlobalCrash("window-error", {
      message: String(event?.message || ""),
      stack: String(event?.error?.stack || ""),
      source: String(event?.filename || ""),
      line: Number(event?.lineno) || null,
      col: Number(event?.colno) || null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    if (maybeRecoverFromStaleChunk(reason)) {
      event.preventDefault?.();
      return;
    }
    let message = "";
    let stack = "";
    if (typeof reason === "string") {
      message = reason;
    } else if (reason?.message) {
      message = String(reason.message);
      stack = String(reason?.stack || "");
    } else {
      try {
        message = JSON.stringify(reason || null);
      } catch (_) {
        message = String(reason || "");
      }
    }
    pushCrashBreadcrumb("unhandled-rejection", { message });
    persistGlobalCrash("unhandled-rejection", { message, stack });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppCrashBoundary>
      <App />
    </AppCrashBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* ignore registration errors */
  });
}
