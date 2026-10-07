export const MIN_LIVE_PLAYERS = 7;

export function countLiveHumans(players) {
  return Array.from(players.values()).filter(player =>
    !String(player?.token || "").startsWith("bot-") &&
    player?.connected !== false &&
    !player?.standaloneTraining?.sessionId &&
    !player?.trainingPresenceOnly
  ).length;
}

export function selectPresentAnimators({ humanCount, roster }) {
  const slots = Math.max(0, roster.length - Math.max(0, humanCount - 1));
  return [...roster].sort((a, b) =>
    (Number(b.skill) || 0) - (Number(a.skill) || 0) || a.nick.localeCompare(b.nick, "fr")
  ).slice(0, slots);
}
