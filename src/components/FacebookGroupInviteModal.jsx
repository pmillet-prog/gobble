import React from "react";
import { openFacebookGroup } from "../utils/facebookGroup.js";

function FacebookLogo({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.7 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5H17V3.7c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4.1v2.2H8.2V13h2.6v8h2.9Z" />
    </svg>
  );
}

export default function FacebookGroupInviteModal({ open = false, onClose, darkMode = false }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[20040] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Fermer l'invitation Facebook"
      />
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl ${
          darkMode
            ? "border-blue-300/25 bg-slate-950 text-slate-100"
            : "border-blue-200 bg-white text-slate-900"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Rejoindre Gobble sur Facebook"
      >
        <div className="h-2 bg-[#1877f2]" />
        <button
          type="button"
          className={`absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-full border text-lg ${
            darkMode
              ? "border-white/15 bg-slate-900 text-slate-100"
              : "border-slate-200 bg-white text-slate-600"
          }`}
          onClick={onClose}
          aria-label="Fermer"
        >
          ×
        </button>
        <div className="px-6 pb-6 pt-7 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#1877f2] text-white shadow-lg shadow-blue-600/30">
            <FacebookLogo className="h-16 w-16" />
          </div>
          <h2 className="mt-5 text-2xl font-black leading-tight">
            Rejoignez Gobble sur Facebook !
          </h2>
          <p className={`mx-auto mt-3 max-w-sm text-sm font-semibold leading-relaxed ${
            darkMode ? "text-slate-300" : "text-slate-600"
          }`}>
            Rejoignez le groupe Gobble sur Facebook pour des news et autres !
          </p>
          <button
            type="button"
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1877f2] px-5 py-3.5 text-base font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#0f6de0] active:scale-[0.98]"
            onClick={() => {
              onClose?.();
              openFacebookGroup();
            }}
          >
            <FacebookLogo className="h-7 w-7" />
            Rejoindre le groupe
          </button>
        </div>
      </div>
    </div>
  );
}

export { FacebookLogo };
