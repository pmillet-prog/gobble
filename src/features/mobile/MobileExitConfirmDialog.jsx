import React from "react";
import ViewportOverlay from "../../components/overlays/ViewportOverlay.jsx";

export default function MobileExitConfirmDialog({ open, onCancel, onConfirm }) {
  if (!open) return null;
  return <ViewportOverlay label="Confirmer la sortie" onClose={onCancel} className="z-[22000]">
    <div className="w-full max-w-sm rounded-2xl border border-red-300/50 bg-slate-950 px-4 py-4 text-white shadow-2xl">
      <div className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-red-300">Quitter la partie ?</div>
      <p className="mt-3 text-center text-sm font-semibold leading-snug text-slate-100">
        Tu es en pleine manche. Si tu quittes maintenant, tu abandonnes la manche en cours.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-black" onClick={onCancel}>Rester</button>
        <button type="button" className="rounded-xl bg-red-600 px-3 py-2 text-sm font-black shadow-lg shadow-red-950/30" onClick={onConfirm}>Quitter</button>
      </div>
    </div>
  </ViewportOverlay>;
}
