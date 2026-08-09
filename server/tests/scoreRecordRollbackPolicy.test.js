import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLifetimeScoreRollbackChanges,
  buildRestoredWeeklyScoreStats,
  collectLifetimeScoreRecords,
  getRoundStartedAt,
} from "../stats/scoreRecordRollbackPolicy.js";

const cutoffAt = 1_785_804_413_000;

test("restores only the two weekly score-record boards from the deployment snapshot", () => {
  const current = {
    weekStartTs: 10,
    bestWord: { newer: { pts: 900 } },
    bestRoundScore: { newer: { pts: 12_000 } },
    totalScore: { kept: { totalScore: 42_000 } },
  };
  const snapshot = {
    weekStartTs: 10,
    bestWord: { older: { pts: 500 } },
    bestRoundScore: { older: { pts: 7_000 } },
  };
  const restored = buildRestoredWeeklyScoreStats(current, snapshot, 11);
  assert.deepEqual(restored.bestWord, snapshot.bestWord);
  assert.deepEqual(restored.bestRoundScore, snapshot.bestRoundScore);
  assert.deepEqual(restored.totalScore, current.totalScore);
});

test("still restores the contaminated week after the weekly rollover", () => {
  const snapshot = {
    weekStartTs: 10,
    bestWord: { older: { pts: 500 } },
    bestRoundScore: { older: { pts: 7_000 } },
  };
  const current = {
    weekStartTs: 20,
    bestWord: { nextWeek: { pts: 1_000 } },
    bestRoundScore: { nextWeek: { pts: 10_000 } },
    history: {
      10: {
        weekStartTs: 10,
        bestWord: { contaminated: { pts: 1_700 } },
        bestRoundScore: { contaminated: { pts: 20_000 } },
      },
    },
  };
  const restored = buildRestoredWeeklyScoreStats(current, snapshot, 11);
  assert.deepEqual(restored.history[10].bestWord, snapshot.bestWord);
  assert.deepEqual(restored.history[10].bestRoundScore, snapshot.bestRoundScore);
  assert.deepEqual(restored.bestWord, {});
  assert.deepEqual(restored.bestRoundScore, {});
});

test("rebuilds lifetime maxima across restored current and historical weeks", () => {
  const records = collectLifetimeScoreRecords({
    weekStartTs: 20,
    bestWord: {
      "install:12": { playerKey: "install:12", word: "actuel", pts: 700, achievedAt: 20 },
    },
    bestRoundScore: {
      "install:12": { playerKey: "install:12", pts: 8_000, roundId: "room#20", achievedAt: 20 },
    },
    history: {
      10: {
        bestWord: {
          "install:12": { playerKey: "install:12", word: "ancien", pts: 900, achievedAt: 10 },
        },
        bestRoundScore: {
          "install:12": { playerKey: "install:12", pts: 7_000, roundId: "room#10", achievedAt: 10 },
        },
      },
    },
  });
  assert.deepEqual(records.get("12"), {
    bestWord: { word: "ancien", pts: 900, achievedAt: 10 },
    bestRoundScore: { pts: 8_000, roundId: "room#20", achievedAt: 20 },
  });
});

test("rolls back only lifetime records achieved after the cutoff", () => {
  const currentWeeklyStats = {
    weekStartTs: 10,
    bestWord: {
      "install:12": {
        playerKey: "install:12",
        word: "gonfle",
        pts: 1_700,
        achievedAt: cutoffAt + 100,
      },
    },
  };
  const restoredWeeklyStats = {
    weekStartTs: 10,
    bestWord: {
      "install:12": {
        playerKey: "install:12",
        word: "valide",
        pts: 900,
        achievedAt: cutoffAt - 100,
      },
    },
    bestRoundScore: {
      "install:12": {
        playerKey: "install:12",
        pts: 8_000,
        roundId: `room#${cutoffAt - 200}`,
        achievedAt: cutoffAt - 100,
      },
    },
  };
  const changes = buildLifetimeScoreRollbackChanges({
    rows: [
      {
        installId: "12",
        bestWord: "gonfle",
        bestWordScore: 1_690,
        bestRoundScore: 21_000,
        bestRoundId: `room#${cutoffAt + 200}`,
      },
      {
        installId: "13",
        bestWord: "intact",
        bestWordScore: 1_000,
        bestRoundScore: 9_000,
        bestRoundId: `room#${cutoffAt - 200}`,
      },
    ],
    currentWeeklyStats,
    restoredWeeklyStats,
    cutoffAt,
  });
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].next, {
    bestWord: "valide",
    bestWordScore: 900,
    bestRoundScore: 8_000,
    bestRoundId: `room#${cutoffAt - 200}`,
  });
  assert.equal(getRoundStartedAt(`room#${cutoffAt + 200}`), cutoffAt + 200);
});
