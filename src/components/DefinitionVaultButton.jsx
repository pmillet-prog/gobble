import React from "react";

export default function DefinitionVaultButton({
  darkMode = false,
  fromVault = false,
  wordInVault = false,
  pending = false,
  onClick = null,
}) {
  const label = fromVault ? "Supprimer" : "Ajouter";
  const title = fromVault
    ? "Retirer du coffre fort"
    : wordInVault
    ? "Mot déjà ajouté au coffre fort"
    : "Ajouter au coffre fort";

  return (
    <button
      type="button"
      className={`px-2.5 py-1.5 rounded border text-[11px] font-semibold inline-flex items-center gap-2 ${
        darkMode
          ? fromVault
            ? "bg-rose-500/20 border-rose-400/50 text-rose-100"
            : "bg-slate-800 border-slate-600 text-slate-100"
          : fromVault
          ? "bg-rose-50 border-rose-200 text-rose-700"
          : "bg-gray-50 border-gray-200 text-slate-900"
      }`}
      onClick={onClick}
      disabled={pending}
      aria-label={title}
      title={title}
    >
      <span className="relative inline-flex h-5 w-5 items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 14.3V16.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 8.2H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
        </svg>
        {!fromVault && wordInVault ? (
          <span className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
              <path
                d="M3.2 8.4 6.2 11.2 12.8 4.8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        ) : null}
      </span>
      <span>{pending ? "..." : label}</span>
    </button>
  );
}
