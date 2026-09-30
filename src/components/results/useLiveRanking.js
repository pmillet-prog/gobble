import React from "react";
import { buildLiveRanking } from "./buildLiveRanking.js";

export default function useLiveRanking(
  authenticatedUserId,
  duelStatus,
  installId,
  normalizeUserIdForProfile,
  players,
  provisionalRanking,
  score,
  selfNick,
) {
  const liveRankingSource = React.useMemo(
    () => buildLiveRanking({
      authenticatedUserId,
      duelStatus,
      installId,
      normalizeUserIdForProfile,
      players,
      provisionalRanking,
      score,
      selfNick,
    }),
    [
      provisionalRanking,
      players,
      score,
      selfNick,
      duelStatus?.team,
      duelStatus?.crowned,
      authenticatedUserId,
      installId,
    ]
  );

  return liveRankingSource;
}
