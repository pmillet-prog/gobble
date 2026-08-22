import React from "react";

import {
  useFeatureFields,
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";
import useLiveRanking from "../../components/results/useLiveRanking.js";

const EMPTY_LIST = Object.freeze([]);
const ROSTER_CHAT_FIELDS = Object.freeze(["blockedInstallIds"]);
const ROSTER_PROGRESS_FIELDS = Object.freeze(["acceptedCount", "score"]);
const ROSTER_LIVE_FIELDS = Object.freeze([
  "livePlayers",
  "liveProvisionalRanking",
]);

function useLivePlayers(disabled = false) {
  const roster = useFeatureRuntime("roster");
  return useFeatureSelector(roster, (state) =>
    disabled ? EMPTY_LIST : state.livePlayers
  );
}

export function useLivePlayerCount() {
  const roster = useFeatureRuntime("roster");
  return useFeatureSelector(roster, (state) => state.livePlayers.length);
}

export function useLiveRankingPresentation({
  authenticatedUserId,
  dailyPlayMode,
  dailyRankingSource = EMPTY_LIST,
  duelStatus,
  installId,
  isDailyPlay = false,
  normalizeUserIdForProfile,
  selfNick,
}) {
  const progress = useFeatureRuntime("progress");
  const { acceptedCount, score } = useFeatureFields(
    progress,
    ROSTER_PROGRESS_FIELDS
  );
  const roster = useFeatureRuntime("roster");
  const { livePlayers, liveProvisionalRanking } = useFeatureFields(
    roster,
    ROSTER_LIVE_FIELDS
  );
  const players = isDailyPlay ? EMPTY_LIST : livePlayers;
  const playerCount = livePlayers.length;
  const provisionalRanking = isDailyPlay
    ? EMPTY_LIST
    : liveProvisionalRanking;
  const liveRankingSource = useLiveRanking(
    authenticatedUserId,
    duelStatus,
    installId,
    normalizeUserIdForProfile,
    players,
    provisionalRanking,
    score,
    selfNick
  );
  const dailyRankingWithSelf = React.useMemo(() => {
    const base = Array.isArray(dailyRankingSource) ? dailyRankingSource : EMPTY_LIST;
    if (!isDailyPlay || !selfNick || !Number.isFinite(score)) return base;
    if (base.some((entry) => entry && !entry.isPalier && entry.nick === selfNick)) {
      return base;
    }
    const selfUserId = normalizeUserIdForProfile(authenticatedUserId);
    const merged = [
      ...base,
      {
        nick: selfNick,
        userId: selfUserId,
        score,
        wordsCount: acceptedCount,
        installId: installId || null,
        team: duelStatus?.team || null,
        isDailyChampion: !!duelStatus?.crowned,
        isWeeklyVocabChampion: false,
        mode: dailyPlayMode,
        isPalier: false,
        playerKey: selfUserId ? `install:${selfUserId}` : "",
      },
    ];
    merged.sort((a, b) => {
      const scoreDiff = (b?.score || 0) - (a?.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const palierDiff = Number(!!a?.isPalier) - Number(!!b?.isPalier);
      if (palierDiff !== 0) return palierDiff;
      return String(a?.nick || "").localeCompare(String(b?.nick || ""));
    });
    return merged;
  }, [
    acceptedCount,
    authenticatedUserId,
    dailyRankingSource,
    dailyPlayMode,
    duelStatus?.crowned,
    duelStatus?.team,
    installId,
    isDailyPlay,
    normalizeUserIdForProfile,
    score,
    selfNick,
  ]);
  const rankingSource = isDailyPlay ? dailyRankingWithSelf : liveRankingSource;
  return {
    livePosition:
      rankingSource.find((entry) => entry?.nick === selfNick)?.rank ?? null,
    playerCount,
    rankingSource,
  };
}

export function useVisibleLivePlayers() {
  const players = useLivePlayers(false);
  const chat = useFeatureRuntime("chat");
  const { blockedInstallIds } = useFeatureFields(chat, ROSTER_CHAT_FIELDS);
  const blockedSet = React.useMemo(
    () => new Set(blockedInstallIds || []),
    [blockedInstallIds]
  );
  return React.useMemo(() => {
    const visible = (players || []).filter(
      (player) => !player?.installId || !blockedSet.has(player.installId)
    );
    return [...visible].sort(
      (a, b) => Number(!!a?.inTraining) - Number(!!b?.inTraining)
    );
  }, [blockedSet, players]);
}

export function useSelfReadyForTournament({ installId, selfNick }) {
  const roster = useFeatureRuntime("roster");
  return useFeatureSelector(roster, (state) =>
    state.livePlayers.some((player) => {
      if (!player?.readyForTournament) return false;
      if (installId && String(player?.installId || "") === String(installId)) {
        return true;
      }
      return selfNick && String(player?.nick || "").trim() === selfNick;
    })
  );
}
