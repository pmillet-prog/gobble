import test from "node:test";
import assert from "node:assert/strict";
import { TROPHY_CATALOG, TROPHY_BY_ID, TROPHY_REWARDS } from "../../../shared/trophyCatalog.js";
import { collectRoundTrophyAwards, getDisplayedTrophyReward, getTrophyAwardPoints, getTrophyCollection, getTrophyCountLabel, getTrophyRewardName, normalizeTrophyAward } from "./trophyPresentation.js";

test("one shelf category keeps each metal distinct and displays its highest obtained reward", () => {
  const category = TROPHY_CATALOG.find(trophy => trophy.id === "marathon_10000");
  assert.equal(getDisplayedTrophyReward(category, {}).id, "marathon_10000");
  assert.equal(getDisplayedTrophyReward(category, { "marathon_10000:bronze": 1 }).id, "marathon_10000:bronze");
  assert.equal(getDisplayedTrophyReward(category, { "marathon_10000:bronze": 1, "marathon_10000:silver": 1 }).id, "marathon_10000:silver");
  assert.equal(getDisplayedTrophyReward(category, { "marathon_10000:silver": 1, marathon_10000: 16 }).id, "marathon_10000");
});

test("collection keeps every reward counter, caps unique milestones, and preserves repeated golds", () => {
  const collection = getTrophyCollection({ counts: { "marathon_10000:bronze": 5, "marathon_10000:silver": 1, marathon_10000: 16, volume_100: 3, unknown: 99 } }, {}, { "marathon_10000:bronze": 7, volume_100: 9 });
  assert.equal(Object.keys(collection.counts).length, TROPHY_REWARDS.length);
  assert.equal(TROPHY_REWARDS.length, 42);
  assert.equal(collection.counts["marathon_10000:bronze"], 1);
  assert.equal(collection.counts["marathon_10000:silver"], 1);
  assert.equal(collection.counts.marathon_10000, 16);
  assert.equal(collection.counts.volume_100, 1);
  assert.equal(collection.totalCount, 19);
  assert.equal(collection.points, 6420);
  assert.equal(collection.counts.unknown, undefined);
  assert.equal(getTrophyCountLabel(TROPHY_BY_ID.volume_100, 9), "Obtenu une fois");
  assert.equal(getTrophyCountLabel(TROPHY_BY_ID.word_16, 16), "Obtenu 16 fois");
});

test("ranking merges real counts without double counting and excludes all temporary dev grants", () => {
  const persisted = { counts: { "marathon_10000:bronze": 4, "marathon_10000:silver": 1, marathon_10000: 15, volume_100: 9, word_16: 2 } };
  const live = { "marathon_10000:bronze": 7, "marathon_10000:silver": 5, marathon_10000: 16, word_16: 4 };
  const real = getTrophyCollection(persisted, live);
  const trials = getTrophyCollection(persisted, live, { marathon_10000: 10, word_17: 16, "marathon_10000:bronze": 10 });
  assert.equal(real.points, 16 * 400 + 20 + 4 * 300);
  assert.equal(trials.points, real.points);
  assert.equal(trials.counts.marathon_10000, 26);
  assert.equal(trials.counts.word_17, 16);
  assert.equal(trials.counts["marathon_10000:bronze"], 1);
  assert.equal(trials.totalCount, 49);
  assert.equal(getTrophyCollection(null).points, 0);
});

test("success points complete the previous tier, while repeated golds earn full value", () => {
  assert.equal(getTrophyAwardPoints({ id: "marathon_10000:bronze", count: 5, delta: 5 }), 100);
  assert.equal(getTrophyAwardPoints({ id: "marathon_10000:silver", count: 1, delta: 1 }), 100);
  assert.equal(getTrophyAwardPoints({ id: "marathon_10000", count: 1, delta: 1 }), 200);
  assert.equal(getTrophyAwardPoints({ id: "marathon_10000", count: 2, delta: 1 }), 400);
  assert.equal(getTrophyAwardPoints({ id: "marathon_10000", count: 16, delta: 2 }), 800);
  assert.equal(getTrophyAwardPoints({ id: "word_17", count: 16, delta: 1 }), 1000);
  assert.equal(getTrophyAwardPoints({ id: "word_17", count: 16, delta: 1, dev: true }), 0);
});

test("a direct multi-gold jump and replayed receipts announce exactly the collection gain", () => {
  for (const category of TROPHY_CATALOG.filter(trophy => trophy.tierRules.length)) {
    const counts = {};
    let announced = 0;
    for (const reward of TROPHY_REWARDS.filter(item => item.categoryId === category.id)) {
      const count = reward.metal === "gold" ? 3 : 1;
      const award = { id: reward.id, count, delta: count };
      const before = getTrophyCollection({ counts }).points;
      counts[reward.id] = count;
      const points = getTrophyAwardPoints(award);
      assert.equal(points, getTrophyCollection({ counts }).points - before, reward.id);
      assert.equal(getTrophyAwardPoints({ ...award }), points, "pending receipt needs no current collection state");
      announced += points;
    }
    assert.equal(announced, 3 * category.points, category.id);
  }
  for (const [id, points] of [["weekly_bronze", 15], ["weekly_silver", 25], ["weekly_gold", 40]]) {
    assert.equal(getTrophyAwardPoints({ id, count: 3, delta: 2 }), 2 * points);
  }
});

test("round recap retains three independently earned metals without inventing rewards", () => {
  const awards = ["round_5000:bronze", "round_5000:silver", "round_5000"].map((id, index) => ({ id, eventId: `event-${index}`, roundId: "r", count: index + 1, delta: 1 }));
  const recap = collectRoundTrophyAwards([{ nick: "Tigre", achievementAwards: awards }], [], "r");
  assert.deepEqual(recap.map(reward => [reward.id, reward.count, reward.delta]), [["round_5000:bronze", 1, 1], ["round_5000:silver", 1, 1], ["round_5000", 3, 1]]);
  assert.match(getTrophyRewardName(TROPHY_BY_ID["round_5000:silver"]), /Argent/);
  assert.equal(normalizeTrophyAward({ id: "round_5000:platinum", eventId: "bad", count: 1, delta: 1 }), null);
});
