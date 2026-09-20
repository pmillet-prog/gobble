import React from "react";

export default function DailyHistoryWords({ state, selfEntry, openDefinition, onRetry }) {
  if (state.loading) return <div className="py-6 text-center text-sm" role="status">Chargement des mots…</div>;
  if (state.error) return (
    <div className="py-6 text-center text-sm" role="alert">
      <p>Impossible de charger les mots.</p>
      <button type="button" onClick={onRetry} className="mt-2 rounded-lg border px-4 py-2 font-bold">Réessayer</button>
    </div>
  );
  const words = Array.isArray(state.findableWords) ? state.findableWords : [];
  const found = new Set(state.myWords || []);
  if (!words.length) return <div className="py-6 text-center text-sm opacity-70">Liste des mots indisponible pour cette grille.</div>;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold">Mots trouvables</span><span className="opacity-70">{words.length}</span>
      </div>
      {Number(selfEntry?.wordsCount) > 0 && !found.size ? (
        <div className="text-xs opacity-70">Mise en surbrillance indisponible pour cette ancienne grille.</div>
      ) : null}
      <ul className="flex flex-col text-sm">
        {words.map((word) => (
          <li key={word} className="rounded px-1 hover:bg-slate-950/45">
            <button type="button" onClick={() => openDefinition(word)}
              className="flex w-full items-center gap-2 py-0.5 text-left" aria-label={`Voir la définition de ${word}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${found.has(word) ? "" : "invisible"}`} />
              <span className={found.has(word) ? "font-bold" : "text-amber-50/70"}>{word}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
