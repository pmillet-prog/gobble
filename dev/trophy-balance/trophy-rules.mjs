// Confirmed workshop rules, shared by the simulator and the profile mockup.
// They do not change the game's catalogue, awards or ranking point values.
// Rarity is Paul's qualitative design choice, not a measured event frequency.
const rule = (id, fields) => Object.freeze({
  id,
  rulesStatus: "confirmed",
  cumulative: false,
  tiers: null,
  rarity: null,
  rarityLabel: null,
  raritySource: null,
  scoringPriority: null,
  scoringPriorityLabel: null,
  scoringPriorityAbove: Object.freeze([]),
  scoringPoints: null,
  ...fields,
});
const tier = (metal, threshold, repeatable) => Object.freeze({ metal, threshold, repeatable });

export const TROPHY_WORKSHOP_RULES = Object.freeze({
  volume_100: rule("volume_100", {
    scope: "round", threshold: 100, unit: "words", comparison: "gte",
    repeatable: false, repeatUnit: null,
    conditionLabel: "Valider au moins 100 mots sur une seule manche.",
    repeatabilityLabel: "Trophée unique : une seule obtention, sans paliers bronze ou argent.",
  }),
  word_16: rule("word_16", {
    scope: "word", threshold: 16, unit: "letters", comparison: "eq",
    repeatable: true, repeatUnit: "distinct_word_per_round",
    rarity: "rare", rarityLabel: "Rare", raritySource: "user_decision",
    scoringPriority: "high", scoringPriorityLabel: "Forte valeur souhaitée pour le classement ; montant à définir.",
    conditionLabel: "Valider un mot de 16 lettres.",
    repeatabilityLabel: "Répétable pour chaque mot distinct de 16 lettres trouvé dans une manche.",
  }),
  word_17: rule("word_17", {
    scope: "word", threshold: 17, unit: "letters", comparison: "eq",
    repeatable: true, repeatUnit: "distinct_word_per_round",
    rarity: "ultra_rare", rarityLabel: "Ultra rare", raritySource: "user_decision",
    scoringPriority: "very_high", scoringPriorityAbove: Object.freeze(["word_16"]),
    scoringPriorityLabel: "Valeur de classement supérieure au mot de 16 lettres ; montant à définir.",
    conditionLabel: "Valider un mot de 17 lettres.",
    repeatabilityLabel: "Répétable pour chaque mot distinct de 17 lettres trouvé dans une manche.",
  }),
  three_words_1000: rule("three_words_1000", {
    scope: "round", threshold: 1000, unit: "points", comparison: "gte",
    roundKind: "three_words", repeatable: true, repeatUnit: "qualifying_round", maxPerRound: 1,
    rarity: "moderate", rarityLabel: "Rareté modérée", raritySource: "user_decision",
    conditionLabel: "Atteindre 1 000 points dans une manche à trois mots.",
    repeatabilityLabel: "Un trophée par manche réussie, répétable ; aucun palier supplémentaire.",
  }),
  target_under_2s: rule("target_under_2s", {
    scope: "round", threshold: 2000, unit: "milliseconds", comparison: "lt",
    roundKind: "target", repeatable: true, repeatUnit: "qualifying_round", maxPerRound: 1,
    rarity: "moderate", rarityLabel: "Rareté modérée", raritySource: "user_decision",
    conditionLabel: "Trouver le mot cible en moins de deux secondes.",
    repeatabilityLabel: "Un trophée par manche réussie, répétable ; aucun palier supplémentaire.",
  }),
  round_5000: rule("round_5000", {
    scope: "round", threshold: 5000, unit: "points", comparison: "gte",
    excludedFinals: true, repeatable: true, repeatUnit: "qualifying_round", maxPerRound: 1,
    tiers: Object.freeze([
      tier("bronze", 2000, false), tier("silver", 4000, false), tier("gold", 5000, true),
    ]),
    conditionLabel: "Sur une seule manche, hors finales : bronze à 2 000 points, argent à 4 000 et or à 5 000.",
    repeatabilityLabel: "Bronze et argent uniques. Au maximum un or par manche à 5 000 points ou plus ; les scores de plusieurs manches ne se cumulent pas.",
  }),
  weekly_gold: rule("weekly_gold", {
    scope: "weekly", threshold: 1, unit: "rank", comparison: "eq",
    repeatable: true, repeatUnit: "weekly_podium",
    conditionLabel: "Terminer premier de la course hebdomadaire.",
    repeatabilityLabel: "Trophée indépendant et répétable à chaque podium hebdomadaire ; aucun palier supplémentaire.",
  }),
  weekly_silver: rule("weekly_silver", {
    scope: "weekly", threshold: 2, unit: "rank", comparison: "eq",
    repeatable: true, repeatUnit: "weekly_podium",
    conditionLabel: "Terminer deuxième de la course hebdomadaire.",
    repeatabilityLabel: "Trophée indépendant et répétable à chaque podium hebdomadaire ; aucun palier supplémentaire.",
  }),
  weekly_bronze: rule("weekly_bronze", {
    scope: "weekly", threshold: 3, unit: "rank", comparison: "eq",
    repeatable: true, repeatUnit: "weekly_podium",
    conditionLabel: "Terminer troisième de la course hebdomadaire.",
    repeatabilityLabel: "Trophée indépendant et répétable à chaque podium hebdomadaire ; aucun palier supplémentaire.",
  }),
});

export function getWorkshopTrophyRule(id) {
  return Object.hasOwn(TROPHY_WORKSHOP_RULES, id) ? TROPHY_WORKSHOP_RULES[id] : null;
}
