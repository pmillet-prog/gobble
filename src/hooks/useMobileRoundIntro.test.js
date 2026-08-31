import test from "node:test";
import assert from "node:assert/strict";

import { resolveMobileRoundIntroLifecycle } from "./useMobileRoundIntro.js";

test("a pending server intro starts once for its round generation", () => {
  const base = {
    introWindow: {
      roundId: "round-2",
      startsAt: 10_500,
      status: "intro",
    },
    mobileRoundIntroStage: "idle",
    nowServerMs: 10_000,
    phase: "playing",
    previousPhase: "results",
    roundId: "round-2",
  };

  assert.deepEqual(
    resolveMobileRoundIntroLifecycle({ ...base, startedRoundId: null }),
    { action: "start", markStartedRoundId: null }
  );
  assert.deepEqual(
    resolveMobileRoundIntroLifecycle({ ...base, startedRoundId: "round-2" }),
    { action: null, markStartedRoundId: null }
  );
});

test("a round without a pending intro is marked as already entered", () => {
  assert.deepEqual(
    resolveMobileRoundIntroLifecycle({
      introWindow: { roundId: "round-3", startsAt: 9_000, status: "running" },
      mobileRoundIntroStage: "idle",
      nowServerMs: 10_000,
      phase: "playing",
      previousPhase: "lobby",
      roundId: "round-3",
      startedRoundId: null,
    }),
    { action: null, markStartedRoundId: "round-3" }
  );
});

test("leaving playing stops an active intro but leaves idle state untouched", () => {
  const base = {
    introWindow: null,
    nowServerMs: 10_000,
    phase: "results",
    previousPhase: "playing",
    roundId: "round-4",
    startedRoundId: "round-4",
  };
  assert.deepEqual(
    resolveMobileRoundIntroLifecycle({
      ...base,
      mobileRoundIntroStage: "countdown",
    }),
    { action: "stop", markStartedRoundId: null }
  );
  assert.deepEqual(
    resolveMobileRoundIntroLifecycle({
      ...base,
      mobileRoundIntroStage: "idle",
    }),
    { action: null, markStartedRoundId: null }
  );
});
