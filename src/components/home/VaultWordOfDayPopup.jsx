import React from "react";
import { createPortal } from "react-dom";
import FantasyPanelShell from "./FantasyPanelShell.jsx";

export default function VaultWordOfDayPopup({
  definition = "",
  displayWord = "",
  loading = false,
  onClose = null,
  onOpenVault = null,
  source = "",
  url = "",
  word = "",
}) {
  if (typeof document === "undefined") return null;

  const safeWord = String(displayWord || word || "").trim();
  const sourceLabel =
    source === "wiktionary"
      ? "Wiktionary"
      : source === "wikipedia"
      ? "Wikipedia"
      : source === "dictionaryapi.dev"
      ? "Dictionary API"
      : source
      ? "Source"
      : "";

  return createPortal(
    <div className="fixed inset-0 z-[12070] flex items-center justify-center bg-black/60 px-4 py-5 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Fermer mot du jour"
      />
      <FantasyPanelShell
        className="relative w-full max-w-md"
        title="Mot du jour"
        subtitle="pioché parmi les mots de votre coffre-fort"
        onClose={onClose}
      >
        <div className="space-y-4 px-4 py-4">
          <div className="rounded-2xl border border-amber-200/30 bg-slate-950/30 px-4 py-4 text-center shadow-inner">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-200/75">
              {loading ? "Recherche..." : "Aujourd'hui"}
            </div>
            <div className="mt-2 break-words text-3xl font-black uppercase tracking-[0.08em] text-amber-100 drop-shadow">
              {safeWord || "..."}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200/20 bg-white/10 px-4 py-3 text-sm font-semibold leading-6 text-amber-50/90">
            {loading ? (
              "Chargement de la définition..."
            ) : definition ? (
              definition
            ) : (
              "Définition non disponible pour le moment."
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {url && sourceLabel ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-amber-200 underline underline-offset-2"
              >
                Source : {sourceLabel}
              </a>
            ) : sourceLabel ? (
              <span className="text-xs font-bold text-amber-200">Source : {sourceLabel}</span>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="rounded-full border border-amber-300/75 bg-gradient-to-b from-amber-200 to-amber-600 px-4 py-2 text-xs font-black text-slate-950 shadow"
              onClick={onOpenVault}
            >
              Voir le coffre-fort
            </button>
          </div>
        </div>
      </FantasyPanelShell>
    </div>,
    document.body
  );
}
