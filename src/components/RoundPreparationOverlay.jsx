import React from "react";

function RoundPreparationOverlay({ darkMode = false, message = "", title = "", visible = false }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[12065] pointer-events-none select-none flex items-center justify-center bg-slate-950/45 px-4">
      <div
        className={`w-full max-w-sm rounded-xl border px-4 py-3 text-center shadow-2xl ${
          darkMode
            ? "border-amber-300/45 bg-slate-950/92 text-slate-50"
            : "border-amber-500/45 bg-white/95 text-slate-950"
        }`}
      >
        <div className="text-sm font-black uppercase tracking-wide text-amber-500">
          {title}
        </div>
        <div className="mt-2 text-sm font-semibold leading-snug">{message}</div>
        <div
          className="mx-auto mt-3 h-8 w-8 animate-spin rounded-full border-4 border-amber-500/25 border-t-amber-500"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default React.memo(RoundPreparationOverlay);
