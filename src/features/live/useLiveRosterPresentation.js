import React from "react";

import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import useLiveRanking from "../../components/results/useLiveRanking.js";

const EMPTY_LIST = Object.freeze([]);
const ROSTER_CHAT_FIELDS = Object.freeze(["blockedInstallIds"]);

function useLivePlayers(disabled = false) {
  return useApplicationSelector((state) =>
    disabled ? EMPTY_LIST : state.realtime.players
  );
}

export function useLivePlayerCount() {
  return useApplicationSelector((state) => state.realtime.players.length);
}

export function useLiveRankingPresentation({
  authenticatedUserId,
  dailyRankingSource = EMPTY_LIST,
  duelStatus,
  installId,
  isDailyPlay = false,
  normalizeUserIdForProfile,
  score,
  selfNick,
}) {
  const players = useLivePlayers(isDailyPlay);
  const playerCount = useLivePlayerCount();
  const provisionalRanking = useApplicationSelector((state) =>
    isDailyPlay ? EMPTY_LIST : state.realtime.provisionalRanking
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
  const rankingSource = isDailyPlay ? dailyRankingSource : liveRankingSource;
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
  return useApplicationSelector((state) =>
    state.realtime.players.some((player) => {
      if (!player?.readyForTournament) return false;
      if (installId && String(player?.installId || "") === String(installId)) {
        return true;
      }
      return selfNick && String(player?.nick || "").trim() === selfNick;
    })
  );
}
