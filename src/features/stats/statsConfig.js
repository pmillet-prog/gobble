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
