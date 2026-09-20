export function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number).toLocaleString("fr-FR") : "0";
}
export function formatRank(rank, total) {
  if (!(Number(rank) > 0)) return "Non classé";
  return Number(total) > 0 ? `#${formatNumber(rank)} / ${formatNumber(total)}` : `#${formatNumber(rank)}`;
}
export function formatTargetTime(ms) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0) return "—";
  return `${(Number(ms) / 1000).toFixed(1).replace(".", ",")} s`;
}
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const best = (primary, fallback, key) => positive(primary?.[key]) >= positive(fallback?.[key]) ? primary || fallback : fallback || primary;
export function getProfileHighlights(profile) {
  const lifetime = profile?.lifetime || {};
  const allTime = profile?.weekly?.allTime || {};
  return {
    bestWord: best(lifetime.bestWord, allTime.bestWord, "pts"),
    longestWord: best(lifetime.longestWord, allTime.longestWord, "len"),
    mostWords: best(lifetime.mostWordsInGame, allTime.mostWordsInGame, "wordsCount"),
    bestRound: Math.max(positive(lifetime.bestRoundScore), positive(allTime.bestRoundScore?.pts)),
    bestSpecial3: Math.max(positive(lifetime.bestSpecial3Score), positive(allTime.bestSpecial3Score?.pts)),
    rounds: Math.max(positive(lifetime.roundsPlayed), positive(allTime.roundsPlayed)),
    score: Math.max(positive(lifetime.totalScore), positive(allTime.totalScore)),
    gobbles: Math.max(positive(lifetime.gobbles), positive(allTime.mostGobbles)),
    doubleGobbles: positive(lifetime.doubleGobbles),
  };
}
