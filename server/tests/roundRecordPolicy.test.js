import test from "node:test";
import assert from "node:assert/strict";

import { isScoreRecordEligibleRound } from "../stats/roundRecordPolicy.js";

test("the reinforced finale cannot set score-related records", () => {
  assert.equal(isScoreRecordEligibleRound({ special: { type: "finale" } }), false);
  assert.equal(isScoreRecordEligibleRound({ type: "finale" }), false);
});

test("other rounds remain eligible for score-related records", () => {
  assert.equal(isScoreRecordEligibleRound({ special: { type: "normal" } }), true);
  assert.equal(isScoreRecordEligibleRound({ special: { type: "massive_boggle" } }), true);
  assert.equal(isScoreRecordEligibleRound(null), true);
});
