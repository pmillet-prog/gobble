import React from "react";

export default function KeyboardSettingsPanel({
  darkMode = false,
  isOpen = false,
  recallSubmittedWord = false,
  onClose = null,
  onToggleRecallSubmittedWord = null,
}) {
  const panelClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] border-amber-300/70 text-amber-50"
    : "bg-[linear-gradient(180deg,rgba(255,250,232,0.98),rgba(226,238,255,0.99))] border-amber-300/80 text-slate-900";
  const headerClass = darkMode
    ? "border-amber-200/25 bg-amber-300/10"
    : "border-amber-300/55 bg-amber-100/65";
  const buttonClass =
    "bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950";
  const toggleClass = recallSubmittedWord
    ? darkMode
      ? "bg-emerald-900/60 border-emerald-300/45 text-emerald-50"
      : "bg-emerald-50/85 border-emerald-300/60 text-emerald-800"
    : darkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50"
    : "bg-white/65 border-amber-300/45 text-slate-800";

  return (
    <div
      className={`absolute inset-y-0 right-0 w-full max-w-md border-l-2 shadow-2xl transition-transform duration-300 ${panelClass} ${
        isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
    >
      <div className="h-full flex flex-col">
        <div className={`shrink-0 px-4 py-3 border-b ${headerClass}`}>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`h-8 px-2 rounded-lg border text-xs font-semibold ${buttonClass}`}
            >
              Retour
            </button>
            <div className="text-sm font-extrabold tracking-wide">Clavier</div>
            <span className="w-12" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
          <button
            type="button"
            onClick={onToggleRecallSubmittedWord}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${toggleClass}`}
          >
            <span className="min-w-0 text-left">
              <span className="block font-semibold">Rappeler le dernier mot envoye</span>
              <span className="block text-[10px] opacity-70">
                Inclut les mots invalides avec les fleches haut/bas.
              </span>
            </span>
            <span className="text-[10px] font-semibold opacity-80">
              {recallSubmittedWord ? "On" : "Off"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
