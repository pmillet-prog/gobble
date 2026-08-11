import assert from "node:assert/strict";
import test from "node:test";

import {
  appendRecentTrainingGridId,
  buildStandaloneTrainingPayload,
  normalizeTrainingDurationMs,
  normalizeTrainingMode,
} from "../training/standaloneTrainingPolicy.js";

test("standalone training clamps durations and rejects OCID", () => {
  assert.equal(normalizeTrainingDurationMs(1), 30_000);
  assert.equal(normalizeTrainingDurationMs(90_000), 90_000);
  assert.equal(normalizeTrainingDurationMs(99_000_000), 600_000);
  assert.equal(normalizeTrainingMode("normal"), "normal");
  assert.equal(normalizeTrainingMode("ocid"), null);
});

test("recent training grids are unique and bounded", () => {
  let ids = [];
  for (let index = 0; index < 35; index += 1) {
    ids = appendRecentTrainingGridId(ids, `grid-${index}`);
  }
  assert.equal(ids.length, 30);
  assert.equal(ids[0], "grid-5");
  ids = appendRecentTrainingGridId(ids, "grid-12");
  assert.equal(ids.length, 30);
  assert.equal(ids.at(-1), "grid-12");
});

test("standalone payload exposes one prepared grid and its solutions", () => {
  const payload = buildStandaloneTrainingPayload({
    durationMs: 75_000,
    sessionId: "session-1",
    startedAt: 123,
    entry: {
      id: "grid-1",
      grid: [{ letter: "A", bonus: null }],
      plan: { type: "normal", label: "Classique", isSpecial: false },
      quality: { words: 150 },
      solutions: [{ word: "as", pts: 2, path: [0] }],
    },
  });
  assert.equal(payload.sessionId, "session-1");
  assert.equal(payload.durationMs, 75_000);
  assert.equal(payload.gridId, "grid-1");
  assert.equal(payload.solutions.length, 1);
});
