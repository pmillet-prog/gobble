import { recapAvatarUserId } from "../avatar/weeklyRecapAvatars.js";
import { resolvePlayerProfileTarget } from "../overlays/playerProfileTarget.js";
import { selectTournamentPodium, getTournamentPodiumMedalAwards } from "../../../shared/tournamentPodium.js";

function getRanking(summary) {
  return Array.isArray(summary) ? summary : Array.isArray(summary?.ranking) ? summary.ranking : [];
}

function getPodium(summary) {
  return Array.isArray(summary?.podium) ? summary.podium : selectTournamentPodium(getRanking(summary));
}

export function resolveTournamentPodiumSummary(summary) {
  if (!summary || Array.isArray(summary.podium)) return summary;
  const podium = selectTournamentPodium(getRanking(summary));
  return { ...summary, podium, winnerNick: podium[0]?.nick || null };
}

function samePlayer(left, right) {
  return !!left.isBot === !!right.isBot && (left.userId && right.userId
    ? left.userId === right.userId : left.nick === right.nick);
}

export function getTournamentPodiumEntries(summary, { userId, nick, knownPlayers = [] } = {}) {
  const decorate = (entry, index) => ({ ...entry, userId: recapAvatarUserId(entry) || resolvePlayerProfileTarget(entry, [knownPlayers])?.userId
      || (!entry.isBot && entry.nick === nick ? Number(userId) || null : null),
      rank: Number(entry.pos) || index + 1, score: Number(entry.points ?? entry.score) || 0 });
  const entries = getRanking(summary).map(decorate);
  const players = getPodium(summary).map((entry, index) => {
    const player = decorate(entry, index);
    const ranked = entries.find(candidate => samePlayer(candidate, player));
    return { ...player, scoreRank: ranked?.rank || player.rank, rank: Number(entry.podiumRank) || index + 1 };
  });
  const own = entries.find(entry => !entry.isBot &&
    (userId && entry.userId ? Number(userId) === entry.userId : nick && entry.nick === nick));
  const ownPodium = own && players.find(entry => samePlayer(entry, own));
  return { players, self: own ? { ...own, scoreRank: own.rank, rank: ownPodium?.rank || own.rank,
    userId: own.userId || Number(userId), totalPlayers: entries.length } : null };
}

export function getTournamentPodiumMedals(summary) {
  const podium = getPodium(summary);
  if (!podium.length) return null;
  return Object.fromEntries(getTournamentPodiumMedalAwards(podium).map(({ nick, type }) => [nick, { [type]: 1 }]));
}
