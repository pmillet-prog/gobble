// Gate records once per round: multiple tied solutions must not multiply the
// chance of a Gobble. Long words remain possible, with decreasing odds.
export function createBotWordDiscovery(pool, skill, isSpeedRound, rand) {
  const maxLength = pool.reduce((max, entry) => Math.max(max, entry.word.length), 0);
  const maxPoints = pool.reduce((max, entry) => Math.max(max, entry.pts), 0);
  const findsLength = !isSpeedRound && rand() < 0.025 + skill * 0.10;
  const findsScore = !isSpeedRound && rand() < 0.025 + skill * 0.10;
  return (entry) => {
    if (!isSpeedRound && entry.word.length === maxLength && !findsLength) return false;
    if (!isSpeedRound && entry.pts === maxPoints && !findsScore) return false;
    const excess = Math.max(0, entry.word.length - 6);
    return !excess || rand() < Math.pow(0.38 + skill * 0.25, excess);
  };
}
