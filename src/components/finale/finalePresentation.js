import {
  FINALE_MIN_TOTAL_SCORE,
  FINALE_TILE_BONUS_MULTIPLIER,
} from "../../../shared/finaleRules.js";

export function getFinaleTutorialSteps(plan = null) {
  const minWords = Math.max(0, Number(plan?.minWords) || 0);
  const minTotalScore = Math.max(
    0,
    Number(plan?.minTotalScore) || FINALE_MIN_TOTAL_SCORE
  );
  const multiplier = Math.max(
    1,
    Number(plan?.tileBonusMultiplier) || FINALE_TILE_BONUS_MULTIPLIER
  );

  return [
    {
      lead: "La finale se joue comme une manche classique, mais tout peut basculer.",
      bullets: [
        "Les points gagnés au classement du mini-tournoi sont doublés.",
        `L'effet de chaque tuile spéciale est multiplié par ${multiplier} : L2→L4, L3→L6, M2→M4 et M3→M6.`,
        minWords ? `La grille contient au moins ${minWords} mots possibles.` : null,
        minTotalScore
          ? `Son potentiel atteint au moins ${minTotalScore.toLocaleString("fr-FR")} points avec le barème de finale.`
          : null,
      ].filter(Boolean),
      showFinaleBonusDemo: true,
    },
  ];
}

