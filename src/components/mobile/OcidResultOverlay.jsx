import React from "react";
import { createPortal } from "react-dom";

function OcidResultOverlay({
  darkMode = false,
  targetWord = "",
  targetDetail = "",
  voteDetail = "",
  giftDetail = "",
  bluffDetail = "",
  voters = [],
  bluffPoints = 0,
  onClose = null,
}) {
  if (typeof document === "undefined") return null;
  const panelClass = darkMode
    ? "bg-slate-950 text-slate-100 border-slate-700"
    : "bg-white text-slate-950 border-slate-200";
  const blockClass = darkMode ? "bg-slate-900/85 border-slate-700" : "bg-white border-slate-200";
  const targetBlockClass = darkMode
    ? "bg-slate-900/90 border-amber-500/30"
    : "bg-amber-50 border-amber-200";

  return createPortal(
    <div className="fixed inset-0 z-[20220] flex items-center justify-center bg-black/55 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-sm rounded-2xl border p-4 shadow-2xl ${panelClass}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-amber-500">
            Bilan OCID
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className={`h-8 rounded-full border px-3 text-xs font-black ${
              darkMode
                ? "border-slate-600 bg-slate-900 text-slate-100"
                : "border-slate-300 bg-slate-50 text-slate-800"
            }`}
          >
            Fermer
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <div className={`rounded-xl border p-3 ${targetBlockClass}`}>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Mot cible
            </div>
            <div className="mt-1 text-2xl font-black text-slate-950 dark:text-amber-100">
              {String(targetWord || "").toUpperCase() || "?"}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {targetDetail || "Pas trouvé cette fois."}
            </div>
          </div>

          <div className={`rounded-xl border p-3 ${blockClass}`}>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Votre vote
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {voteDetail || "Aucun vote enregistré."}
            </div>
            {giftDetail ? (
              <div className="mt-1 text-xs font-bold text-rose-600 dark:text-rose-300">
                {giftDetail}
              </div>
            ) : null}
          </div>

          <div className={`rounded-xl border p-3 ${blockClass}`}>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Votre bluff
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {bluffDetail || "Vous n'avez pas bluffé sur cette manche."}
            </div>
            {Array.isArray(voters) && voters.length ? (
              <div className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                Votes reçus : {voters.join(", ")} · +{bluffPoints} pts
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default React.memo(OcidResultOverlay);
