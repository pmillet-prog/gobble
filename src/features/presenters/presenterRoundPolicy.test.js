import assert from "node:assert/strict";
import test from "node:test";

import { areGameplayPresenterHintsDisabled } from "./presenterRoundPolicy.js";

test("gameplay presenter hints are disabled throughout every target round", () => {
  assert.equal(areGameplayPresenterHintsDisabled({ type: "ocid" }), true);
  assert.equal(areGameplayPresenterHintsDisabled({ type: "target_long" }), true);
  assert.equal(areGameplayPresenterHintsDisabled({ type: "target_score" }), true);
});

test("gameplay presenter hints remain available in regular rounds", () => {
  assert.equal(areGameplayPresenterHintsDisabled({ type: "normal" }), false);
  assert.equal(areGameplayPresenterHintsDisabled(null), false);
});

test("three-word rounds also disable gameplay hints, including during preparation", () => {
  assert.equal(areGameplayPresenterHintsDisabled({ type: "self_specials_3_words" }), true);
  assert.equal(areGameplayPresenterHintsDisabled(null, { type: "self_specials_3_words" }), true);
  assert.equal(areGameplayPresenterHintsDisabled({ type: "normal" }, { type: "target_score" }), true);
});
