import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveRoundAmbientTransition,
  shouldStartRoundAudio,
} from "./useRoundAudioLifecycle.js";

test("round start audio is guarded by phase, generation and mobile intro", () => {
  assert.equal(
    shouldStartRoundAudio({
      lastStartedRoundId: "round-1",
      phase: "playing",
      roundId: "round-2",
      suppressStart: false,
    }),
    true
  );
  assert.equal(
    shouldStartRoundAudio({
      lastStartedRoundId: "round-2",
      phase: "playing",
      roundId: "round-2",
      suppressStart: false,
    }),
    false
  );
  assert.equal(
    shouldStartRoundAudio({
      lastStartedRoundId: null,
      phase: "playing",
      roundId: "round-2",
      suppressStart: true,
    }),
    false
  );
  assert.equal(
    shouldStartRoundAudio({
      lastStartedRoundId: null,
      phase: "results",
      roundId: "round-2",
      suppressStart: false,
    }),
    false
  );
});

test("ambient audio starts only for live results and reshuffles on entry", () => {
  assert.deepEqual(
    resolveRoundAmbientTransition({
      isAmbientMuted: false,
      isDailyView: false,
      isLoggedIn: true,
      phase: "results",
      previousPhase: "playing",
    }),
    { action: "start", resetOrder: true }
  );
  assert.deepEqual(
    resolveRoundAmbientTransition({
      isAmbientMuted: false,
      isDailyView: false,
      isLoggedIn: true,
      phase: "results",
      previousPhase: "results",
    }),
    { action: "start", resetOrder: false }
  );
});

test("ambient audio stops when muted, outside results or in daily play", () => {
  const base = {
    isAmbientMuted: false,
    isDailyView: false,
    isLoggedIn: true,
    phase: "results",
    previousPhase: "playing",
  };
  assert.equal(
    resolveRoundAmbientTransition({ ...base, isAmbientMuted: true }).action,
    "stop"
  );
  assert.equal(
    resolveRoundAmbientTransition({ ...base, phase: "playing" }).action,
    "stop"
  );
  assert.equal(
    resolveRoundAmbientTransition({ ...base, isDailyView: true }).action,
    "stop"
  );
});
