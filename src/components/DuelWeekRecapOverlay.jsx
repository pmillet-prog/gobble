import React from "react";
import { createPortal } from "react-dom";

const TEAM_LABELS = {
  red: "Rouges",
  blue: "Bleus",
};

const PODIUM_META = {
  1: {
    medal: "OR",
    title: "Champion",
    className: "border-amber-300/70 bg-amber-300/15 text-amber-100",
    medalClass:
      "border-amber-200 bg-[radial-gradient(circle_at_35%_28%,#fff7c2_0,#facc15_34%,#b45309_78%)] text-amber-950 shadow-[0_0_42px_rgba(251,191,36,0.38)]",
    barClass: "bg-amber-300",
  },
  2: {
    medal: "ARGENT",
    title: "Deuxieme",
    className: "border-slate-200/55 bg-slate-200/10 text-slate-100",
    medalClass:
      "border-slate-100 bg-[radial-gradient(circle_at_35%_28%,#ffffff_0,#cbd5e1_36%,#64748b_82%)] text-slate-950 shadow-[0_0_30px_rgba(226,232,240,0.25)]",
    barClass: "bg-slate-200",
  },
  3: {
    medal: "BRONZE",
    title: "Troisieme",
    className: "border-orange-300/60 bg-orange-400/12 text-orange-100",
    medalClass:
      "border-orange-200 bg-[radial-gradient(circle_at_35%_28%,#fed7aa_0,#c2410c_44%,#7c2d12_84%)] text-orange-950 shadow-[0_0_30px_rgba(251,146,60,0.25)]",
    barClass: "bg-orange-400",
  },
};

function asNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatValue(formatNumber, value) {
  return typeof formatNumber === "function" ? formatNumber(asNumber(value)) : String(asNumber(value));
}

function getTop(list, limit = 3) {
  return Array.isArray(list) ? list.slice(0, limit) : [];
}

function TeamScore({ team, score, winnerTeam, formatNumber }) {
  const isWinner = winnerTeam === team;
  const colorClass = team === "red" ? "text-red-300" : "text-blue-300";
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${isWinner ? "border-amber-300/55 bg-amber-300/10" : "border-white/10 bg-slate-950/35"}`}>
      <div className={`text-[11px] font-black uppercase tracking-wide ${colorClass}`}>
        {TEAM_LABELS[team]}
      </div>
      <div className="text-2xl font-black tabular-nums">{formatValue(formatNumber, score)}</div>
      {isWinner ? <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-amber-200">Victoire</div> : null}
    </div>
  );
}

function ContributorList({ team, entries, formatNumber }) {
  const colorClass = team === "red" ? "text-red-300" : "text-blue-300";
  const top = getTop(entries, 5);
  if (!top.length) {
    return <div className="rounded-lg border border-white/10 bg-slate-950/25 px-2 py-2 text-xs opacity-65">Aucune contribution.</div>;
  }
  return (
    <div className="space-y-1">
      {top.map((entry, index) => (
        <div
          key={`${team}-${entry?.installId || entry?.nick || index}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/25 px-2 py-1.5 text-xs"
        >
          <span className="min-w-0 truncate">
            <span className={`font-black ${colorClass}`}>#{index + 1}</span>{" "}
            <span className="font-semibold">{entry?.nick || "Joueur"}</span>
          </span>
          <span className="shrink-0 font-black tabular-nums">{formatValue(formatNumber, entry?.points)}</span>
        </div>
      ))}
    </div>
  );
}

function RecordSection({ title, entries, valueLabel, formatNumber, getValue }) {
  const top = getTop(entries, 3);
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-3">
      <div className="text-[11px] font-black uppercase tracking-wide text-amber-200">{title}</div>
      <div className="mt-2 space-y-1">
        {top.length ? (
          top.map((entry, index) => (
            <div key={`${title}-${entry?.playerKey || entry?.nick || index}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                <span className="font-black text-amber-200">#{index + 1}</span>{" "}
                <span className="font-semibold">{entry?.nick || "Joueur"}</span>
              </span>
              <span className="shrink-0 font-black tabular-nums">
                {formatValue(formatNumber, getValue(entry))} {valueLabel}
              </span>
            </div>
          ))
        ) : (
          <div className="text-xs opacity-60">Aucun record.</div>
        )}
      </div>
    </div>
  );
}

function MedalDisc({ rank, large = false }) {
  const meta = PODIUM_META[rank] || PODIUM_META[3];
  return (
    <div className="relative flex justify-center">
      <div
        className={`absolute top-[15%] h-10 rounded-b-xl bg-red-700/90 ${
          large ? "w-12" : "w-9"
        }`}
      />
      <div
        className={`relative z-10 flex shrink-0 flex-col items-center justify-center rounded-full border-4 font-black leading-none ${meta.medalClass} ${
          large ? "h-28 w-28" : "h-20 w-20"
        }`}
      >
        <div className={large ? "text-4xl" : "text-2xl"}>{rank}</div>
        <div className={large ? "mt-1 text-[11px]" : "mt-0.5 text-[9px]"}>{meta.medal}</div>
      </div>
    </div>
  );
}

function PodiumCard({ entry, index, formatNumber, featured = false }) {
  const rank = Number(entry?.rank) || index + 1;
  const meta = PODIUM_META[rank] || PODIUM_META[index + 1] || PODIUM_META[3];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border px-3 py-4 text-center ${meta.className} ${
        featured ? "sm:col-span-2" : ""
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${meta.barClass}`} />
      <MedalDisc rank={rank} large={featured} />
      <div className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] opacity-75">
        {meta.title}
      </div>
      <div className={`${featured ? "text-3xl" : "text-xl"} mt-1 truncate font-black leading-tight`}>
        {entry?.nick || "Joueur"}
      </div>
      <div className="mt-2 inline-flex items-baseline gap-1 rounded-full border border-white/15 bg-slate-950/30 px-3 py-1">
        <span className={`${featured ? "text-2xl" : "text-lg"} font-black tabular-nums`}>
          {formatValue(formatNumber, entry?.weeklyVocabCount ?? entry?.vocabCount ?? entry?.count)}
        </span>
        <span className="text-[10px] font-black uppercase tracking-wide opacity-70">mots</span>
      </div>
    </div>
  );
}

function RacePodiumFinale({ podium, winnerNick, formatNumber }) {
  const champion = podium[0] || null;
  const runners = podium.slice(1, 3);
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-amber-300/55 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.35),rgba(15,23,42,0)_54%),linear-gradient(180deg,rgba(251,191,36,0.16),rgba(15,23,42,0.34))] px-4 py-5 text-center">
        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-200">
          Podium de la course hebdo
        </div>
        <div className="mx-auto mt-3 max-w-sm text-3xl font-black leading-tight text-amber-50">
          Bravo a {winnerNick}
        </div>
        <div className="mx-auto mt-2 max-w-xs text-sm font-bold text-amber-100/90">
          qui a gagne la course de la semaine !!
        </div>
      </div>
      {champion ? (
        <PodiumCard entry={champion} index={0} formatNumber={formatNumber} featured />
      ) : null}
      {runners.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {runners.map((entry, index) => (
            <PodiumCard
              key={entry?.playerKey || entry?.installId || entry?.nick || index}
              entry={entry}
              index={index + 1}
              formatNumber={formatNumber}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DuelWeekRecapOverlay({
  open = false,
  summary = null,
  page = 0,
  weeklyVocabPodium = [],
  onNext = null,
  onClose = null,
  formatNumber = null,
}) {
  if (!open || !summary || typeof document === "undefined") return null;

  const redScore = asNumber(summary?.totalsByTeam?.red);
  const blueScore = asNumber(summary?.totalsByTeam?.blue);
  const winnerTeam = summary?.winnerTeam || null;
  const gap = Math.abs(redScore - blueScore);
  const myContribution = summary?.myContribution || null;
  const contributorsByTeam = summary?.contributorsByTeam || {};
  const records = summary?.weeklyRecords || {};
  const podium = getTop(weeklyVocabPodium, 3);
  const winnerNick = podium[0]?.nick || "Joueur";
  const pagesCount = 3;
  const safePage = Math.max(0, Math.min(page, pagesCount - 1));
  const isLastPage = safePage >= pagesCount - 1;

  const action = (
    <button
      type="button"
      className="w-full rounded-xl border border-amber-300/60 bg-amber-400 px-3 py-2 text-sm font-black text-slate-950"
      onClick={isLastPage ? onClose : onNext}
    >
      {isLastPage ? "Fermer" : "Suivant"}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[20145] flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recapitulatif du duel hebdomadaire"
        className="relative flex max-h-[calc(100vh-48px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-amber-300/70 bg-[linear-gradient(180deg,rgba(18,47,103,0.98),rgba(7,22,55,0.99))] text-amber-50 shadow-2xl"
      >
        <div className={`h-2 w-full ${winnerTeam === "red" ? "bg-red-500" : winnerTeam === "blue" ? "bg-blue-500" : "bg-amber-400"}`} />
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] opacity-65">
              Duel hebdomadaire termine
            </div>
            <div className="mt-1 text-2xl font-black leading-tight">
              {safePage === 0
                ? winnerTeam === "red"
                  ? "Victoire des Rouges"
                  : winnerTeam === "blue"
                  ? "Victoire des Bleus"
                  : "Egalite parfaite"
                : safePage === 1
                ? "Records de la semaine"
                : "Course hebdomadaire"}
            </div>
            <div className="mt-1 text-xs opacity-70">{summary.weekId}</div>
          </div>
          <div className="rounded-full border border-white/15 bg-slate-950/30 px-2 py-1 text-[11px] font-black">
            {safePage + 1}/{pagesCount}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {safePage === 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
                <TeamScore team="red" score={redScore} winnerTeam={winnerTeam} formatNumber={formatNumber} />
                <div className="text-xs font-black opacity-50">VS</div>
                <TeamScore team="blue" score={blueScore} winnerTeam={winnerTeam} formatNumber={formatNumber} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wide opacity-55">Ecart final</div>
                  <div className="mt-1 font-black tabular-nums">{formatValue(formatNumber, gap)} pts</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wide opacity-55">Ta contribution</div>
                  <div className="mt-1 font-black tabular-nums">{formatValue(formatNumber, myContribution?.points)} pts</div>
                </div>
              </div>
              {myContribution ? (
                <div className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-sm">
                  <div className="font-semibold">
                    Tu etais dans l'equipe{" "}
                    <span className={myContribution.team === "red" ? "text-red-300" : "text-blue-300"}>
                      {myContribution.team === "red" ? "Rouge" : "Bleue"}
                    </span>
                    {myContribution.rank ? `, rang #${myContribution.rank}` : ""}.
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="opacity-60">Objectifs</div>
                      <div className="font-black">{formatValue(formatNumber, myContribution.objectivePoints)}</div>
                    </div>
                    <div>
                      <div className="opacity-60">Gobbles</div>
                      <div className="font-black">{formatValue(formatNumber, myContribution.gobblePoints)}</div>
                    </div>
                    <div>
                      <div className="opacity-60">Medailles</div>
                      <div className="font-black">{formatValue(formatNumber, myContribution.medalPoints)}</div>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-red-300">Top rouges</div>
                  <ContributorList team="red" entries={contributorsByTeam.red} formatNumber={formatNumber} />
                </div>
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-blue-300">Top bleus</div>
                  <ContributorList team="blue" entries={contributorsByTeam.blue} formatNumber={formatNumber} />
                </div>
              </div>
            </div>
          ) : safePage === 1 ? (
            <div className="space-y-3">
              <RecordSection
                title="Medailles"
                entries={records.medals}
                valueLabel="med."
                formatNumber={formatNumber}
                getValue={(entry) => entry?.total}
              />
              <RecordSection
                title="Mots par manche"
                entries={records.mostWordsInGame}
                valueLabel="mots"
                formatNumber={formatNumber}
                getValue={(entry) => entry?.wordsCount}
              />
              <RecordSection
                title="Score total"
                entries={records.totalScore}
                valueLabel="pts"
                formatNumber={formatNumber}
                getValue={(entry) => entry?.totalScore}
              />
            </div>
          ) : (
            podium.length ? (
              <RacePodiumFinale
                podium={podium}
                winnerNick={winnerNick}
                formatNumber={formatNumber}
              />
            ) : (
              <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-4 text-center text-sm opacity-70">
                Aucun podium hebdomadaire disponible.
              </div>
            )
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3">{action}</div>
      </div>
    </div>,
    document.body
  );
}
