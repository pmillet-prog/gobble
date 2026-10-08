import React from "react";

const formatCount = value => Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString("fr-FR");

export default function PresenterHitsRecap({ entries, trackingStartTs, weekStartTs }) {
  const rows = Array.isArray(entries) ? entries : [];
  const total = rows.reduce((sum, entry) => sum + Math.max(0, Number(entry.hits) || 0), 0);
  const partial = Number(trackingStartTs) > Number(weekStartTs);
  return <section className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-3" aria-label="Tête à claques">
    <div className="text-[11px] font-black uppercase tracking-wide text-amber-200">Tête à claques</div>
    <p className="mt-1 text-xs opacity-70">Les présentateurs les plus chahutés par tous les joueurs.</p>
    {rows.length ? <ol className="mt-3 space-y-2">
      {rows.map((entry, index) => <li key={entry.presenterId} className="flex items-center gap-2 rounded-lg bg-slate-950/25 px-2 py-2">
        <span className="w-5 shrink-0 text-center text-xs font-black text-amber-200">{index + 1}</span>
        {entry.portraitUrl ? <img src={entry.portraitUrl} alt="" className="h-10 w-10 shrink-0 object-contain" loading="lazy" /> : null}
        <div className="min-w-0 flex-1 text-xs">
          <div className="break-words font-semibold [overflow-wrap:anywhere]">{entry.nick}</div>
          <div className="mt-0.5 font-black tabular-nums text-amber-200">{formatCount(entry.hits)} coup{entry.hits === 1 ? "" : "s"}</div>
        </div>
      </li>)}
    </ol> : <p className="mt-2 text-xs opacity-65">Aucun relevé pour cette semaine.</p>}
    {rows.length ? <p className="mt-2 text-xs opacity-65">{formatCount(total)} coups au total, tous salons confondus.</p> : null}
    {partial ? <p className="mt-2 text-[11px] opacity-65">Suivi commencé le {new Date(trackingStartTs).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}.</p> : null}
  </section>;
}
