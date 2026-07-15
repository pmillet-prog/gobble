import React from "react";

export default function SoundSettingsPanel({
  darkMode = false,
  isOpen = false,
  enabledSoundCount = 0,
  allSoundOn = false,
  soundMasterVolume = 1,
  ambientOn = false,
  soundValidationEnabled = false,
  soundInvalidErrorEnabled = false,
  soundTileStepEnabled = false,
  soundTimerEnabled = false,
  soundGobbleEnabled = false,
  onClose = null,
  onToggleAll = null,
  onMasterVolumeChange = null,
  onToggleAmbient = null,
  onToggleValidation = null,
  onToggleInvalidError = null,
  onToggleTileStep = null,
  onToggleTimer = null,
  onToggleGobble = null,
}) {
  const panelClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] border-amber-300/70 text-amber-50"
    : "bg-[linear-gradient(180deg,rgba(255,250,232,0.98),rgba(226,238,255,0.99))] border-amber-300/80 text-slate-900";
  const headerClass = darkMode
    ? "border-amber-200/25 bg-amber-300/10"
    : "border-amber-300/55 bg-amber-100/65";
  const backButtonClass =
    "bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950";
  const cardClass = darkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50"
    : "bg-white/65 border-amber-300/45 text-slate-800";
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
            <div className="text-sm font-extrabold tracking-wide">Son</div>
            <span className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold border border-slate-300/40">
              {enabledSoundCount}/6
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
          <button
            type="button"
            onClick={onToggleAll}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${toggleClass(
              allSoundOn
            )}`}
          >
            <span className="font-semibold">Tout On / Tout Off</span>
            <span className="text-[10px] font-semibold opacity-80">
              {allSoundOn ? "Tout On" : "Tout Off"}
            </span>
          </button>
          <div className={`w-full rounded-xl border px-3 py-2 ${cardClass}`}>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
              <span>Volume général</span>
              <span>{Math.round(soundMasterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(soundMasterVolume * 100)}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (typeof onMasterVolumeChange === "function") {
                  onMasterVolumeChange(Number.isFinite(next) ? next / 100 : 1);
                }
              }}
              className="mt-2 w-full accent-blue-500"
              aria-label="Volume général"
            />
          </div>
          {renderToggle({
            enabled: ambientOn,
            label: "Son d'ambiance",
            onClick: onToggleAmbient,
          })}
          {renderToggle({
            enabled: soundValidationEnabled,
            label: "Son de validation",
            onClick: onToggleValidation,
          })}
          {renderToggle({
            enabled: soundInvalidErrorEnabled,
            label: "Mots invalides / erreurs",
            onClick: onToggleInvalidError,
          })}
          {renderToggle({
            enabled: soundTileStepEnabled,
            label: "Son des tuiles (step)",
            onClick: onToggleTileStep,
          })}
          {renderToggle({
            enabled: soundTimerEnabled,
            label: "Son des timers",
            onClick: onToggleTimer,
          })}
          {renderToggle({
            enabled: soundGobbleEnabled,
            label: "Son gobble / bonus",
            onClick: onToggleGobble,
          })}
        </div>
      </div>
    </div>
  );
}
