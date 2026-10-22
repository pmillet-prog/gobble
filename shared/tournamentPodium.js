const MEDALS = Object.freeze(["gold", "silver", "bronze"]);

// The score ranking already includes all tie-breakers. Preserve that order
// within each group; bots only fill places left after the ranked humans.
export function selectTournamentPodium(ranking) {
  const entries = (Array.isArray(ranking) ? ranking : []).filter(entry => entry?.nick);
  return [...entries.filter(entry => !entry.isBot), ...entries.filter(entry => entry.isBot)]
    .slice(0, 3)
    .map((entry, index) => ({ ...entry, podiumRank: index + 1 }));
}

// Visual filler bots never receive an account reward. Medal colour is the
// podium place, independently of the unchanged score-ranking position.
export function getTournamentPodiumMedalAwards(podium) {
  return (Array.isArray(podium) ? podium : []).slice(0, 3)
    .flatMap((entry, index) => entry?.nick && !entry.isBot
      ? [{ nick: entry.nick, type: MEDALS[index], podiumRank: index + 1 }]
      : []);
}
