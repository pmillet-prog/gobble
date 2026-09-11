import assert from "node:assert/strict";
import test from "node:test";

import { isTournamentCelebrationActive } from "./presenterCelebrationPolicy.js";

test("presenters remain available during the final-round results window", () => {
  assert.equal(
    isTournamentCelebrationActive({
      breakKind: "tournament_end",
      celebrationAt: 50_000,
      nowMs: 49_999,
    }),
    false
  );
});

test("presenters are muted once the tournament celebration starts", () => {
  assert.equal(
    isTournamentCelebrationActive({
      breakKind: "tournament_end",
      celebrationAt: 50_000,
      nowMs: 50_000,
    }),
    true
  );
  assert.equal(
    isTournamentCelebrationActive({
      breakKind: "between_rounds",
      celebrationAt: 50_000,
      nowMs: 60_000,
    }),
    false
  );
});
