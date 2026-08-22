import React from "react";

import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import useLiveRanking from "../../components/results/useLiveRanking.js";

const ROSTER_CHAT_FIELDS = Object.freeze(["blockedInstallIds"]);

export function useLiveRosterPresentation({
  authenticatedUserId,
  dailyRankingSource = [],
  duelStatus,
  installId,
  isDailyPlay = false,
  normalizeUserIdForProfile,
  score,
  selfNick,
}) {
  const players = useApplicationSelector((state) => state.realtime.players);
  const provisionalRanking = useApplicationSelector(
    (state) => state.realtime.provisionalRanking
  );
  const chat = useFeatureRuntime("chat");
  const { blockedInstallIds } = useFeatureFields(chat, ROSTER_CHAT_FIELDS);
  const blockedSet = React.useMemo(
    () => new Set(blockedInstallIds || []),
    [blockedInstallIds]
  );
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
  const visiblePlayerList = React.useMemo(() => {
    const visible = (players || []).filter(
      (player) => !player?.installId || !blockedSet.has(player.installId)
    );
    return [...visible].sort(
      (a, b) => Number(!!a?.inTraining) - Number(!!b?.inTraining)
    );
  }, [blockedSet, players]);
  const playersAlphaList = React.useMemo(() => {
    const seen = new Set();
    return visiblePlayerList
      .filter((player) => {
        const nick = String(player?.nick || "").trim();
        if (!nick || seen.has(nick)) return false;
        seen.add(nick);
        return true;
      })
      .map((player) => ({
        ...player,
        installId:
          player?.installId != null ? String(player.installId) : "",
        nick: String(player.nick).trim(),
        userId: normalizeUserIdForProfile(player?.userId),
      }))
      .sort((a, b) => {
        const trainingDiff = Number(!!a?.inTraining) - Number(!!b?.inTraining);
        return (
          trainingDiff ||
          a.nick.localeCompare(b.nick, "fr", { sensitivity: "base" })
        );
      });
  }, [normalizeUserIdForProfile, visiblePlayerList]);
  const rankingSource = isDailyPlay ? dailyRankingSource : liveRankingSource;
  const selfReadyForTournament = players.some((player) => {
    if (!player?.readyForTournament) return false;
    if (installId && String(player?.installId || "") === String(installId)) {
      return true;
    }
    return selfNick && String(player?.nick || "").trim() === selfNick;
  });

  return {
    livePosition:
      rankingSource.find((entry) => entry?.nick === selfNick)?.rank ?? null,
    players,
    playersAlphaList,
    provisionalRanking,
    rankingSource,
    selfReadyForTournament,
    visiblePlayerList,
  };
}
