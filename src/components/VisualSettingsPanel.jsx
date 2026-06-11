import React from "react";

export default function VisualSettingsPanel({
  darkMode = false,
  isOpen = false,
  enabledVisualCount = 0,
  allVisualOn = false,
  visualGobbleEnabled = false,
  visualPraiseEnabled = false,
  visualInvalidWordsEnabled = false,
  visualScreenShakeEnabled = false,
  visualConfettiEnabled = false,
  onClose = null,
  onOpenTheme = null,
  themeBalance = 0,
  themeBadgeUrl = "",
  onToggleAll = null,
  onToggleGobble = null,
  onTogglePraise = null,
  onToggleInvalidWords = null,
  onToggleScreenShake = null,
  onToggleConfetti = null,
}) {
  const panelClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] border-amber-300/70 text-amber-50"
    : "bg-[linear-gradient(180deg,rgba(255,250,232,0.98),rgba(226,238,255,0.99))] border-amber-300/80 text-slate-900";
  const headerClass = darkMode
    ? "border-amber-200/25 bg-amber-300/10"
    : "border-amber-300/55 bg-amber-100/65";
  const backButtonClass =
    "bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950";
  const themeButtonClass = darkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50"
    : "bg-white/70 border-amber-300/45 text-slate-900";
  const toggleClass = (enabled) =>
    enabled
      ? darkMode
        ? "bg-emerald-900/60 border-emerald-300/45 text-emerald-50"
        : "bg-emerald-50/85 border-emerald-300/60 text-emerald-800"
      : darkMode
      ? "bg-rose-950/55 border-rose-300/40 text-rose-50"
      : "bg-rose-50/85 border-rose-300/60 text-rose-800";
  const renderToggle = ({ enabled, label, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${toggleClass(
        enabled
      )}`}
    >
      <span>{label}</span>
      <span className="text-[10px] font-semibold opacity-80">{enabled ? "On" : "Off"}</span>
    </button>
  );

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
              className={`h-8 px-2 rounded-lg border text-xs font-semibold ${backButtonClass}`}
            >
              Retour
            </button>
            <div className="text-sm font-extrabold tracking-wide">Apparence</div>
            <span className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold border border-slate-300/40">
              {enabledVisualCount}/5
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
          <button
            type="button"
            onClick={onOpenTheme}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${themeButtonClass}`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] leading-none">
                palette
              </span>
              <span className="inline-flex flex-col items-start leading-tight">
                <span className="font-semibold">Thème</span>
                <span className="text-[10px] opacity-70">
                  Tuiles, lettres et interface
                </span>
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold border border-amber-300/40 bg-amber-300/15">
              {themeBadgeUrl ? <img src={themeBadgeUrl} alt="" className="h-3.5 w-3.5 rounded-full" /> : null}
              {Math.max(0, Number(themeBalance) || 0)}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleAll}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${toggleClass(
              allVisualOn
            )}`}
          >
            <span className="font-semibold">Tout On / Tout Off</span>
            <span className="text-[10px] font-semibold opacity-80">
              {allVisualOn ? "Tout On" : "Tout Off"}
            </span>
          </button>
          {renderToggle({
            enabled: visualGobbleEnabled,
            label: "Gobble / double gobble",
            onClick: onToggleGobble,
          })}
          {renderToggle({
            enabled: visualPraiseEnabled,
            label: "Gros scores",
            onClick: onTogglePraise,
          })}
          {renderToggle({
            enabled: visualInvalidWordsEnabled,
            label: "Mots invalides",
            onClick: onToggleInvalidWords,
          })}
          {renderToggle({
            enabled: visualScreenShakeEnabled,
            label: "Secousses écran",
            onClick: onToggleScreenShake,
          })}
          {renderToggle({
            enabled: visualConfettiEnabled,
            label: "Confettis",
            onClick: onToggleConfetti,
          })}
        </div>
      </div>
    </div>
  );
}
