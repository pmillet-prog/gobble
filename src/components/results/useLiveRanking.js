import React from "react";

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
  function buildRanking() {
    const entries = [];
    const seen = new Set();
    const identityByNick = new Map();

    players.forEach((player) => {
      const nick = player?.nick ? String(player.nick).trim() : "";
      if (!nick || identityByNick.has(nick)) return;
      const userId = normalizeUserIdForProfile(player?.userId);
      identityByNick.set(nick, {
        userId,
        installId: player?.installId != null ? String(player.installId) : "",
        playerKey: player?.playerKey
          ? String(player.playerKey)
          : userId
          ? `install:${userId}`
          : "",
        team: player?.team || null,
        isBot: !!player?.isBot,
        afk: !!player?.afk,
        readyForTournament: !!player?.readyForTournament,
        inTraining: !!player?.inTraining,
        trainingMode: player?.trainingMode || null,
        isDailyChampion: !!player?.isDailyChampion,
        weeklyVocabPodiumRank: Number(player?.weeklyVocabPodiumRank) || 0,
        isWeeklyVocabChampion: !!player?.isWeeklyVocabChampion,
      });
    });

    provisionalRanking.forEach((entry) => {
      const identity = identityByNick.get(entry?.nick) || {};
      const userId = normalizeUserIdForProfile(entry?.userId) || identity.userId || null;
      entries.push({
        nick: entry.nick,
        userId,
        installId: entry?.installId != null ? String(entry.installId) : identity.installId || "",
        playerKey: entry?.playerKey
          ? String(entry.playerKey)
          : userId
          ? `install:${userId}`
          : identity.playerKey || "",
        score:
          entry?.inTraining || identity.inTraining
            ? null
            : typeof entry.score === "number"
            ? entry.score
            : null,
        gobbles:
          entry?.inTraining || identity.inTraining
            ? 0
            : Number.isFinite(entry?.gobbles)
            ? Number(entry.gobbles)
            : 0,
        rank:
          entry?.inTraining || identity.inTraining
            ? null
            : typeof entry.rank === "number"
            ? entry.rank
            : null,
        team: entry?.team || identity.team || null,
        isBot: !!entry?.isBot || !!identity.isBot,
        inTraining: !!entry?.inTraining || !!identity.inTraining,
        trainingMode: entry?.trainingMode || identity.trainingMode || null,
        weeklyVocabPodiumRank:
          Number(entry?.weeklyVocabPodiumRank) || Number(identity.weeklyVocabPodiumRank) || 0,
        isWeeklyVocabChampion:
          !!entry.isWeeklyVocabChampion || !!identity.isWeeklyVocabChampion,
        isDailyChampion:
          !!entry.isDailyChampion ||
          !!identity.isDailyChampion ||
          (!!duelStatus?.crowned &&
            ((installId && String(entry?.installId || identity.installId || "") === String(installId)) ||
              (selfNick && entry.nick === selfNick))),
      });
      seen.add(entry.nick);
    });

    players.forEach((player) => {
      if (!player?.nick) return;
      if (seen.has(player.nick)) return;
      const identity = identityByNick.get(player.nick) || {};
      const userId = identity.userId || normalizeUserIdForProfile(player?.userId);
      entries.push({
        nick: player.nick,
        userId,
        installId: identity.installId || (player?.installId != null ? String(player.installId) : ""),
        playerKey: player?.playerKey
          ? String(player.playerKey)
          : userId
          ? `install:${userId}`
          : identity.playerKey || "",
        score:
          player?.inTraining || identity.inTraining
            ? null
            : typeof player.score === "number"
            ? player.score
            : null,
        gobbles:
          player?.inTraining || identity.inTraining
            ? 0
            : Number.isFinite(player?.gobbles)
            ? Number(player.gobbles)
            : 0,
        rank: null,
        team: player?.team || identity.team || null,
        isBot: !!player?.isBot || !!identity.isBot,
        inTraining: !!player?.inTraining || !!identity.inTraining,
        trainingMode: player?.trainingMode || identity.trainingMode || null,
        weeklyVocabPodiumRank:
          Number(player?.weeklyVocabPodiumRank) || Number(identity.weeklyVocabPodiumRank) || 0,
        isWeeklyVocabChampion:
          !!player.isWeeklyVocabChampion || !!identity.isWeeklyVocabChampion,
        isDailyChampion:
          !!player.isDailyChampion ||
          !!identity.isDailyChampion ||
          (!!duelStatus?.crowned &&
            ((installId && String(player?.installId || identity.installId || "") === String(installId)) ||
              (selfNick && player.nick === selfNick))),
      });
      seen.add(player.nick);
    });

    const currentScore = typeof score === "number" ? score : null;
    if (selfNick) {
      const selfEntry = entries.find((entry) => entry.nick === selfNick);
      const selfUserId = normalizeUserIdForProfile(authenticatedUserId);
      if (selfEntry) {
        if (selfUserId && !selfEntry.userId) selfEntry.userId = selfUserId;
        if (installId && !selfEntry.installId) selfEntry.installId = installId;
        if (selfUserId && !selfEntry.playerKey) selfEntry.playerKey = `install:${selfUserId}`;
        if (
          currentScore !== null &&
          (selfEntry.score === null || currentScore > selfEntry.score)
        ) {
          selfEntry.score = currentScore;
        }
      } else {
        entries.push({
          nick: selfNick,
          userId: selfUserId,
          installId: installId || "",
          playerKey: selfUserId ? `install:${selfUserId}` : "",
          score: currentScore,
          gobbles: 0,
          rank: null,
          team: duelStatus?.team || null,
          isBot: false,
          isDailyChampion: !!duelStatus?.crowned,
          isWeeklyVocabChampion: false,
        });
        seen.add(selfNick);
      }
    }

    if (entries.length === 0) {
      const fallbackUserId = normalizeUserIdForProfile(authenticatedUserId);
      entries.push({
        nick: selfNick || "Moi",
        userId: fallbackUserId,
        installId: installId || "",
        playerKey: fallbackUserId ? `install:${fallbackUserId}` : "",
        score: currentScore ?? 0,
        gobbles: 0,
        rank: null,
        isWeeklyVocabChampion: false,
      });
    }

    entries.sort((a, b) => {
      const trainingDiff = Number(!!a?.inTraining) - Number(!!b?.inTraining);
      if (trainingDiff) return trainingDiff;
      const aRank = typeof a.rank === "number" ? a.rank : Infinity;
      const bRank = typeof b.rank === "number" ? b.rank : Infinity;
      if (aRank !== bRank) return aRank - bRank;
      const aScore = typeof a.score === "number" ? a.score : -Infinity;
      const bScore = typeof b.score === "number" ? b.score : -Infinity;
      if (aScore !== bScore) return bScore - aScore;
      return (a.nick || "").localeCompare(b.nick || "");
    });

    return entries.map((entry, idx) => ({
      ...entry,
      rank: entry.rank ?? idx + 1,
    }));
  }

  const liveRankingSource = React.useMemo(
    () => buildRanking(),
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
