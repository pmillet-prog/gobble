import { buildLiveRanking } from "../../components/results/buildLiveRanking.js";

export function capturePlayersOverlaySnapshot({
  roster,
  progress,
  rankingConfig,
  gobbleAwards,
  ranking,
}) {
  const { livePlayers, liveProvisionalRanking } = roster.store.getState();
  const playersByNick = new Map(livePlayers.map((player) => [player?.nick, player]));
  const source = Array.isArray(ranking)
    ? ranking
    : buildLiveRanking({
        ...rankingConfig,
        players: livePlayers,
        provisionalRanking: liveProvisionalRanking,
        score: progress.store.getState().score,
      });
  const seen = new Set();
  const snapshot = [];

  source.forEach((entry, index) => {
    const nick = entry?.nick ? String(entry.nick) : "";
    if (!nick || entry?.isPalier || seen.has(nick)) return;
    seen.add(nick);
    const player = playersByNick.get(nick);
    const awards = gobbleAwards?.get?.(nick);
    const inTraining = !!entry?.inTraining;
    const userId = rankingConfig.normalizeUserIdForProfile(entry?.userId);
    snapshot.push({
      nick,
      userId,
      installId: entry?.installId != null ? String(entry.installId) : "",
      playerKey: entry?.playerKey
        ? String(entry.playerKey)
        : userId ? `install:${userId}` : "",
      team: entry?.team || null,
      isBot: !!entry?.isBot,
      afk: !!(entry?.afk ?? player?.afk),
      deviceKind: entry?.deviceKind ?? player?.deviceKind ?? null,
      readyForTournament: !!(entry?.readyForTournament ?? player?.readyForTournament),
      inTraining,
      trainingMode: entry?.trainingMode || null,
      isDailyChampion: !!entry?.isDailyChampion,
      weeklyVocabPodiumRank: Number(entry?.weeklyVocabPodiumRank) || 0,
      isWeeklyVocabChampion: !!entry?.isWeeklyVocabChampion,
      rank: Number.isFinite(entry?.rank) ? entry.rank : index + 1,
      score: typeof entry?.score === "number" ? entry.score : null,
      gobbleAwardCount: inTraining ? 0 : Math.max(
        Number.isFinite(entry?.gobbles) ? entry.gobbles : 0,
        (awards?.bestWord ? 1 : 0) + (awards?.longestWord ? 1 : 0)
      ),
      lepersBonus: inTraining ? 0 : Math.max(0, Number(entry?.lepersBonus) || 0),
    });
  });
  return snapshot.sort((a, b) => a.rank - b.rank);
}
