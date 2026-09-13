import assert from "node:assert/strict";
import test from "node:test";

import {
  createInvalidWordGuardState,
  isInvalidWordGuardEnabled,
  registerInvalidWordAttempt,
  releaseInvalidWordGuard,
} from "./useInvalidWordGuard.js";

test("speed rounds alone gain an antispam exemption while the other round policies stay unchanged", () => {
  const live = { isLoggedIn: true, appView: "live", phase: "playing" };
  assert.equal(isInvalidWordGuardEnabled({ ...live, roundType: "speed" }), false);
  for (const roundType of [undefined, null, "normal", "finale", "monstrous", "massive_boggle", "bonus_letter", "fake_twins", "ocid", "culture_theme"]) {
    assert.equal(isInvalidWordGuardEnabled({ ...live, roundType }), true, String(roundType));
  }
  // These modes were already exempt before this change.
  for (const roundType of ["target_long", "target_score", "self_specials_3_words"]) {
    assert.equal(isInvalidWordGuardEnabled({ ...live, roundType }), false, roundType);
  }
  for (const context of [{ appView: "daily_play" }, { phase: "lobby" }, { phase: "results" }, { isLoggedIn: false }]) {
    assert.equal(isInvalidWordGuardEnabled({ ...live, ...context }), false);
  }
});

test("the third consecutive invalid word starts the guard", () => {
  let state = createInvalidWordGuardState();
  state = registerInvalidWordAttempt(state, 0);
  state = registerInvalidWordAttempt(state, 1);
  assert.equal(state.blocked, false);
  state = registerInvalidWordAttempt(state, 2);
  assert.equal(state.blocked, true);
  assert.equal(state.consecutiveInvalid, 3);
  assert.ok(state.message);
});

test("the next invalid word blocks again after cooldown", () => {
  let state = createInvalidWordGuardState();
  state = registerInvalidWordAttempt(state, 0);
  state = registerInvalidWordAttempt(state, 0);
  state = registerInvalidWordAttempt(state, 0);
  state = releaseInvalidWordGuard(state);
  state = registerInvalidWordAttempt(state, 4);
  assert.equal(state.blocked, true);
  assert.equal(state.consecutiveInvalid, 4);
});
