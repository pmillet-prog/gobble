import React from "react";
import { createPortal } from "react-dom";

export default function BroadcastNoticePopup({
  darkMode = false,
  message = null,
  onClose = null,
}) {
  if (!message || typeof document === "undefined") return null;

  const title = typeof message.title === "string" ? message.title.trim() : "";
  const body = typeof message.body === "string" ? message.body.trim() : "";
  const ctaLabel = typeof message.ctaLabel === "string" ? message.ctaLabel.trim() : "";
  const ctaUrl = typeof message.ctaUrl === "string" ? message.ctaUrl.trim() : "";

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4 py-4"
      style={{ zIndex: 2147483000 }}
    >
      <div
        className={`w-full max-w-2xl max-h-[min(88vh,900px)] overflow-hidden rounded-2xl border p-4 space-y-3 ${
          darkMode
            ? "bg-slate-900/95 border-white/10 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {title ? <div className="text-lg font-black">{title}</div> : null}
        {body ? (
          <div className="max-h-[min(60vh,640px)] overflow-y-auto pr-2 text-sm whitespace-pre-wrap leading-relaxed opacity-90">
            {body}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              darkMode
                ? "bg-slate-800 border border-white/10 text-slate-100"
                : "bg-white border border-slate-200 text-slate-700"
            }`}
            onClick={() => {
              if (typeof onClose === "function") onClose();
            }}
          >
            Fermer
          </button>
          {ctaLabel && ctaUrl ? (
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white"
              onClick={() => {
                try {
                  window.open(ctaUrl, "_blank", "noopener,noreferrer");
                } catch (_) {}
                if (typeof onClose === "function") onClose();
              }}
            >
              {ctaLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
