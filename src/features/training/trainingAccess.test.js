import test from "node:test";
import assert from "node:assert/strict";
import { isTrainingPlaytimeExhausted } from "./trainingAccess.js";

test("training blocks at zero, using both local remaining time and the server limit", () => {
  assert.equal(isTrainingPlaytimeExhausted(null), false);
  assert.equal(isTrainingPlaytimeExhausted({ active: false, remainingMs: 0 }), false);
  assert.equal(isTrainingPlaytimeExhausted({ active: true, remainingMs: 1 }), false);
  assert.equal(isTrainingPlaytimeExhausted({ active: true, remainingMs: 6000 }, 0), true);
  assert.equal(isTrainingPlaytimeExhausted({ active: true, remainingMs: 0 }), true);
  assert.equal(isTrainingPlaytimeExhausted({ active: true, exhausted: true }, 1000), true);
  assert.equal(isTrainingPlaytimeExhausted({ active: false, exhausted: false, remainingMs: 0 }), false);
});
