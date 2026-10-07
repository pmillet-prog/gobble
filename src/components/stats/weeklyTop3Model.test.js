import assert from "node:assert/strict";
import test from "node:test";
import { formatWeeklyTop3Percentage, getWeeklyTop3Entries } from "./weeklyTop3Model.js";
import { WEEKLY_BOARDS, WEEKLY_STATS_BOARDS, WEEKLY_TOP3_ROUND_TYPES } from "../../features/stats/statsConfig.js";

const entry = (nick, top3Count, roundsPlayed, achievedAt = 1) => ({
  playerKey: `user:${nick}`, nick, top3Count, roundsPlayed, achievedAt,
});

test("top 3 keeps a real zero percent and excludes empty or invalid participation", () => {
  const ranked = getWeeklyTop3Entries([
    entry("Zéro", 0, 4),
    entry("Absent", 0, 0),
    entry("Invalide", 4, 3),
    { nick: "Ancienne donnée", percentage: 100 },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].percentage, 0);
  assert.equal(ranked[0].roundsPlayed, 4);
  assert.deepEqual(getWeeklyTop3Entries(undefined), []);
});

test("top 3 ranks exact ratios, then the number of top 3 results", () => {
  const ranked = getWeeklyTop3Entries([
    entry("Deux", 2, 3),
    entry("Presque deux tiers", 666, 1000),
    entry("Quatre", 4, 6),
    entry("Premier", 1, 1),
  ]);
  assert.deepEqual(ranked.map((row) => row.nick), ["Premier", "Quatre", "Deux", "Presque deux tiers"]);
  assert.equal(ranked[1].percentage, 100 * 4 / 6);
  assert.equal(getWeeklyTop3Entries(ranked, 2).length, 2);
});

test("top 3 uses the latest cumulative record even when its percentage falls", () => {
  const ranked = getWeeklyTop3Entries([
    entry("Paul", 2, 2, 100),
    entry("Paul", 2, 4, 200),
    entry("Paul", 2, 3, 150),
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].percentage, 50);
  assert.equal(ranked[0].roundsPlayed, 4);
});

test("top 3 recalculates percentages from counts and preserves profile identity", () => {
  const row = { ...entry("Paul", 1, 4), userId: 42, percentage: 99 };
  const ranked = getWeeklyTop3Entries([row]);
  assert.equal(ranked[0].percentage, 25);
  assert.equal(ranked[0].userId, 42);
  assert.equal(row.percentage, 99);
});

test("top 3 equal records keep the API stable identity order", () => {
  const ranked = getWeeklyTop3Entries([
    { ...entry("Arthur", 1, 2), playerKey: "user:2" },
    { ...entry("Zoé", 1, 2), playerKey: "user:1" },
  ]);
  assert.deepEqual(ranked.map((row) => row.playerKey), ["user:1", "user:2"]);
});

test("top 3 percentages use French decimal formatting", () => {
  assert.equal(formatWeeklyTop3Percentage(0), "0 %");
  assert.equal(formatWeeklyTop3Percentage(100), "100 %");
  assert.equal(formatWeeklyTop3Percentage(100 * 2 / 3), "66,7 %");
});

test("top 3 is a stats page with all round types, without changing finale boards", () => {
  assert.equal(WEEKLY_BOARDS.some((board) => board.key === "top3"), false);
  assert.equal(WEEKLY_STATS_BOARDS.filter((board) => board.key === "top3").length, 1);
  assert.equal(WEEKLY_TOP3_ROUND_TYPES.length, 11);
  assert.equal(new Set(WEEKLY_TOP3_ROUND_TYPES.map((type) => type.key)).size, 11);
});
