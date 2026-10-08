export const STATS_CATEGORIES = Object.freeze([
  { key: "vocabulary", label: "Vocabulaire" },
  { key: "rounds", label: "Manches" },
  { key: "words", label: "Mots" },
  { key: "presenters", label: "Présentateurs" },
]);

const board = (key, label, description, navLabel = label) => ({ key, label, description, navLabel });

export const STATS_PAGES = Object.freeze({
  weekly: {
    vocabulary: [board("weeklyVocab", "Vocabulaire de la semaine", "La course aux mots uniques trouvés cette semaine.")],
    rounds: [
      board("bestSpecial3Score", "3 mots", "Le meilleur score réalisé dans une manche à 3 mots."),
      board("bestTimeTargetLong", "Cible · mot le plus long", "Le temps le plus court pour trouver le mot cible.", "Cible · mot long"),
      board("bestTimeTargetScore", "Cible · meilleur mot", "Le temps le plus court pour trouver le mot cible."),
      board("totalScore", "Score total", "Les points cumulés cette semaine. Une cible trouvée vaut 1 000 points."),
      board("top3", "Présence dans le top 3", "La part des manches terminées parmi les trois premiers.", "Top 3"),
      board("bestRoundScore", "Score de manche", "Le meilleur score réalisé en une seule manche."),
      board("medals", "Médailles", "Toutes les médailles remportées cette semaine."),
    ],
    words: [
      board("longestWord", "Mot le plus long", "Le mot trouvé avec le plus de lettres."),
      board("bestWord", "Meilleur mot", "Le mot trouvé rapportant le plus de points."),
      board("mostWordsInGame", "Volume de mots", "Le plus grand nombre de mots trouvés dans une manche."),
      board("mostGobbles", "Gobbles", "Les gobbles cumulés cette semaine."),
    ],
    presenters: [
      board("qpugAnswers", "Questions pour un Gobble", "Les bonnes réponses cumulées cette semaine avec Julien Lechéper.", "QPUG"),
      board("targetQuizPoints", "Qui veut gagner des Gobblars", "Le cumul des bonus et malus de la semaine. Assommer FouKro annule les points du mini-jeu en cours.", "Gobblars"),
      board("presenterHits", "Tête à claques", "Les présentateurs les plus frappés, tous joueurs et salons réunis."),
    ],
  },
  season: {
    vocabulary: [
      board("vocab", "Vocabulaire cumulé", "Tous les mots uniques trouvés depuis vos débuts."),
      board("vocab_personal", "Ma progression", "Vos paliers de vocabulaire et vos récompenses."),
    ],
    words: [
      board("gobbles", "Gobbles cumulés", "Le nombre total de gobbles, comme dans les profils.", "Gobbles"),
      board("doubleGobbles", "Double gobbles cumulés", "Le nombre total de double gobbles, comme dans les profils.", "Double gobbles"),
    ],
    presenters: [
      board("qpugAnswers", "Questions pour un Gobble", "Toutes les bonnes réponses cumulées avec Julien Lechéper.", "QPUG"),
      board("targetQuizPoints", "Qui veut gagner des Gobblars", "La balance totale de points, bonus et malus compris.", "Gobblars"),
    ],
  },
});

export function getStatsNavigation({ tab, category, boardKey } = {}) {
  const period = tab === "season" ? "season" : "weekly";
  const pages = STATS_PAGES[period];
  const selectedCategory = pages[category] ? category : "vocabulary";
  const boards = pages[selectedCategory];
  return {
    tab: period,
    category: selectedCategory,
    categories: STATS_CATEGORIES.filter(({ key }) => pages[key]),
    boards,
    board: boards.find(({ key }) => key === boardKey) || boards[0],
  };
}

export function changeStatsPeriod(current, tab) {
  const equivalent = {
    weeklyVocab: "vocab", vocab: "weeklyVocab", vocab_personal: "weeklyVocab",
    mostGobbles: "gobbles", gobbles: "mostGobbles", doubleGobbles: "mostGobbles",
  };
  const next = getStatsNavigation({ ...current, tab, boardKey: equivalent[current.boardKey] || current.boardKey });
  return { tab: next.tab, category: next.category, boardKey: next.board.key };
}

export function getStatsPeriodLabel(weekStartTs) {
  if (!Number.isFinite(weekStartTs)) return "Cette semaine · remise à zéro le lundi à minuit";
  const format = (ts) => new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", timeZone: "Europe/Paris",
  });
  return `Du ${format(weekStartTs)} au ${format(weekStartTs + 6 * 86400000)} · heure de Paris`;
}
