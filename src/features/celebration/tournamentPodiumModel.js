import { recapAvatarUserId } from "../avatar/weeklyRecapAvatars.js";
import { resolvePlayerProfileTarget } from "../overlays/playerProfileTarget.js";

export function getTournamentPodiumEntries(ranking, { userId, nick, knownPlayers = [] } = {}) {
  const entries = (ranking || []).filter(entry => Number(entry.points ?? entry.score) > 0)
    .map((entry, index) => ({ ...entry, userId: recapAvatarUserId(entry) || resolvePlayerProfileTarget(entry, [knownPlayers])?.userId
      || (!entry.isBot && entry.nick === nick ? Number(userId) || null : null),
      rank: index + 1, score: Number(entry.points ?? entry.score) || 0 }));
  const own = entries.find(entry => !entry.isBot &&
    (userId && entry.userId ? Number(userId) === entry.userId : nick && entry.nick === nick));
  return { players: entries.slice(0, 3), self: own ? { ...own, userId: own.userId || Number(userId), totalPlayers: entries.length } : null };
}
