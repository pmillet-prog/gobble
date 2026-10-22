import assert from "node:assert/strict";
import test from "node:test";

import {
  createWeeklyStatsRuntimeModel,
  formatMsShort,
  getWeeklyEntryKey,
  getWeeklyMetricValue,
  hasWeeklyChanges,
} from "./weeklyStatsModel.js";
import { getStatsRowDetails } from "./statsLeaderboardModel.js";

test("weekly entry keys prefer the stable player key", () => {
  assert.equal(getWeeklyEntryKey({ playerKey: "user:42", nick: "Tigre" }), "user:42");
  assert.equal(getWeeklyEntryKey({ nick: "  Tigre  " }), "nick:tigre");
  assert.equal(getWeeklyEntryKey(null), "");
});

test("weekly metric values keep score and target-time semantics", () => {
  assert.equal(getWeeklyMetricValue("totalScore", { totalScore: 1234 }), 1234);
  assert.equal(getWeeklyMetricValue("weeklyVocab", { weeklyVocabCount: 87 }), 87);
  assert.equal(getWeeklyMetricValue("bestTimeTargetLong", { ms: "2500" }), 2500);
});

test("Gotus ranks live words found and displays no score", () => {
  const model = createWeeklyStatsRuntimeModel({ current: "" }, { current: "" }, null);
  const ranked = model.dedupeWeeklyEntries("gotusWins", [
    { userId: 1, nick: "Tigre", wins: 9 },
    { userId: 2, nick: "Pounie", wins: 10 },
    { userId: 1, nick: "Tigre", wins: 12 },
  ]);
  assert.deepEqual(ranked.map(row => [row.userId, row.wins]), [[1, 12], [2, 10]]);
  assert.equal(getWeeklyMetricValue("gotusWins", ranked[0]), 12);
  assert.deepEqual(getStatsRowDetails("gotusWins", ranked[0]), { value: "12", unit: "mots trouvés", details: [], word: null });
});

test("trophy ranking orders points instead of collection size and retains stable player identities", () => {
  const model = createWeeklyStatsRuntimeModel({ current: "" }, { current: "" }, null);
  const ranked = model.dedupeWeeklyEntries("achievementPoints", [
    { userId: 1, nick: "Tigre", points: 20, totalCount: 10 },
    { userId: 2, nick: "Test", points: 50, totalCount: 2 },
    { userId: 1, nick: "Tigre", points: 30, totalCount: 11 },
  ]);
  assert.deepEqual(ranked.map(entry => entry.userId), [2, 1]);
  assert.equal(getWeeklyMetricValue("achievementPoints", ranked[1]), 30);
  assert.deepEqual(getStatsRowDetails("achievementPoints", ranked[0]), {
    value: "50", unit: "points", details: ["2 trophées obtenus"], word: null,
  });
});

test("presenter progress rankings keep negative balances and deduplicate by stable identity", () => {
  const model = createWeeklyStatsRuntimeModel({ current: "" }, { current: "" }, null);
  const points = model.dedupeWeeklyEntries("targetQuizPoints", [
    { userId: 1, nick: "Même pseudo", points: -250 },
    { userId: 2, nick: "Même pseudo", points: 0 },
    { userId: 3, nick: "Autre", points: 150 },
  ]);
  assert.deepEqual(points.map(entry => entry.points), [150, 0, -250]);
  assert.equal(getWeeklyMetricValue("targetQuizPoints", points[2]), -250);
  const hits = model.dedupeWeeklyEntries("presenterHits", [
    { presenterId: "pivot", nick: "Pinot", hits: 5 },
    { presenterId: "lepers", nick: "Lechéper", hits: 18 },
    { presenterId: "foukro", nick: "FouKro", hits: 0 },
  ]);
  assert.deepEqual(hits.map(entry => entry.presenterId), ["lepers", "pivot", "foukro"]);
  assert.equal(model.dedupeWeeklyEntries("qpugAnswers", [{ userId: 8, correctCount: 35 }])[0].correctCount, 35);
});

test("weekly changes detect rank, score, and faster target times", () => {
  const rankMap = new Map([["user:42", 2]]);
  const scoreMap = new Map([["user:42", 100]]);
  const timeMap = new Map([["user:42", 3000]]);
  const entry = { playerKey: "user:42", totalScore: 120, ms: 2500 };

  assert.equal(hasWeeklyChanges("totalScore", [entry], rankMap, scoreMap), true);
  assert.equal(
    hasWeeklyChanges("bestTimeTargetLong", [entry], new Map([["user:42", 1]]), timeMap),
    true
  );
  assert.equal(
    hasWeeklyChanges(
      "totalScore",
      [{ playerKey: "user:42", totalScore: 100 }],
      new Map([["user:42", 1]]),
      scoreMap
    ),
    false
  );
});

test("short target times retain the existing display precision", () => {
  assert.equal(formatMsShort(2345), "2.35s");
  assert.equal(formatMsShort(12500), "12.5s");
  assert.equal(formatMsShort(65000), "1m05s");
});

test("weekly runtime model deduplicates players and ranks the current player", () => {
  const stats = {
    topN: 50,
    boards: {
      weeklyVocab: [
        { playerKey: "install:other", nick: "Autre", weeklyVocabCount: 20 },
        { playerKey: "install:self", nick: "Tigre", weeklyVocabCount: 10 },
        { playerKey: "install:self", nick: "Tigre", weeklyVocabCount: 15 },
      ],
    },
  };
  const model = createWeeklyStatsRuntimeModel(
    { current: "self" },
    { current: "Tigre" },
    stats
  );

  const deduped = model.dedupeWeeklyEntries("weeklyVocab", stats.boards.weeklyVocab, 50);
  assert.deepEqual(
    deduped.map((entry) => [entry.nick, entry.weeklyVocabCount]),
    [
      ["Autre", 20],
      ["Tigre", 15],
    ]
  );
  assert.equal(model.getSelfWeeklyVocabRankFromStats(), 2);
  assert.equal(model.getWeeklyVocabRankForCount(25), 1);
});
