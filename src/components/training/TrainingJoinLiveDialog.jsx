import React from "react";
import { createPortal } from "react-dom";

import { describeLiveTrainingStatus } from "../../training/standaloneTraining.js";

export default function TrainingJoinLiveDialog({ busy = false, darkMode = false, status, onCancel, onConfirm }) {
  if (!status || typeof document === "undefined") return null;
  const description = describeLiveTrainingStatus(status);
  return createPortal(
    <div className="fixed inset-0 z-[21400] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Rejoindre le live" onClick={(event) => event.stopPropagation()} className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${darkMode ? "border-emerald-300/30 bg-slate-950 text-slate-100" : "border-emerald-300 bg-white text-slate-900"}`}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-3xl text-emerald-500">live_tv</span>
          <div><div className="text-lg font-black">Rejoindre le live ?</div><div className="text-xs opacity-65">Ta grille d’entraînement sera abandonnée.</div></div>
        </div>
        <div className={`mt-4 rounded-xl border p-3 ${darkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
          <div className="font-black">{description.playerText}</div>
          <div className="mt-1 text-sm opacity-75">{description.roundText}</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-400/50 px-3 py-2 font-bold disabled:opacity-45">Continuer</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-xl border border-emerald-500 bg-emerald-500/20 px-3 py-2 font-black disabled:opacity-45">{busy ? "Connexion…" : "Rejoindre"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
