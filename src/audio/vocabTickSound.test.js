import assert from "node:assert/strict";
import test from "node:test";
import { getVocabTickFrequency } from "./vocabTickSound.js";

test("weekly discoveries retain their rising notes; seasonal discoveries sound one octave higher", () => {
  for (const [index, frequency] of [[1, 220], [10, 440], [11, 440], [20, 660], [40, 660]]) {
    assert.equal(getVocabTickFrequency(index), frequency);
    assert.equal(getVocabTickFrequency(index, { isSeasonNew: true }), frequency * 2);
  }
});

test("no counted word means no vocabulary beep", () => {
  for (const index of [0, -1, null, undefined, NaN, Infinity]) {
    assert.equal(getVocabTickFrequency(index, { isSeasonNew: true }), 0);
  }
});
