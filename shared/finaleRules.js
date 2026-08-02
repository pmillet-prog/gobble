export const FINALE_TYPE = "finale";
export const FINALE_TILE_BONUS_MULTIPLIER = 2;
export const FINALE_MIN_WORDS_FACTOR = 1.5;
export const FINALE_MIN_TOTAL_SCORE = 12_000;

export const FINALE_DESCRIPTION =
  "Points du mini-tournoi doublés, tuiles spéciales doublées : L2 devient L4, L3 devient L6, M2 devient M4 et M3 devient M6.";

const TILE_BONUS_FACTORS = Object.freeze({
  L2: 2,
  L3: 3,
  M2: 2,
  M3: 3,
});

export function getFinaleMinWords(baseMinWords) {
  const safeBase = Math.max(0, Number(baseMinWords) || 0);
  return Math.ceil(safeBase * FINALE_MIN_WORDS_FACTOR);
}

export function getTileBonusFactor(bonus, special = null) {
  const baseFactor = TILE_BONUS_FACTORS[bonus] || 1;
  if (baseFactor === 1) return 1;
  const configuredMultiplier = Number(special?.tileBonusMultiplier);
  const bonusMultiplier =
    Number.isFinite(configuredMultiplier) && configuredMultiplier > 0
      ? configuredMultiplier
      : 1;
  return baseFactor * bonusMultiplier;
}

export function isFinaleRound(special) {
  return special?.type === FINALE_TYPE;
}
