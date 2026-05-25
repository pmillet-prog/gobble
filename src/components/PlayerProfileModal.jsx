import React from "react";
import { createPortal } from "react-dom";
import { getVocabLevelMeta, getVocabRankImageUrl } from "../vocabRanks.js";

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return Math.trunc(num).toLocaleString("fr-FR");
}

function formatRank(rank, total) {
  const safeRank = Number(rank);
  if (!Number.isFinite(safeRank) || safeRank <= 0) return "Non classe";
  const safeTotal = Number(total);
  return Number.isFinite(safeTotal) && safeTotal > 0
    ? `#${Math.trunc(safeRank)} / ${Math.trunc(safeTotal)}`
    : `#${Math.trunc(safeRank)}`;
}

function formatTargetTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "-";
  return `${(value / 1000).toFixed(1).replace(".", ",")}s`;
}

function finitePositive(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function pickBestScoredRecord(primary, fallback) {
  const primaryScore = finitePositive(primary?.pts);
  const fallbackScore = finitePositive(fallback?.pts);
  return primaryScore >= fallbackScore ? primary || fallback || null : fallback || primary || null;
}

function pickLongestRecord(primary, fallback) {
  const primaryLength = finitePositive(primary?.len);
  const fallbackLength = finitePositive(fallback?.len);
  return primaryLength >= fallbackLength ? primary || fallback || null : fallback || primary || null;
}

function pickMostWordsRecord(primary, fallback) {
  const primaryCount = finitePositive(primary?.wordsCount);
  const fallbackCount = finitePositive(fallback?.wordsCount);
  return primaryCount >= fallbackCount ? primary || fallback || null : fallback || primary || null;
}

function StatCard({ label, value, detail = "" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wide opacity-55">{label}</div>
      <div className="mt-1 text-lg font-black tabular-nums leading-tight">{value}</div>
      {detail ? <div className="mt-0.5 truncate text-[11px] opacity-70">{detail}</div> : null}
    </div>
  );
}

function VocabRankCard({ vocabulary = {} }) {
  const count = Number(vocabulary.count) || 0;
  const level = getVocabLevelMeta(count);
  const imageSrc = getVocabRankImageUrl(level);
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wide opacity-55">
        Vocabulaire
      </div>
      <div className="mt-2 flex items-center gap-2">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={level?.label || "Rang vocabulaire"}
            className="h-12 w-12 shrink-0 object-contain"
            draggable={false}
          />
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-black leading-tight">
            {level?.label || "Niveau"}
          </div>
          <div className="text-lg font-black tabular-nums leading-tight">
            {formatNumber(count)}
          </div>
          <div className="truncate text-[11px] opacity-70">
            {formatRank(vocabulary.rank, vocabulary.totalPlayers)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordLine({ label, value, detail = "" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/25 px-3 py-2 text-sm">
      <span className="min-w-0 font-semibold opacity-75">{label}</span>
      <span className="min-w-0 text-right font-black">
        {value}
        {detail ? <span className="ml-1 font-semibold opacity-65">{detail}</span> : null}
      </span>
    </div>
  );
}

const HEAD_TO_HEAD_TYPES = [
  ["normal", "Normales"],
  ["target", "Cibles"],
  ["special3", "3 mots"],
  ["bonusLetter", "Lettre en or"],
  ["massiveBoggle", "Massive Boggle"],
  ["fakeTwins", "Faux jumeaux"],
];

export default function PlayerProfileModal({
  open = false,
  darkMode = false,
  loading = false,
  error = "",
  profile = null,
  onClose = null,
}) {
  React.useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const lifetime = profile?.lifetime || {};
  const weeklyAllTime = profile?.weekly?.allTime || {};
  const currentWeek = profile?.weekly?.currentWeek || {};
  const trophies = profile?.trophies || null;
  const vocabulary = profile?.vocabulary || {};
  const duel = profile?.duel || {};
  const bestWord = pickBestScoredRecord(lifetime.bestWord, weeklyAllTime.bestWord);
  const longestWord = pickLongestRecord(lifetime.longestWord, weeklyAllTime.longestWord);
  const mostWordsInGame = pickMostWordsRecord(
    lifetime.mostWordsInGame,
    weeklyAllTime.mostWordsInGame
  );
  const bestRoundScore = Math.max(
    finitePositive(lifetime.bestRoundScore),
    finitePositive(weeklyAllTime.bestRoundScore?.pts)
  );
  const bestSpecial3Score = Math.max(
    finitePositive(lifetime.bestSpecial3Score),
    finitePositive(weeklyAllTime.bestSpecial3Score?.pts)
  );
  const roundsPlayed = Math.max(
    finitePositive(lifetime.roundsPlayed),
    finitePositive(weeklyAllTime.roundsPlayed)
  );
  const totalScore = Math.max(
    finitePositive(lifetime.totalScore),
    finitePositive(weeklyAllTime.totalScore)
  );
  const gobbles = Math.max(
    finitePositive(lifetime.gobbles),
    finitePositive(weeklyAllTime.mostGobbles)
  );
  const headToHead = profile?.headToHead || null;
  const headToHeadTotal = headToHead?.total || {};
  const hasHeadToHead = Number(headToHeadTotal.roundsPlayed) > 0;
  const panelClass = darkMode
    ? "border-slate-600 bg-slate-950 text-slate-50"
    : "border-slate-200 bg-slate-950 text-slate-50";

  return createPortal(
    <div className="fixed inset-0 z-[25000] flex items-center justify-center bg-black/60 px-3 py-5">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Fermer le profil"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profil joueur"
        className={`relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelClass}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] opacity-55">
              Profil joueur
            </div>
            <div className="mt-1 truncate text-2xl font-black leading-tight">
              {profile?.nick || "Joueur"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-75">
              {trophies ? <span>{trophies.league}</span> : null}
              {trophies ? <span>{formatNumber(trophies.trophies)} trophées</span> : null}
              {duel.team ? <span>Equipe {duel.team === "red" ? "rouge" : "bleue"}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="h-8 w-8 shrink-0 rounded-full border border-white/15 bg-white/10 text-sm font-black"
            aria-label="Fermer"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="py-10 text-center text-sm font-semibold opacity-70">Chargement...</div>
          ) : error ? (
            <div className="py-10 text-center text-sm font-semibold text-red-200">{error}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Parties" value={formatNumber(roundsPlayed)} />
                <StatCard label="Score total" value={formatNumber(totalScore)} />
                <VocabRankCard vocabulary={vocabulary} />
                <StatCard label="Gobbles" value={formatNumber(gobbles)} detail={`${formatNumber(lifetime.doubleGobbles)} doubles`} />
              </div>

              {headToHead ? (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wide opacity-55">
                    Face-a-face live
                  </div>
                  {hasHeadToHead ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <StatCard
                          label="Tu l'as battu"
                          value={formatNumber(headToHeadTotal.viewerWins)}
                        />
                        <StatCard
                          label={`${profile?.nick || "Joueur"} t'a battu`}
                          value={formatNumber(headToHeadTotal.targetWins)}
                        />
                        <StatCard label="Egalites" value={formatNumber(headToHeadTotal.draws)} />
                      </div>
                      <div className="space-y-1">
                        {HEAD_TO_HEAD_TYPES.map(([type, label]) => {
                          const row = headToHead.byType?.[type] || {};
                          const rounds = Number(row.roundsPlayed) || 0;
                          return (
                            <div
                              key={type}
                              className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/25 px-3 py-2 text-xs"
                            >
                              <span className="font-black">{label}</span>
                              <span className="tabular-nums opacity-80">
                                {rounds > 0
                                  ? `${formatNumber(row.viewerWins)} - ${formatNumber(row.targetWins)}`
                                  : "-"}
                                {Number(row.draws) > 0
                                  ? ` (${formatNumber(row.draws)} nul${Number(row.draws) > 1 ? "s" : ""})`
                                  : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg bg-slate-950/25 px-3 py-3 text-sm font-semibold opacity-70">
                      Aucune manche live jouee l'un contre l'autre avec un score positif.
                    </div>
                  )}
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-wide opacity-55">Records</div>
                <RecordLine
                  label="Meilleur score"
                  value={`${formatNumber(bestRoundScore)} pts`}
                />
                <RecordLine
                  label="Max mots / manche"
                  value={
                    mostWordsInGame?.wordsCount
                      ? `${formatNumber(mostWordsInGame.wordsCount)} mots`
                      : "-"
                  }
                />
                <RecordLine
                  label="Meilleur mot"
                  value={bestWord?.word || "-"}
                  detail={bestWord?.pts ? `${formatNumber(bestWord.pts)} pts` : ""}
                />
                <RecordLine
                  label="Mot le plus long"
                  value={longestWord?.word || "-"}
                  detail={longestWord?.len ? `${formatNumber(longestWord.len)} lettres` : ""}
                />
                <RecordLine
                  label="Meilleur 3 mots"
                  value={bestSpecial3Score ? `${formatNumber(bestSpecial3Score)} pts` : "-"}
                />
                <RecordLine
                  label="Cible longueur"
                  value={formatTargetTime(weeklyAllTime.bestTimeTargetLong?.ms)}
                  detail={weeklyAllTime.bestTimeTargetLong?.word || ""}
                />
                <RecordLine
                  label="Cible score"
                  value={formatTargetTime(weeklyAllTime.bestTimeTargetScore?.ms)}
                  detail={weeklyAllTime.bestTimeTargetScore?.word || ""}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-3">
                  <div className="text-xs font-black uppercase tracking-wide opacity-55">
                    Duel semaine
                  </div>
                  <div className="mt-2 text-2xl font-black tabular-nums">
                    {formatNumber(duel.points)} pts
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    {duel.rank ? `Rang #${duel.rank}` : "Pas encore classe cette semaine"}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-3">
                  <div className="text-xs font-black uppercase tracking-wide opacity-55">
                    Semaine en cours
                  </div>
                  <div className="mt-2 text-2xl font-black tabular-nums">
                    {formatNumber(currentWeek.totalScore?.totalScore || 0)} pts
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    {formatNumber(currentWeek.totalScore?.roundsPlayed || 0)} manches
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
