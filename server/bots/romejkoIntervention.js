export function getRomejkoScheduleDelayMs(roundIntroMs) {
  const introMs = Math.max(0, Number(roundIntroMs) || 0);
  return Math.min(650, Math.max(0, introMs - 650));
}

export function getRomejkoLongestWordSummary(solutions) {
  let length = 0;
  const words = new Set();

  for (const entry of Array.isArray(solutions) ? solutions : []) {
    const word = String(entry?.word || "").trim().toLocaleLowerCase("fr");
    if (!word) continue;
    const wordLength = word.length;
    if (wordLength > length) {
      length = wordLength;
      words.clear();
      words.add(word);
    } else if (wordLength === length) {
      words.add(word);
    }
  }

  return Object.freeze({ count: words.size, length });
}

export function buildRomejkoInterventionText(summary) {
  const count = Math.max(0, Math.trunc(Number(summary?.count) || 0));
  const length = Math.max(0, Math.trunc(Number(summary?.length) || 0));
  if (!count || !length) return "";

  const wordLabel = count === 1 ? "mot" : "mots";
  const letterLabel = length === 1 ? "lettre" : "lettres";
  const longestLabel = count === 1 ? "c'est le plus long" : "ce sont les plus longs";
  return `Il y a ${count} ${wordLabel} de ${length} ${letterLabel} à trouver : ${longestLabel} de la grille.`;
}

export function hasPlayerFoundLongestWordGobble({
  gobbleFlags,
  longestLength,
  longestPossiblePlayers,
  nick,
  words,
}) {
  const playerNick = String(nick || "").trim();
  if (!playerNick) return false;
  if (longestPossiblePlayers?.has?.(playerNick)) return true;
  if (gobbleFlags?.get?.(playerNick)?.len === true) return true;
  const targetLength = Math.max(0, Math.trunc(Number(longestLength) || 0));
  if (!targetLength) return false;
  return Array.from(words || []).some(
    (word) => String(word || "").trim().length === targetLength
  );
}
