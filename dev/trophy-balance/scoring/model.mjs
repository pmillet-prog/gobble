import { TROPHY_CATALOG, getTrophyRewards } from '../../../shared/trophyCatalog.js';
import { getTrophyCollectionPoints } from '../../../shared/trophyCollectionScoring.js';
import { TROPHY_POINT_VALUES } from '../../../shared/trophyScoring.js';
import { GOLD_90_DAY_THRESHOLDS } from '../all-players/calibrate.mjs';
import { getWorkshopTrophyRule } from '../trophy-rules.mjs';

// The recommended preset follows the approved game scale. Workshop edits and
// alternative presets remain local simulations and never grant real rewards.
const units = {
  marathon_10000: 'manches', words_100000: 'mots', total_score_10000000: 'points',
  gobbles_10000: 'gobbles simples', double_gobbles_1000: 'doubles gobbles',
  targets_1000: 'cibles', mini_gold_5000: 'médailles d’or', medals_5000: 'médailles',
  julien_1000: 'bonnes réponses', foukro_500000: 'points confirmés',
};
const presenterIds = new Set(['julien_1000', 'foukro_500000']);
const cumulativeIds = Object.keys(GOLD_90_DAY_THRESHOLDS);
export const SCORING_DEFINITIONS = Object.freeze(TROPHY_CATALOG.map(trophy => {
  const cumulative = cumulativeIds.includes(trophy.id);
  const rule = getWorkshopTrophyRule(trophy.id);
  return Object.freeze({
    id: trophy.id, name: trophy.name,
    scope: cumulative ? 'cumulative' : rule.scope === 'weekly' ? 'weekly' : 'event',
    tiers: Object.freeze(cumulative || rule?.tiers ? ['bronze', 'silver', 'gold'] : ['single']),
    condition: cumulative
      ? `Or : ${GOLD_90_DAY_THRESHOLDS[trophy.id].toLocaleString('fr-FR')} ${units[trophy.id]}. Bronze à 30 %, argent à 60 % du seuil.`
      : `${rule.conditionLabel} ${rule.repeatabilityLabel}`,
    repeatable: cumulative || rule.repeatable,
    frequencyKnown: cumulative,
    presenter: presenterIds.has(trophy.id),
  });
}));
const byId = new Map(SCORING_DEFINITIONS.map(definition => [definition.id, definition]));
const eventPoints = {
  weekly_gold: { single: 40 }, weekly_silver: { single: 25 }, weekly_bronze: { single: 15 },
  volume_100: { single: 20 }, word_16: { single: 300 }, word_17: { single: 1000 },
  three_words_1000: { single: 20 }, target_under_2s: { single: 20 },
  round_5000: { bronze: 10, silver: 20, gold: 40 },
};
function makePoints(golds) {
  return Object.freeze({
    ...Object.fromEntries(Object.entries(eventPoints).map(([id, points]) => [id, Object.freeze({ ...points })])),
    ...Object.fromEntries(cumulativeIds.map((id, index) => {
      const gold = golds[index];
      return [id, Object.freeze({ bronze: gold / 4, silver: gold / 2, gold })];
    })),
  });
}
function approvedPoints() {
  return Object.freeze(Object.fromEntries(SCORING_DEFINITIONS.map(definition => [
    definition.id,
    Object.freeze(Object.fromEntries(definition.tiers.map(tier => [tier,
      TROPHY_POINT_VALUES[tier === 'gold' || tier === 'single' ? definition.id : `${definition.id}:${tier}`],
    ]))),
  ])));
}
export const SCORING_PRESETS = Object.freeze({
  equal: Object.freeze({
    label: 'Tous égaux',
    description: 'Même valeur pour chaque or cumulatif : référence pour mesurer les écarts.',
    points: makePoints(cumulativeIds.map(() => 100)),
  }),
  recommended: Object.freeze({
    label: 'Conseillé',
    description: 'L’assiduité pèse davantage ; les médailles de mini-tournoi contribuent moins au total.',
    points: approvedPoints(),
  }),
  attendance: Object.freeze({
    label: 'Assiduité renforcée',
    description: 'Un poids encore plus fort pour les manches et les mots, avec des ors compétitifs moins rémunérateurs.',
    points: makePoints([600, 160, 60, 60, 40, 80, 20, 40, 80, 80]),
  }),
});
export const clonePoints = points => Object.fromEntries(Object.entries(points).map(([id, tiers]) => [id, { ...tiers }]));

export function scoreAcquisitions(id, counts, points) {
  const definition = byId.get(id);
  if (!definition) throw new Error(`Unknown trophy: ${id}`);
  for (const tier of definition.tiers) {
    const weight = points[id]?.[tier];
    const count = counts?.[tier] ?? 0;
    if (!Number.isSafeInteger(weight) || weight < 0 || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid points or acquisition count: ${id}/${tier}`);
    }
  }
  const rewards = getTrophyRewards(id).map(reward => ({ ...reward, points: points[id][reward.metal || 'single'] }));
  const earned = Object.fromEntries(rewards.map(reward => [reward.id, counts?.[reward.metal || 'single'] ?? 0]));
  return getTrophyCollectionPoints(earned, rewards);
}

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};
const ratio = (high, low) => high !== null && low > 0 ? high / low : null;
const horizonDefinitions = {
  days90: { quantity: 90, rate: 'perDay', label: '90 jours au rythme observé' },
  rounds1000: { quantity: 1000, rate: 'perRound', label: '1 000 manches par joueur' },
  rounds5000: { quantity: 5000, rate: 'perRound', label: '5 000 manches par joueur' },
};

export function projectScoring(data, points, { horizon = 'days90', includePresenters = false } = {}) {
  const period = horizonDefinitions[horizon];
  if (!period) throw new Error(`Unknown horizon: ${horizon}`);
  const cohort = data.cohortDefaults;
  const regulars = data.profiles.filter(player => player.recentRounds >= cohort.minRounds
    && player.activeWeeks >= cohort.minActiveWeeks)
    .sort((a, b) => a.scorePerRound - b.scorePerRound || a.userId - b.userId);
  const categories = data.categories.filter(category => !presenterIds.has(category.id)
    || (includePresenters && period.rate === 'perDay'));
  const includedCategoryIds = categories.map(category => category.id);
  const excludedCategoryIds = SCORING_DEFINITIONS.filter(definition => !includedCategoryIds.includes(definition.id)).map(definition => definition.id);
  const fractions = { bronze: data.scenario.fractions.bronze, silver: data.scenario.fractions.argent };
  const groupIds = ['low', 'mid', 'high'];
  const players = regulars.map((player, index) => {
    const categoryScores = categories.map(category => {
      const rate = player.metrics[category.id]?.[period.rate];
      const known = typeof rate === 'number' && Number.isFinite(rate) && rate >= 0;
      if (!known) return { id: category.id, name: category.name, known: false, subtotal: null, counts: null };
      const amount = rate * period.quantity;
      const counts = {
        bronze: Number(amount >= category.threshold * fractions.bronze),
        silver: Number(amount >= category.threshold * fractions.silver),
        gold: Math.floor(amount / category.threshold + 1e-10),
      };
      return { id: category.id, name: category.name, known: true, counts,
        subtotal: scoreAcquisitions(category.id, counts, points) };
    });
    const known = categoryScores.filter(category => category.known);
    return {
      userId: player.userId, nick: player.nick,
      group: groupIds[Math.min(2, Math.floor(index * 3 / regulars.length))],
      scorePerRound: player.scorePerRound, roundsPerWeek: player.roundsPerWeek,
      subtotal: known.reduce((sum, category) => sum + category.subtotal, 0),
      complete: known.length === categories.length, knownCategories: known.length,
      totalCategories: categories.length, categoryScores,
    };
  });
  const groups = groupIds.map((id, index) => {
    const members = players.filter(player => player.group === id);
    const complete = members.filter(player => player.complete);
    const values = complete.map(player => player.subtotal);
    return {
      id, label: ['Rendement faible', 'Rendement intermédiaire', 'Rendement élevé'][index],
      count: members.length, completeCount: complete.length,
      medianSubtotal: median(values),
      meanSubtotal: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    };
  });
  return {
    players, groups, categoryCount: categories.length, includedCategoryIds, excludedCategoryIds,
    ratioHighLow: ratio(groups[2].meanSubtotal, groups[0].meanSubtotal),
    ratioMedianHighLow: ratio(groups[2].medianSubtotal, groups[0].medianSubtotal),
    projectedScopeLabel: `Sous-total de ${categories.length} catégories cumulatives · ${period.label}`,
  };
}
