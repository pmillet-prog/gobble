import test from "node:test";
import assert from "node:assert/strict";
import { getThreeWordsRecapSound } from "./threeWordsRecapSound.js";
import { SFX_KEYS } from "../../assets/assetKeys.js";

test("revealing a valid word plays the coin, an invalid word the invalid sample, and an empty slot nothing", () => {
  const prefs = { soundValidationEnabled: true, soundInvalidErrorEnabled: true };
  assert.equal(getThreeWordsRecapSound({ word: "chat", valid: true }, prefs).key, SFX_KEYS.vocabCling);
  assert.equal(getThreeWordsRecapSound({ word: "chaz", valid: false }, prefs).key, SFX_KEYS.invalidWord);
  assert.equal(getThreeWordsRecapSound({ word: "", valid: false }, prefs), null);
  assert.equal(getThreeWordsRecapSound({ word: "chat", valid: true }, { ...prefs, isSfxMuted: true }), null);
  assert.equal(getThreeWordsRecapSound({ word: "chat", valid: true }, { ...prefs, soundValidationEnabled: false }), null);
  assert.equal(getThreeWordsRecapSound({ word: "chaz", valid: false }, { ...prefs, soundInvalidErrorEnabled: false }), null);
});
