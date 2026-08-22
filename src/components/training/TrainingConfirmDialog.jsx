import React from "react";
import { createPortal } from "react-dom";

export default function TrainingConfirmDialog({ darkMode, onCancel, onConfirm, selection }) {
  if (!selection || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[21100] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-sm rounded-xl border p-4 shadow-2xl ${
          darkMode
            ? "border-white/10 bg-slate-950 text-slate-100"
            : "border-slate-200 bg-white text-slate-900"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-xs font-extrabold uppercase tracking-widest text-orange-500">
          Entrainement solo
        </div>
        <div className="mt-2 text-xl font-black leading-tight">
          Lancer {selection.label || "cette manche"} ?
        </div>
        <div
          className={`mt-2 text-sm font-semibold ${
            darkMode ? "text-slate-300" : "text-slate-600"
          }`}
        >
          Une seule manche, hors mini-tournoi, sans medaille.
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-lg border px-3 py-2 text-sm font-bold ${
              darkMode ? "border-slate-600 bg-slate-900" : "border-slate-200 bg-slate-50"
            }`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-orange-400 bg-orange-500 px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-orange-500/20"
          >
            Lancer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
