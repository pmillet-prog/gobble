import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStandaloneTrainingTargetSummary,
  buildTrainingTargetHint,
  buildTrainingTargetHintSchedule,
  describeLiveTrainingStatus,
  formatTrainingDuration,
} from "./standaloneTraining.js";
import { getResultsPagesForRound } from "../hooks/useResultsNavigation.js";

test("training duration and live status labels are compact", () => {
  assert.equal(formatTrainingDuration(90_000), "1:30");
  assert.deepEqual(describeLiveTrainingStatus({ humanPlayerCount: 2, phase: "lobby" }), {
    playerText: "2 joueurs dans le live",
    roundText: "Lobby entre deux tournois",
  });
});

test("standalone results expose only pages relevant to their training mode", () => {
  assert.deepEqual(
    getResultsPagesForRound({ isStandaloneTraining: true, isTargetRound: true }),
    ["target"]
  );
  assert.deepEqual(
    getResultsPagesForRound({ isStandaloneTraining: true, isTargetRound: false }),
    ["found", "all"]
  );
});

test("target training builds a local result summary", () => {
  assert.deepEqual(
    buildStandaloneTrainingTargetSummary({ mode: "target_long", targetWord: "  exemple " }),
    { word: "exemple", foundOrder: [] }
  );
  assert.equal(buildStandaloneTrainingTargetSummary({ mode: "normal" }), null);
});

test("target hint schedule follows the selected duration", () => {
  const short = buildTrainingTargetHintSchedule(30_000, 8);
  const long = buildTrainingTargetHintSchedule(180_000, 8);
  assert.equal(short.length, 7);
  assert.equal(long.length, 7);
  assert.ok(short.at(-1) < 30_000);
  assert.ok(long.at(-1) > short.at(-1));
});

test("target hints preserve Qu cells and reveal order", () => {
  const grid = [{ letter: "Qu" }, { letter: "I" }];
  const hint = buildTrainingTargetHint({
    word: "qui",
    path: [0, 1],
    grid,
    revealCount: 1,
    kind: "target_long",
    seed: "fixed-grid",
  });
  assert.equal(hint.length, 3);
  assert.equal(hint.wordIndices.length >= 1, true);
  if (hint.wordIndices.includes(0) || hint.wordIndices.includes(1)) {
    assert.equal(hint.wordIndices.includes(0), true);
    assert.equal(hint.wordIndices.includes(1), true);
  }
});
