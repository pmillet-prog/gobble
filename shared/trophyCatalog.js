// Collection trophies are distinct from the legacy league rating.
// Category ids stay stable; the base id is the gold reward when tiers exist.
import { TROPHY_POINT_VALUES } from "./trophyScoring.js";
export { TROPHY_POINT_VALUES } from "./trophyScoring.js";

export const TROPHY_SLOT_COUNT = 24;
const metalLabels = Object.freeze({ bronze: "Bronze", silver: "Argent", gold: "Or" });
const number = value => value.toLocaleString("fr-FR");
const tier = (metal, threshold, repeatable) => Object.freeze({ metal, threshold, repeatable });
const cumulativeTiers = threshold => Object.freeze([
  tier("bronze", threshold * 0.3, false), tier("silver", threshold * 0.6, false), tier("gold", threshold, true),
]);

const trophy = (id, name, description, threshold, repeat, imageId = id, unit = null, note = "") => Object.freeze({
  id, categoryId: id, name, description, threshold, repeat, note,
  repeatable: repeat !== "once", unique: repeat === "once",
  acquisition: repeat === "cumulative" ? "cumulative" : "event",
  points: TROPHY_POINT_VALUES[id] ?? null,
  image: `/trophies/v1/${imageId}.webp`,
  tierRules: repeat === "cumulative" ? cumulativeTiers(threshold) : id === "round_5000"
    ? Object.freeze([tier("bronze", 2000, false), tier("silver", 4000, false), tier("gold", 5000, true)])
    : Object.freeze([]),
  unit,
});
const cumulative = (id, name, unit, threshold, note = "", imageId = `${id}-v3`) => trophy(id, name,
  `Cumuler ${number(threshold)} ${unit}. Bronze à ${number(threshold * 0.3)}, argent à ${number(threshold * 0.6)}, chacun une seule fois. Un or par tranche de ${number(threshold)}.${note ? ` ${note}` : ""}`,
  threshold, "cumulative", imageId, unit, note);

export const TROPHY_CATALOG = Object.freeze([
  trophy("weekly_gold", "Or hebdomadaire", "Terminer premier de la course hebdomadaire.", 1, "weekly"),
  trophy("weekly_silver", "Argent hebdomadaire", "Terminer deuxième de la course hebdomadaire.", 2, "weekly"),
  trophy("weekly_bronze", "Bronze hebdomadaire", "Terminer troisième de la course hebdomadaire.", 3, "weekly"),
  trophy("volume_100", "Avalanche de mots", "Trouver au moins 100 mots en une manche. Trophée unique.", 100, "once"),
  trophy("word_16", "Seize à la suite", "Trouver un mot de 16 lettres.", 16, "word"),
  trophy("word_17", "Le dix-septième joyau", "Trouver un mot de 17 lettres, un exploit ultra rare.", 17, "word"),
  cumulative("mini_gold_5000", "L'or des champions", "médailles d’or en mini-tournoi", 50),
  trophy("three_words_1000", "Trio de maître", "Atteindre 1 000 points dans une manche à 3 mots.", 1000, "round"),
  trophy("target_under_2s", "Cible éclair", "Trouver le mot cible en moins de 2 secondes.", 2000, "round"),
  cumulative("julien_1000", "Le champion de Julien", "bonnes réponses à Julien Lechéper", 20),
  trophy("round_5000", "Manche magistrale", "Sur une seule manche, hors finales : bronze à 2 000 points, argent à 4 000, chacun une seule fois ; or à 5 000, répétable une fois par manche.", 5000, "round", "round_5000-v3"),
  cumulative("gobbles_10000", "La moisson de gobbles", "gobbles simples", 200, "Les doubles gobbles sont exclus."),
  cumulative("foukro_500000", "Le grand jeu de FouKro", "points confirmés à Qui veut gagner des Gobblars", 20000),
  Object.freeze({ ...trophy("gotus_100", "Gotus", "Trouver 100 mots à Gotus en partie live. L’entraînement ne compte pas. Trophée unique.", 100, "once", "gotus_100-v1"), acquisition: "cumulative" }),
  cumulative("marathon_10000", "Marathonien", "manches jouées", 2000),
  cumulative("total_score_10000000", "Multimillionnaire", "points de jeu", 2000000),
  cumulative("double_gobbles_1000", "Double impact", "doubles gobbles", 50, "Un double compte une fois ici et ne compte pas parmi les gobbles simples."),
  cumulative("targets_1000", "Dans le mile", "mots cibles trouvés", 200),
  cumulative("medals_5000", "Habitué du podium", "médailles de mini-tournoi, toutes couleurs confondues", 100),
  cumulative("words_100000", "Collectionneur", "mots validés", 50000),
]);

export const TROPHY_CATEGORY_BY_ID = Object.freeze(Object.fromEntries(TROPHY_CATALOG.map(entry => [entry.id, entry])));
export const TROPHY_REWARDS = Object.freeze(TROPHY_CATALOG.flatMap(category => {
  if (!category.tierRules.length) return [Object.freeze({ ...category, metal: null, metalLabel: "" })];
  return category.tierRules.map(rule => {
    const id = rule.metal === "gold" ? category.id : `${category.id}:${rule.metal}`;
    const description = category.acquisition === "cumulative"
      ? `Cumuler ${number(rule.threshold)} ${category.unit}. ${rule.repeatable ? `Un or par tranche de ${number(rule.threshold)}.` : "Déblocage unique."}${category.note ? ` ${category.note}` : ""}`
      : `Atteindre ${number(rule.threshold)} points sur une seule manche, hors finales. ${rule.repeatable ? "Au maximum un or par manche." : "Déblocage unique."}`;
    return Object.freeze({ ...category, id, metal: rule.metal, metalLabel: metalLabels[rule.metal],
      threshold: rule.threshold, repeat: rule.repeatable ? category.repeat : "once",
      repeatable: rule.repeatable, unique: !rule.repeatable, description,
      points: TROPHY_POINT_VALUES[id] ?? null });
  });
}));
export const TROPHY_BY_ID = Object.freeze(Object.fromEntries(TROPHY_REWARDS.map(entry => [entry.id, entry])));
const rewardsByCategory = Object.freeze(Object.fromEntries(TROPHY_CATALOG.map(category =>
  [category.id, Object.freeze(TROPHY_REWARDS.filter(reward => reward.categoryId === category.id))])));

export function getTrophyRewards(categoryOrId) {
  const id = typeof categoryOrId === "string" ? categoryOrId : categoryOrId?.categoryId || categoryOrId?.id;
  const categoryId = Object.hasOwn(TROPHY_BY_ID, id) ? TROPHY_BY_ID[id].categoryId : id;
  return Object.hasOwn(rewardsByCategory, categoryId) ? rewardsByCategory[categoryId] : [];
}
