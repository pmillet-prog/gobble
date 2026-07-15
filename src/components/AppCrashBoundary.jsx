import React from "react";
import {
  buildCrashMailtoHref,
  buildCrashReport,
  formatCrashReportText,
  persistCrashReport,
  sendCrashReport,
} from "../utils/crashReporter.js";
import { maybeRecoverFromStaleChunk } from "../utils/staleChunkRecovery.js";

export default class AppCrashBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      report: null,
      sendStatus: "idle",
      copyStatus: "idle",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      report: buildCrashReport("react-error-boundary", {
        message: String(error?.message || error || "unknown_error"),
        stack: String(error?.stack || ""),
      }),
    };
  }

  componentDidCatch(error, info) {
    if (maybeRecoverFromStaleChunk(error)) {
      return;
    }
    const report = buildCrashReport("react-error-boundary", {
      message: String(error?.message || error || "unknown_error"),
      stack: String(error?.stack || ""),
      componentStack: String(info?.componentStack || ""),
    });
    persistCrashReport(report);
    try {
      console.error("[app-crash-boundary]", report);
    } catch (_) {}
    this.setState({ report, sendStatus: "sending" }, async () => {
      const result = await sendCrashReport(report);
      this.setState({ sendStatus: result.ok ? "sent" : "failed" });
    });
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  handleCopy = async () => {
    const text = formatCrashReportText(this.state.report);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.setState({ copyStatus: "copied" });
        return;
      }
    } catch (_) {}
    this.setState({ copyStatus: "failed" });
  };

  handleSend = async () => {
    const report = this.state.report;
    if (!report) return;
    this.setState({ sendStatus: "sending" });
    const result = await sendCrashReport(report, { manual: true });
    this.setState({ sendStatus: result.ok ? "sent" : "failed" });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const report = this.state.report || {};
    const darkMode =
      typeof document !== "undefined" &&
      document.body &&
      document.body.classList.contains("theme-dark");
    const sendLabel =
      this.state.sendStatus === "sending"
        ? "Envoi..."
        : this.state.sendStatus === "sent"
        ? "Rapport envoyé"
        : this.state.sendStatus === "failed"
        ? "Réessayer l'envoi"
        : "Envoyer le rapport";
    const copyLabel =
      this.state.copyStatus === "copied"
        ? "Rapport copié"
        : this.state.copyStatus === "failed"
        ? "Copie impossible"
        : "Copier le rapport";
    const mailtoHref = buildCrashMailtoHref(report);

    return (
      <div
        style={{
          minHeight: "100vh",
          background: darkMode ? "#0f172a" : "#f8fafc",
          color: darkMode ? "#f8fafc" : "#0f172a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "min(560px, 100%)",
            borderRadius: "20px",
            border: darkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.12)",
            background: darkMode ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.9)",
            boxShadow: darkMode
              ? "0 24px 60px rgba(0,0,0,0.38)"
              : "0 24px 60px rgba(15,23,42,0.12)",
            padding: "24px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 800, opacity: 0.72, letterSpacing: "0.12em" }}>
            GOBBLE CRASH GUARD
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 900 }}>L'application a planté</div>
          <p style={{ marginTop: "12px", lineHeight: 1.5, opacity: 0.86 }}>
            Recharge la page. Si le problème revient, envoie le rapport de crash: ça m'aidera
            directement a corriger le bug plus vite, donc c'est aussi dans ton interet.
          </p>
          <div
            style={{
              marginTop: "18px",
              padding: "12px 14px",
              borderRadius: "14px",
              background: darkMode ? "rgba(2,6,23,0.8)" : "rgba(241,245,249,0.95)",
              fontSize: "13px",
              lineHeight: 1.45,
              wordBreak: "break-word",
            }}
          >
            <div><strong>Heure:</strong> {report.at || "n/a"}</div>
            <div><strong>Type:</strong> {report.kind || "n/a"}</div>
            <div><strong>Message:</strong> {report.message || "n/a"}</div>
            <div><strong>Thème:</strong> {report?.context?.theme || "n/a"}</div>
            <div><strong>Build:</strong> {report?.context?.build || "n/a"}</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "18px" }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                border: "none",
                borderRadius: "12px",
                padding: "12px 16px",
                fontSize: "14px",
                fontWeight: 800,
                cursor: "pointer",
                background: "#f59e0b",
                color: "#111827",
              }}
            >
              Recharger
            </button>
            <button
              type="button"
              onClick={this.handleSend}
              disabled={this.state.sendStatus === "sending"}
              style={{
                border: "none",
                borderRadius: "12px",
                padding: "12px 16px",
                fontSize: "14px",
                fontWeight: 800,
                cursor: this.state.sendStatus === "sending" ? "default" : "pointer",
                background: darkMode ? "#334155" : "#e2e8f0",
                color: darkMode ? "#f8fafc" : "#0f172a",
                opacity: this.state.sendStatus === "sending" ? 0.7 : 1,
              }}
            >
              {sendLabel}
            </button>
            <button
              type="button"
              onClick={this.handleCopy}
              style={{
                border: "none",
                borderRadius: "12px",
                padding: "12px 16px",
                fontSize: "14px",
                fontWeight: 800,
                cursor: "pointer",
                background: darkMode ? "#1e293b" : "#cbd5e1",
                color: darkMode ? "#f8fafc" : "#0f172a",
              }}
            >
              {copyLabel}
            </button>
            <a
              href={mailtoHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "12px",
                padding: "12px 16px",
                fontSize: "14px",
                fontWeight: 800,
                textDecoration: "none",
                background: darkMode ? "#0f766e" : "#99f6e4",
                color: "#0f172a",
              }}
            >
              Envoyer une copie a support@gobble.fr
            </a>
          </div>
          <div style={{ marginTop: "10px", fontSize: "12px", lineHeight: 1.45, opacity: 0.76 }}>
            Le bouton support ouvre un email pre-rempli avec le rapport. L'envoi m'aide a
            identifier puis corriger le probleme.
          </div>
          <pre
            style={{
              marginTop: "16px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "11px",
              lineHeight: 1.35,
              opacity: 0.72,
              maxHeight: "28vh",
              overflow: "auto",
            }}
          >
            {formatCrashReportText(report)}
          </pre>
        </div>
      </div>
    );
  }
}
