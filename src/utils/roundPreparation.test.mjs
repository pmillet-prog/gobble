import assert from "node:assert/strict";
import test from "node:test";

import {
  ROUND_PREPARATION_FALLBACK_GRACE_MS,
  isRoundStartPreparationDelayed,
  shouldShowRoundPreparationOverlay,
} from "./roundPreparation.js";

test("shows grid preparation shortly after a delayed round start", () => {
  const nextStartAt = 10_000;

  assert.equal(
    isRoundStartPreparationDelayed({
      breakKind: "between_rounds",
      nextStartAt,
      nowMs: nextStartAt + ROUND_PREPARATION_FALLBACK_GRACE_MS,
      phase: "results",
    }),
    false
  );
  assert.equal(
    isRoundStartPreparationDelayed({
      breakKind: "between_rounds",
      nextStartAt,
      nowMs: nextStartAt + ROUND_PREPARATION_FALLBACK_GRACE_MS + 1,
      phase: "results",
    }),
    true
  );
});

test("does not show grid preparation while returning to the lobby", () => {
  assert.equal(
    isRoundStartPreparationDelayed({
      breakKind: "tournament_end",
      nextStartAt: 10_000,
      nowMs: 20_000,
      phase: "results",
    }),
    false
  );
});

test("keeps an anticipated preparation notice behind the results", () => {
  assert.equal(
    shouldShowRoundPreparationOverlay({
      phase: "results",
      preparationAnnounced: true,
      startDelayed: false,
    }),
    false
  );
  assert.equal(
    shouldShowRoundPreparationOverlay({
      phase: "results",
      preparationAnnounced: true,
      startDelayed: true,
    }),
    true
  );
});

test("can show preparation immediately outside a results screen", () => {
  assert.equal(
    shouldShowRoundPreparationOverlay({
      phase: "lobby",
      preparationAnnounced: true,
    }),
    true
  );
  assert.equal(
    shouldShowRoundPreparationOverlay({
      phase: "lobby",
      preparationAnnounced: true,
      standaloneTraining: true,
    }),
    false
  );
});
