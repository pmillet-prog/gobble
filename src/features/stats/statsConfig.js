export const STATS_WEEKLY_DISPLAY_LIMIT = 50;
export const STATS_SEASON_TARGET_LIMIT = 200;
export const WEEKLY_BOARDS = Object.freeze([
  { key: "weeklyVocab", label: "Vocabulaire hebdo", subtitle: "Course aux mots uniques" },
  { key: "medals", label: "Medailles", subtitle: "Total hebdo" },
  { key: "mostWordsInGame", label: "Mots par manche", subtitle: "Volume max" },
  { key: "totalScore", label: "Score total", subtitle: "Somme hebdo (cibles = 1000 pts)" },
  { key: "bestWord", label: "Meilleur mot", subtitle: "Score le plus élevé" },
  { key: "longestWord", label: "Mot le plus long", subtitle: "Longest" },
  { key: "bestRoundScore", label: "Score de manche", subtitle: "Total record" },
  { key: "bestSpecial3Score", label: "3 mots", subtitle: "Live hebdo" },
  { key: "bestTimeTargetLong", label: "Temps mot long", subtitle: "Round cible mot long" },
  { key: "bestTimeTargetScore", label: "Temps meilleur mot", subtitle: "Round cible meilleur mot" },
  { key: "mostGobbles", label: "Gobbles", subtitle: "Total hebdo" },
]);

// The tournament finale keeps its existing set of record boards.
export const WEEKLY_STATS_BOARDS = Object.freeze([
  ...WEEKLY_BOARDS.slice(0, 2),
  { key: "top3", label: "Top 3", subtitle: "Part des manches terminées dans le top 3" },
  ...WEEKLY_BOARDS.slice(2),
]);

export const WEEKLY_TOP3_ROUND_TYPES = Object.freeze([
  { key: "normal", label: "Classique" },
  { key: "speed", label: "Jeu rapide" },
  { key: "monstrous", label: "Grille monstrueuse" },
  { key: "self_specials_3_words", label: "3 mots" },
  { key: "fake_twins", label: "Faux jumeaux" },
  { key: "target_long", label: "Mot le plus long" },
  { key: "target_score", label: "Meilleur mot" },
  { key: "ocid", label: "OCID" },
  { key: "bonus_letter", label: "Lettre en or" },
  { key: "massive_boggle", label: "Massive Boggle" },
  { key: "finale", label: "Finale" },
]);
