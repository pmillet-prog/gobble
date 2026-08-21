import React from "react";
import { FAKE_TWINS_TYPE } from "../gameLogic.js";
import { isRareBonusEnabledForSpecial } from "../../game/specialRoundTypes.js";
import { formatNumber } from "../../utils/numbers.js";

export function formatTargetTime(ms) {
  if (!Number.isFinite(ms)) return "PAS TROUVÉ";
  const seconds = Math.max(0, ms) / 1000;
  return `${seconds.toFixed(1).replace(".", ",")}s`;
}

function renderRareBonusInline(points) {
  const value = Math.max(0, Math.trunc(Number(points) || 0));
  if (value <= 0) return null;
  return (
    <span className="rare-bonus-inline text-amber-700 dark:text-amber-300 font-black tabular-nums">
      ({formatNumber(value)})
    </span>
  );
}

function renderFakeTwinsCompletionBonusInline(points) {
  const value = Math.max(0, Math.trunc(Number(points) || 0));
  if (value <= 0) return null;
  return (
    <span className="text-blue-600 dark:text-blue-300 font-black tabular-nums">
      ({formatNumber(value)})
    </span>
  );
}

export default function useFinalRanking({
  finalResults,
  isTargetRound,
  specialRound,
  targetSummary,
  tournamentRoundPoints,
}) {
  return React.useMemo(
    () => (finalResults.length
    ? [...finalResults]
        .map((entry) => {
          const roundAward = tournamentRoundPoints?.[entry.nick];
          const roundPoints =
            typeof roundAward?.points === "number" ? roundAward.points : null;
          const roundGobbles =
            typeof roundAward?.gobbles === "number" ? roundAward.gobbles : 0;
          const rareBonusInline = renderRareBonusInline(entry?.rareBonusPoints);
          const fakeTwinsCompletionBonusInline =
            specialRound?.type === FAKE_TWINS_TYPE
              ? renderFakeTwinsCompletionBonusInline(entry?.fakeTwinsCompletionBonus)
              : null;
          const bonusInline = rareBonusInline || fakeTwinsCompletionBonusInline
            ? (
              <span className="inline-flex items-baseline gap-1">
                {rareBonusInline}
                {fakeTwinsCompletionBonusInline}
              </span>
            )
            : null;
          if (targetSummary?.ocid) {
            const detail = entry?.ocid || {};
            const parts = [];
            const proposal = String(detail.proposal || "").trim().toUpperCase();
            if (proposal) {
              const targetTimeMs = Number.isFinite(detail.targetFoundMs)
                ? detail.targetFoundMs
                : Number.isFinite(entry.targetFoundMs)
                ? entry.targetFoundMs
                : null;
              const proposalLabel = detail.exactTarget
                ? `mot cible tracé${
                    Number.isFinite(targetTimeMs) ? ` en ${formatTargetTime(targetTimeMs)}` : ""
                  }`
                : detail.validProposal
                ? "mot valide"
                : "mot invalide";
              parts.push(
                <React.Fragment key={`ocid-proposal-${entry.nick || proposal}`}>
                  <span className="font-black text-amber-500 dark:text-amber-200">
                    {proposal}
                  </span>{" "}
                  · {proposalLabel}
                </React.Fragment>
              );
            } else if (detail.exactTarget) {
              const targetTimeMs = Number.isFinite(detail.targetFoundMs)
                ? detail.targetFoundMs
                : Number.isFinite(entry.targetFoundMs)
                ? entry.targetFoundMs
                : null;
              parts.push(
                Number.isFinite(targetTimeMs)
                  ? `mot cible tracé en ${formatTargetTime(targetTimeMs)}`
                  : "mot cible tracé"
              );
            } else if (detail.validProposal) {
              parts.push("mot valide");
            }
            if (detail.correctVote) parts.push("bon vote");
            if (Number(detail.bluffVotes) > 0) {
              const voters = Array.isArray(detail.votersForProposal)
                ? detail.votersForProposal.filter(Boolean)
                : [];
              const voterLabel = voters.length
                ? ` (${voters.slice(0, 4).join(", ")}${voters.length > 4 ? "..." : ""})`
                : "";
              parts.push(
                `${Number(detail.bluffVotes)} vote${Number(detail.bluffVotes) > 1 ? "s" : ""} bluff${voterLabel}`
              );
            }
            return {
              ...entry,
              wordsCount: null,
              roundPoints,
              roundGobbles,
              rightLabel: parts.length ? (
                <>
                  {entry.score || 0} pts
                  {parts.map((part, idx) => (
                    <React.Fragment key={`ocid-part-${entry.nick || "row"}-${idx}`}>
                      {" · "}
                      {part}
                    </React.Fragment>
                  ))}
                </>
              ) : (
                `${entry.score || 0} pts`
              ),
            };
          }
          if (isTargetRound && !targetSummary?.ocid) {
            const timeMs = Number.isFinite(entry.targetFoundMs) ? entry.targetFoundMs : null;
            return {
              ...entry,
              wordsCount: null,
              roundPoints,
              roundGobbles,
              rightLabel: Number.isFinite(timeMs) ? formatTargetTime(timeMs) : "PAS TROUVÉ",
            };
          }
          return {
            ...entry,
            wordsCount: Array.isArray(entry.words) ? entry.words.length : null,
            roundPoints,
            roundGobbles,
            rightLabel:
              specialRound?.type === FAKE_TWINS_TYPE &&
              Number.isFinite(entry.fakeTwinWordsFound) &&
              Number.isFinite(entry.fakeTwinWordsTotal)
                ? (
                  <>
                    {Array.isArray(entry.words) ? entry.words.length : 0} mots ·{" "}
                    2L {entry.fakeTwinWordsFound}/{entry.fakeTwinWordsTotal} ·{" "}
                    {bonusInline ? <>{bonusInline} </> : null}
                    {entry.score || 0} pts
                  </>
                )
                : isRareBonusEnabledForSpecial(specialRound) && Number(entry?.rareBonusPoints) > 0
                ? (
                  <>
                    {Array.isArray(entry.words) ? entry.words.length : 0} mots ·{" "}
                    {bonusInline} {entry.score || 0} pts
                  </>
                )
                : undefined,
          };
        })
        .sort((a, b) => {
          if (targetSummary?.ocid) {
            const scoreDiff = (b.score || 0) - (a.score || 0);
            if (scoreDiff !== 0) return scoreDiff;
            const aFound = Number.isFinite(a.targetFoundAt);
            const bFound = Number.isFinite(b.targetFoundAt);
            if (aFound && bFound) {
              const d = a.targetFoundAt - b.targetFoundAt;
              if (d !== 0) return d;
            } else if (aFound) {
              return -1;
            } else if (bFound) {
              return 1;
            }
            return (a.nick || "").localeCompare(b.nick || "");
          }
          if (!isTargetRound) return (b.score || 0) - (a.score || 0);
          const aFound = Number.isFinite(a.targetFoundAt);
          const bFound = Number.isFinite(b.targetFoundAt);
          if (aFound && bFound) {
            const d = a.targetFoundAt - b.targetFoundAt;
            if (d !== 0) return d;
            return (a.nick || "").localeCompare(b.nick || "");
          }
          if (aFound) return -1;
          if (bFound) return 1;
          return (a.nick || "").localeCompare(b.nick || "");
        })
    : []),
    [finalResults, isTargetRound, specialRound, targetSummary, tournamentRoundPoints]
  );
}
