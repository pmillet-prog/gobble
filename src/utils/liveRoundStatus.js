const COMPACT_ROUND_LABELS = Object.freeze({
  normal: "Classique",
  speed: "Jeu rapide",
  monstrous: "Grille monstrueuse",
  monstrous_grid: "Grille monstrueuse",
  self_specials_3_words: "3 mots",
  fake_twins: "Faux jumeaux",
  fake_twins_grid: "Faux jumeaux",
  target_long: "MLPL",
  target_score: "Meilleur mot",
  ocid: "OCID",
  bonus_letter: "Lettre en or",
  massive_boggle: "Massive Boggle",
});

export function getCompactLiveRoundLabel(roundType, fallbackLabel = "") {
  const type = String(roundType || "").trim().toLowerCase();
  if (type && COMPACT_ROUND_LABELS[type]) return COMPACT_ROUND_LABELS[type];
  const fallback = String(fallbackLabel || "").trim();
  return fallback || (type ? "Manche spéciale" : "");
}

export function formatApproximateMinutes(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "moins d’une minute";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} min`;
}
