import assert from "node:assert/strict";
import test from "node:test";

import {
  createInvalidWordGuardState,
  registerInvalidWordAttempt,
  releaseInvalidWordGuard,
} from "./useInvalidWordGuard.js";

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
