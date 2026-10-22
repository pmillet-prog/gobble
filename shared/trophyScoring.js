// Approved "Conseillé" scale. Acquisition thresholds live in trophyCatalog.js;
// Tier values are totals, not additive bonuses: each higher tier replaces the
// previous tier's points. Every additional gold earns its full value.
const cumulativeGoldPoints = Object.freeze({
  marathon_10000: 400,
  words_100000: 120,
  total_score_10000000: 80,
  gobbles_10000: 80,
  double_gobbles_1000: 60,
  targets_1000: 100,
  mini_gold_5000: 20,
  medals_5000: 40,
  julien_1000: 80,
  foukro_500000: 80,
});

export const TROPHY_POINT_VALUES = Object.freeze({
  weekly_gold: 40,
  weekly_silver: 25,
  weekly_bronze: 15,
  volume_100: 20,
  word_16: 300,
  word_17: 1000,
  three_words_1000: 20,
  target_under_2s: 20,
  gotus_100: 80,
  "round_5000:bronze": 10,
  "round_5000:silver": 20,
  round_5000: 40,
  ...Object.fromEntries(Object.entries(cumulativeGoldPoints).flatMap(([id, gold]) => [
    [`${id}:bronze`, gold / 4], [`${id}:silver`, gold / 2], [id, gold],
  ])),
});
