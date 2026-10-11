// Workshop-only thresholds. The game's shared trophy catalogue is unchanged.
// Nine values are the 50%-at-90-days ceiling rounded down to 1/2/5 x 10^n.
// Mini-tournament gold medals retain Paul's explicitly chosen threshold of 50.
export const GOLD_90_DAY_THRESHOLDS = Object.freeze({
  marathon_10000: 2000,
  words_100000: 50000,
  total_score_10000000: 2000000,
  gobbles_10000: 200,
  double_gobbles_1000: 50,
  targets_1000: 200,
  mini_gold_5000: 50,
  medals_5000: 100,
  julien_1000: 20,
  foukro_500000: 20000,
});

const rounding = Object.freeze({ series: Object.freeze([1, 2, 5]), base: 10, direction: "down" });
const miniGoldException = Object.freeze({
  categoryId: "mini_gold_5000", threshold: 50, reason: "user_confirmed_threshold",
  label: "Seuil de 50 médailles d’or confirmé ; exception à la cible de 50 % en 90 jours.",
});

function requireValid(condition, message) {
  if (!condition) throw new Error(`Invalid population calibration: ${message}`);
}

export function roundGoldThresholdDown(maximum) {
  requireValid(typeof maximum === "number" && Number.isFinite(maximum) && maximum >= 0,
    "rounding needs a finite nonnegative maximum");
  if (maximum < 1) return 0;
  const scale = 10 ** Math.floor(Math.log10(maximum));
  return [...rounding.series].reverse().map((multiplier) => multiplier * scale)
    .find((value) => value <= maximum);
}

// Null and zero rates never qualify for a positive threshold. They still count
// in the complete cohort denominator, rather than disappearing from coverage.
function knownRate(rate) {
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0;
}

export function calibrateGold90Days({ categories, profiles, cohort }) {
  const horizonDays = 90;
  const targetShare = 0.5;
  const regulars = profiles.filter((profile) => profile.recentRounds >= cohort.minRounds
    && profile.activeWeeks >= cohort.minActiveWeeks);
  const totalPlayers = regulars.length;
  const requiredPlayers = Math.ceil(totalPlayers * targetShare);
  requireValid(totalPlayers > 0, "empty cohort");
  requireValid(new Set(regulars.map((profile) => profile.userId)).size === totalPlayers, "duplicate player");
  const qualifies = (profile, id, threshold) => {
    const rate = profile.metrics[id]?.perDay;
    return knownRate(rate) && rate > 0 && rate * horizonDays >= threshold;
  };

  const calibratedCategories = categories.map((category) => {
    const threshold = GOLD_90_DAY_THRESHOLDS[category.id];
    const exception = category.id === miniGoldException.categoryId ? miniGoldException : null;
    const targetRequired = exception === null;
    const catalogueThreshold = category.catalogueThreshold ?? category.threshold;
    requireValid(Number.isSafeInteger(threshold) && threshold > 0, `threshold ${category.id}`);
    requireValid(Number.isInteger(threshold * 0.3) && Number.isInteger(threshold * 0.6),
      `nonintegral bronze/silver threshold ${category.id}`);
    const rates = regulars.map((profile) => profile.metrics[category.id]?.perDay);
    requireValid(rates.every((rate) => rate === null || knownRate(rate)), `rate ${category.id}`);
    if (targetRequired) {
      requireValid(rates.filter((rate) => knownRate(rate) && rate > 0).length >= requiredPlayers,
        `not enough positive observed rates to estimate the target delay for ${category.id}`);
    }
    const projectedTotals = rates.map((rate) => knownRate(rate) ? rate * horizonDays : 0)
      .sort((a, b) => b - a);
    const maxGoldThreshold = Math.floor(projectedTotals[requiredPlayers - 1]);
    const roundedGoldThreshold = roundGoldThresholdDown(maxGoldThreshold);
    const delays = rates.map((rate) => knownRate(rate) && rate > 0 ? threshold / rate : Infinity)
      .sort((a, b) => a - b);
    const oldReachedPlayers = regulars.filter((profile) => qualifies(profile, category.id, catalogueThreshold)).length;
    const newReachedPlayers = regulars.filter((profile) => qualifies(profile, category.id, threshold)).length;
    const targetReachedAfterDays = Number.isFinite(delays[requiredPlayers - 1])
      ? delays[requiredPlayers - 1] : null;
    const targetMet = newReachedPlayers >= requiredPlayers;
    if (targetRequired) {
      requireValid(threshold <= maxGoldThreshold, `threshold above 50% boundary ${category.id}`);
      requireValid(threshold === roundedGoldThreshold, `threshold differs from 1/2/5 rounding ${category.id}`);
      requireValid(targetMet, `coverage below target ${category.id}`);
      requireValid(targetReachedAfterDays !== null && targetReachedAfterDays <= horizonDays,
        `target delay above horizon ${category.id}`);
    } else {
      requireValid(threshold === exception.threshold, `threshold differs from confirmed exception ${category.id}`);
    }
    return {
      ...category,
      catalogueThreshold,
      catalogueDescription: category.catalogueDescription ?? category.description,
      threshold,
      description: `Atelier : cumuler ${threshold.toLocaleString("fr-FR")} ${category.unit}. Bronze unique à 30 %, argent unique à 60 %, puis un or par tranche complète de 100 %.`,
      calibration: {
        oldReachedPlayers, newReachedPlayers, totalPlayers,
        knownPlayers: rates.filter(knownRate).length,
        requiredPlayers, maxGoldThreshold, roundedGoldThreshold, targetReachedAfterDays,
        targetRequired, targetMet, exception,
      },
    };
  });
  const allCategoriesReached = regulars.filter((profile) => calibratedCategories.every((category) =>
    qualifies(profile, category.id, category.threshold)));
  return {
    categories: calibratedCategories,
    calibration: {
      horizonDays, targetShare, cohort: { ...cohort }, cohortSize: totalPlayers,
      requiredPlayers, scope: "cumulative", modelVersion: "gold-90d-round-v2",
      rounding,
      targetCategoryCount: calibratedCategories.filter((category) => category.calibration.targetRequired).length,
      exceptionCategoryCount: calibratedCategories.filter((category) => category.calibration.exception !== null).length,
      exceptions: calibratedCategories.flatMap((category) => category.calibration.exception ? [category.calibration.exception] : []),
      allCategoriesReachedPlayers: allCategoriesReached.length,
    },
    allCategoriesReached: allCategoriesReached.map(({ userId, nick }) => ({ userId, nick })),
  };
}
