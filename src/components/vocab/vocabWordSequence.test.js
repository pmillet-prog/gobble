import test from "node:test";
import assert from "node:assert/strict";
import { createVocabWordSequence } from "./vocabWordSequence.js";

test("one weekly discovery produces one display despite accents and duplicate entries", () => {
  const sequence = createVocabWordSequence(["ZÈBRE", "zebre"]);
  const displays = [];
  for (let elapsed = 0; elapsed <= 5000; elapsed += 16) {
    const frame = sequence.advance(elapsed / 4000, elapsed);
    if (frame.changed) displays.push(frame.word);
  }
  assert.deepEqual(displays, ["zebre"]);
  assert.equal(sequence.advance(1, 6000).complete, true);
});

test("all discoveries are displayed alphabetically exactly once, including after a stalled frame", () => {
  const sequence = createVocabWordSequence(["zèbre", "âne", "ÉCOLE", "ecole", "", null]);
  const first = sequence.advance(0, 0);
  assert.equal(first.word, "");
  const stalled = sequence.advance(1, 5000);
  assert.equal(stalled.word, "ane");
  assert.equal(stalled.displayed, 1);
  assert.equal(stalled.complete, false);
  assert.equal(sequence.advance(1, 5016).changed, false);
  const second = sequence.advance(1, 5080);
  const third = sequence.advance(1, 5160);
  assert.deepEqual([stalled.word, second.word, third.word], ["ane", "ecole", "zebre"]);
  assert.equal(third.complete, true);
  assert.equal(sequence.advance(1, 6000).changed, false);
});

test("an empty weekly list has no word display or beep", () => {
  const sequence = createVocabWordSequence([]);
  for (const progress of [0, .2, .5, 1]) {
    assert.deepEqual(sequence.advance(progress, progress * 2000), {
      changed: false, displayed: 0, word: "", complete: true, isSeasonNew: false, seasonDisplayed: 0,
    });
  }
});

test("weekly words drive each step and only seasonal discoveries advance the season counter", () => {
  const sequence = createVocabWordSequence(["zèbre", "bateau", "âne", "ecole"], ["ÉCOLE", "ZÈBRE"]);
  assert.equal(sequence.length, 4);
  assert.equal(sequence.seasonLength, 2);
  const frames = [0, 80, 160, 240].map(now => sequence.advance(1, now));
  assert.deepEqual(frames.map(frame => frame.word), ["ane", "bateau", "ecole", "zebre"]);
  assert.deepEqual(frames.map(frame => frame.isSeasonNew), [false, false, true, true]);
  assert.deepEqual(frames.map(frame => frame.seasonDisplayed), [0, 0, 1, 2]);
  assert.deepEqual(frames.map(frame => frame.displayed), [1, 2, 3, 4]);
  assert.equal(sequence.advance(1, 500).changed, false);
});

test("weekly-only discoveries all display even with no seasonal progress", () => {
  const sequence = createVocabWordSequence(["chat", "ane"], []);
  const frames = [0, 80].map(now => sequence.advance(1, now));
  assert.deepEqual(frames.map(frame => frame.word), ["ane", "chat"]);
  assert.ok(frames.every(frame => frame.changed && !frame.isSeasonNew && frame.seasonDisplayed === 0));
});
