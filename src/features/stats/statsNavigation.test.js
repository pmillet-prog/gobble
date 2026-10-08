import test from "node:test";
import assert from "node:assert/strict";
import { changeStatsPeriod, getStatsNavigation, STATS_PAGES } from "./statsNavigation.js";
import { WEEKLY_STATS_BOARDS } from "./statsConfig.js";

test("weekly vocabulary is the landing page and all existing weekly rankings remain accessible", () => {
  const landing = getStatsNavigation();
  assert.equal(landing.tab, "weekly");
  assert.equal(landing.board.key, "weeklyVocab");
  const keys = Object.values(STATS_PAGES.weekly).flat().map(({ key }) => key);
  for (const { key } of WEEKLY_STATS_BOARDS) assert.ok(keys.includes(key), key);
  assert.equal(new Set(keys).size, keys.length);
});

test("period changes preserve compatible categories and metrics", () => {
  assert.deepEqual(changeStatsPeriod({ category: "presenters", boardKey: "targetQuizPoints" }, "season"), {
    tab: "season", category: "presenters", boardKey: "targetQuizPoints",
  });
  assert.equal(changeStatsPeriod({ category: "words", boardKey: "mostGobbles" }, "season").boardKey, "gobbles");
  assert.equal(changeStatsPeriod({ category: "vocabulary", boardKey: "vocab_personal" }, "weekly").boardKey, "weeklyVocab");
  assert.equal(changeStatsPeriod({ category: "rounds", boardKey: "top3" }, "season").boardKey, "vocab");
  assert.deepEqual(getStatsNavigation({ tab: "season" }).categories.map(({ key }) => key), ["vocabulary", "words", "presenters"]);
});

test("invalid or old navigation selections resolve to an available page", () => {
  assert.equal(getStatsNavigation({ category: "unknown", boardKey: "missing" }).board.key, "weeklyVocab");
  assert.equal(getStatsNavigation({ tab: "season", category: "words", boardKey: "bestWord" }).board.key, "gobbles");
});
