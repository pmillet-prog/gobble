import test from "node:test";
import assert from "node:assert/strict";
import { getLiveRoundDurationMs, OCID_VOTE_DURATION_MS } from "../liveRoundDuration.js";
import { OCID_TYPE } from "../../shared/gameLogic.js";

test("live three-word rounds last 90 seconds independently of the room's normal timer", () => {
  for (const configured of [90000, 120000, 180000]) {
    assert.equal(getLiveRoundDurationMs("self_specials_3_words", configured), 90000);
    assert.equal(getLiveRoundDurationMs("normal", configured), configured);
  }
});

test("other live formats retain their durations and OCID retains its separate vote", () => {
  for (const type of ["target_long", "target_score"]) assert.equal(getLiveRoundDurationMs(type), 90000);
  for (const type of ["speed", "monstrous", "massive_boggle"]) assert.equal(getLiveRoundDurationMs(type), 120000);
  assert.equal(getLiveRoundDurationMs(OCID_TYPE), 40000);
  assert.equal(getLiveRoundDurationMs(OCID_TYPE) + OCID_VOTE_DURATION_MS, 60000);
});
