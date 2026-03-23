import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppCrashBoundary from "./components/AppCrashBoundary.jsx";
import {
  buildCrashReport,
  persistCrashReport,
  sendCrashReport,
} from "./utils/crashReporter.js";
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
  window.addEventListener("error", (event) => {
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
