import React from "react";

function ControlButton({ icon, label, onClick, accent = false, compact = false, disabled = false }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`relative inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border font-black leading-tight shadow-sm disabled:opacity-45 ${compact ? "min-h-9 px-1 py-1 text-[10px]" : "min-h-10 px-2 py-1.5 text-[11px]"} ${accent ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-950 dark:text-emerald-50" : "border-slate-300/70 bg-white/90 text-slate-800 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-100"}`}>
      <span className={`material-symbols-outlined leading-none ${compact ? "text-[17px]" : "text-[18px]"}`} aria-hidden="true">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function TrainingSessionControls({ compact = false, phase = "playing", onJoinLive, onFinish, onReplay, onReturnLobby }) {
  return (
    <div className="grid w-full grid-cols-3 gap-1.5">
      <ControlButton compact={compact} icon="live_tv" label={compact ? "Live" : "Rejoindre le live"} accent onClick={onJoinLive} />
      <ControlButton
        compact={compact}
        icon={phase === "playing" ? "flag" : "refresh"}
        label={phase === "playing" ? "Terminer" : compact ? "Nouvelle" : "Nouvelle grille"}
        onClick={phase === "playing" ? onFinish : onReplay}
      />
      <ControlButton compact={compact} icon="home" label={compact ? "Lobby" : "Retour au lobby"} onClick={onReturnLobby} />
    </div>
  );
}
