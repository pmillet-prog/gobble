import assert from "node:assert/strict";
import test from "node:test";
import { calibrateGold90Days, roundGoldThresholdDown } from "./calibrate.mjs";

const category = {
  id: "marathon_10000", name: "Marathonien", threshold: 10000,
  description: "Catalogue", unit: "manches",
};
const cohort = { minRounds: 100, minActiveWeeks: 2 };
function calculate(rates, selectedCategory = category) {
  return calibrateGold90Days({ categories: [selectedCategory], cohort,
    profiles: rates.map((rate, index) => ({ userId: index + 1, nick: `Joueur ${index + 1}`,
      recentRounds: 100, activeWeeks: 2,
      metrics: { [selectedCategory.id]: { perDay: rate } },
    })),
  });
}

test("an even cohort requires exactly half, with the target player's delay", () => {
  const result = calculate([100, 50, 10, 0]);
  const calibrated = result.categories[0];
  assert.equal(result.calibration.requiredPlayers, 2);
  assert.equal(calibrated.calibration.newReachedPlayers, 2);
  assert.equal(calibrated.calibration.targetReachedAfterDays, 40);
  assert.equal(calibrated.calibration.maxGoldThreshold, 4500);
  assert.equal(calibrated.catalogueThreshold, 10000);
  assert.equal(calibrated.threshold, 2000);
  assert.equal(calibrated.calibration.roundedGoldThreshold, 2000);
  assert.equal(calibrated.calibration.targetRequired, true);
  assert.equal(calibrated.calibration.targetMet, true);
});

test("an odd cohort rounds the required number of players upward", () => {
  const result = calculate([100, 50, 30, 0, null]);
  assert.equal(result.calibration.cohortSize, 5);
  assert.equal(result.calibration.requiredPlayers, 3);
  assert.equal(result.categories[0].calibration.targetReachedAfterDays, 2000 / 30);
});

test("ties include every player at the threshold without reducing the quorum", () => {
  const result = calculate([30, 30, 30, null]);
  assert.equal(result.calibration.requiredPlayers, 2);
  assert.equal(result.categories[0].calibration.newReachedPlayers, 3);
  assert.equal(result.categories[0].calibration.maxGoldThreshold, 2700);
});

test("zero and unknown rates remain in the denominator and never qualify", () => {
  const result = calculate([30, 30, 0, null]);
  const data = result.categories[0].calibration;
  assert.equal(data.totalPlayers, 4);
  assert.equal(data.knownPlayers, 3);
  assert.equal(data.requiredPlayers, 2);
  assert.equal(data.newReachedPlayers, 2);
  assert.equal(data.targetReachedAfterDays, 2000 / 30);
  assert.equal(result.calibration.allCategoriesReachedPlayers, 2);
});

test("too few positive rates cannot yield an estimated 50 percent delay", () => {
  assert.throws(() => calculate([100, 0, null, null]), /not enough positive observed rates/);
  assert.throws(() => calculate([null, null]), /not enough positive observed rates/);
});

test("the admissible integer threshold rounds down from the boundary projection", () => {
  const result = calculate([100, 2500.9 / 90, 0, null]);
  assert.equal(result.categories[0].calibration.maxGoldThreshold, 2500);
  assert.equal(result.categories[0].threshold, 2000);
  assert.equal(result.categories[0].calibration.newReachedPlayers, 2);
  assert.ok(result.categories[0].calibration.targetReachedAfterDays < 90);
});

test("a selected workshop threshold above the admissible boundary is rejected", () => {
  assert.throws(() => calculate([100, 20, 0, null]), /threshold above 50% boundary/);
});

test("preferred thresholds round down at series and power-of-ten boundaries", () => {
  for (const [maximum, expected] of [[0, 0], [0.99, 0], [1, 1], [1.99, 1],
    [2, 2], [4.99, 2], [5, 5], [9.99, 5], [10, 10], [1999, 1000],
    [2000, 2000], [2549, 2000], [76574, 50000], [3415337, 2000000]]) {
    assert.equal(roundGoldThresholdDown(maximum), expected, `maximum ${maximum}`);
  }
  for (const invalid of [-1, NaN, Infinity, null]) {
    assert.throws(() => roundGoldThresholdDown(invalid), /finite nonnegative maximum/);
  }
});

test("a confirmed medal exception keeps its true coverage even below fifty percent", () => {
  const result = calculate([1, 0.2, 0, null], { ...category, id: "mini_gold_5000", threshold: 5000 });
  const calibrated = result.categories[0];
  assert.equal(calibrated.threshold, 50);
  assert.equal(calibrated.calibration.requiredPlayers, 2);
  assert.equal(calibrated.calibration.newReachedPlayers, 1);
  assert.equal(calibrated.calibration.totalPlayers, 4);
  assert.equal(calibrated.calibration.knownPlayers, 3);
  assert.equal(calibrated.calibration.maxGoldThreshold, 18);
  assert.equal(calibrated.calibration.roundedGoldThreshold, 10);
  assert.equal(calibrated.calibration.targetReachedAfterDays, 250);
  assert.equal(calibrated.calibration.targetRequired, false);
  assert.equal(calibrated.calibration.targetMet, false);
  assert.equal(result.calibration.targetCategoryCount, 0);
  assert.equal(result.calibration.exceptionCategoryCount, 1);
});

test("an exception with no measured positive rate retains an unknown target delay", () => {
  const result = calculate([null, 0, null, 0], { ...category, id: "mini_gold_5000", threshold: 5000 });
  assert.equal(result.categories[0].calibration.newReachedPlayers, 0);
  assert.equal(result.categories[0].calibration.targetReachedAfterDays, null);
  assert.equal(result.categories[0].calibration.targetMet, false);
});

test("the medal exception does not waive a different category's target guard", () => {
  const categories = [category, { ...category, id: "mini_gold_5000", threshold: 5000 }];
  const profiles = [100, 0, null, 0].map((rate, index) => ({ userId: index + 1,
    recentRounds: 100, activeWeeks: 2,
    metrics: { marathon_10000: { perDay: rate }, mini_gold_5000: { perDay: 0 } },
  }));
  assert.throws(() => calibrateGold90Days({ categories, profiles, cohort }), /not enough positive observed rates/);
});

test("stored workshop values cannot silently depart from the rounding rule", () => {
  assert.throws(() => calculate([100, 60, 0, null]), /differs from 1\/2\/5 rounding/);
});
