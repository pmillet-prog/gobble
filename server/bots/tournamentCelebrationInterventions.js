function cleanLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatFrenchList(values) {
  const labels = Array.from(new Set((Array.isArray(values) ? values : []).map(cleanLabel).filter(Boolean)));
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

function addFinder(entry, nick) {
  const cleanNick = cleanLabel(nick);
  if (!cleanNick) return;
  if (!Array.isArray(entry.finders)) entry.finders = [];
  if (!entry.finders.includes(cleanNick)) entry.finders.push(cleanNick);
}

export function createTournamentRecords() {
  return {
    mostWords: { count: 0, nick: null, round: null },
    bestWord: { pts: 0, nick: null, word: null, round: null },
    longestWord: { len: 0, nick: null, word: null, round: null },
    bestWordBeforeFinalRound: { pts: 0, nick: null, word: null, round: null },
    longestHumanWords: { len: 0, words: [] },
  };
}

export function recordTournamentWordAchievement(
  records,
  {
    isBot = false,
    length = 0,
    nick = "",
    points = 0,
    round = 0,
    totalRounds = 5,
    word = "",
  } = {}
) {
  if (!records || typeof records !== "object") return false;
  const cleanNick = cleanLabel(nick);
  const cleanWord = cleanLabel(word).toLocaleUpperCase("fr");
  const safeLength = Math.max(0, Math.trunc(Number(length) || cleanWord.length || 0));
  const safePoints = Math.max(0, Math.trunc(Number(points) || 0));
  const safeRound = Math.max(0, Math.trunc(Number(round) || 0));
  const safeTotalRounds = Math.max(1, Math.trunc(Number(totalRounds) || 5));
  if (!cleanNick || !cleanWord || !safeLength) return false;

  if (safePoints > (Number(records.bestWord?.pts) || 0)) {
    records.bestWord = {
      pts: safePoints,
      nick: cleanNick,
      word: cleanWord,
      round: safeRound,
    };
  }
  if (safeLength > (Number(records.longestWord?.len) || 0)) {
    records.longestWord = {
      len: safeLength,
      nick: cleanNick,
      word: cleanWord,
      round: safeRound,
    };
  }

  if (
    safeRound > 0 &&
    safeRound < safeTotalRounds &&
    safePoints > (Number(records.bestWordBeforeFinalRound?.pts) || 0)
  ) {
    records.bestWordBeforeFinalRound = {
      pts: safePoints,
      nick: cleanNick,
      word: cleanWord,
      round: safeRound,
    };
  }

  if (isBot) return true;
  const longest = records.longestHumanWords || { len: 0, words: [] };
  if (safeLength > (Number(longest.len) || 0)) {
    records.longestHumanWords = {
      len: safeLength,
      words: [{ word: cleanWord, round: safeRound, finders: [cleanNick] }],
    };
    return true;
  }
  if (safeLength !== (Number(longest.len) || 0)) return true;
  if (!Array.isArray(longest.words)) longest.words = [];
  let wordEntry = longest.words.find((entry) => cleanLabel(entry?.word) === cleanWord);
  if (!wordEntry) {
    wordEntry = { word: cleanWord, round: safeRound, finders: [] };
    longest.words.push(wordEntry);
  }
  addFinder(wordEntry, cleanNick);
  return true;
}

function getLepersChampions(totals) {
  const entries = totals instanceof Map ? Array.from(totals.entries()) : Object.entries(totals || {});
  return entries
    .filter(([, value]) => Number(value?.lepersBonus) > 0)
    .map(([nick]) => cleanLabel(nick))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "fr"));
}

function buildLongestWordLine(record) {
  const length = Math.max(0, Math.trunc(Number(record?.len) || 0));
  const words = (Array.isArray(record?.words) ? record.words : [])
    .map((entry) => ({
      word: cleanLabel(entry?.word).toLocaleUpperCase("fr"),
      finders: Array.from(new Set((entry?.finders || []).map(cleanLabel).filter(Boolean))),
    }))
    .filter((entry) => entry.word && entry.finders.length);
  if (!length || !words.length) return null;
  if (words.length === 1) {
    const entry = words[0];
    return {
      botKey: "statistician",
      text: `Pendant ce mini-tournoi, le plus long mot trouvé par les joueurs est « ${entry.word} » (${length} lettres), trouvé par ${formatFrenchList(entry.finders)}.`,
      highlights: [entry.word, ...entry.finders],
    };
  }
  const wordDetails = words.map(
    (entry) => `« ${entry.word} » (${formatFrenchList(entry.finders)})`
  );
  return {
    botKey: "statistician",
    text: `Pendant ce mini-tournoi, les plus longs mots trouvés par les joueurs font ${length} lettres : ${formatFrenchList(wordDetails)}.`,
    highlights: words.flatMap((entry) => [entry.word, ...entry.finders]),
  };
}

function buildLepersChampionsLine(totals) {
  const champions = getLepersChampions(totals);
  if (!champions.length) return null;
  return {
    botKey: "culture",
    text:
      champions.length === 1
        ? `Nous avons un champion cette semaine : ${champions[0]} !`
        : `Nous avons des champions cette semaine : ${formatFrenchList(champions)} !`,
    highlights: champions,
  };
}

function buildBestWordLine(record) {
  const word = cleanLabel(record?.word).toLocaleUpperCase("fr");
  const points = Math.max(0, Math.trunc(Number(record?.pts) || 0));
  if (!word || !points) return null;
  return {
    botKey: "coach",
    text: `Hors cinquième manche, le mot valant le plus de points pendant ce mini-tournoi est « ${word} » : ${points} points.`,
    highlights: [word, `${points} points`],
  };
}

export function buildTournamentCelebrationPresenterLines({ records, totals } = {}) {
  return [
    buildLongestWordLine(records?.longestHumanWords),
    buildLepersChampionsLine(totals),
    buildBestWordLine(records?.bestWordBeforeFinalRound),
  ].filter(Boolean);
}
