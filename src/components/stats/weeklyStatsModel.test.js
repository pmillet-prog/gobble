import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMsShort,
  getWeeklyEntryKey,
  getWeeklyMetricValue,
  hasWeeklyChanges,
} from "./weeklyStatsModel.js";

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
