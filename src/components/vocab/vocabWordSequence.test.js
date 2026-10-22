import test from "node:test";
import assert from "node:assert/strict";
import { createVocabWordSequence } from "./vocabWordSequence.js";

function display(sequence, progress, now) {
  const frame = sequence.advance(progress, now);
  if (frame.changed) sequence.commit(frame.displayed, now);
  return frame;
}

test("one weekly discovery produces one display despite accents and duplicate entries", () => {
  const sequence = createVocabWordSequence(["ZÈBRE", "zebre"]);
  const displays = [];
  for (let elapsed = 0; elapsed <= 5000; elapsed += 16) {
    const frame = display(sequence, elapsed / 4000, elapsed);
    if (frame.changed) displays.push(frame.word);
  }
  assert.deepEqual(displays, ["zebre"]);
  assert.equal(sequence.advance(1, 6000).complete, true);
});

test("all discoveries are displayed alphabetically exactly once, including after a stalled frame", () => {
  const sequence = createVocabWordSequence(["zèbre", "âne", "ÉCOLE", "ecole", "", null]);
  const first = sequence.advance(0, 0);
  assert.equal(first.word, "");
  const stalled = display(sequence, 1, 5000);
  assert.equal(stalled.word, "ane");
  assert.equal(stalled.displayed, 1);
  assert.equal(stalled.complete, false);
  assert.equal(sequence.advance(1, 5016).changed, false);
  const second = display(sequence, 1, 5080);
  const third = display(sequence, 1, 5160);
  assert.deepEqual([stalled.word, second.word, third.word], ["ane", "ecole", "zebre"]);
  assert.equal(sequence.advance(1, 5160).complete, true);
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
  const frames = [0, 80, 160, 240].map(now => display(sequence, 1, now));
  assert.deepEqual(frames.map(frame => frame.word), ["ane", "bateau", "ecole", "zebre"]);
  assert.deepEqual(frames.map(frame => frame.isSeasonNew), [false, false, true, true]);
  assert.deepEqual(frames.map(frame => frame.seasonDisplayed), [0, 0, 1, 2]);
  assert.deepEqual(frames.map(frame => frame.displayed), [1, 2, 3, 4]);
  assert.equal(sequence.advance(1, 500).changed, false);
});

test("weekly-only discoveries all display even with no seasonal progress", () => {
  const sequence = createVocabWordSequence(["chat", "ane"], []);
  const frames = [0, 80].map(now => display(sequence, 1, now));
  assert.deepEqual(frames.map(frame => frame.word), ["ane", "chat"]);
  assert.ok(frames.every(frame => frame.changed && !frame.isSeasonNew && frame.seasonDisplayed === 0));
});

test("a delayed React commit cannot overwrite or skip pending words", () => {
  const sequence = createVocabWordSequence(["ane", "chat", "zebre"], ["chat"]);
  const first = sequence.advance(1, 0);
  assert.equal(first.word, "ane");
  for (const now of [80, 160, 240, 500]) {
    const pending = sequence.advance(1, now);
    assert.equal(pending.changed, false);
    assert.equal(pending.word, "ane");
    assert.equal(pending.displayed, 1);
    assert.equal(pending.seasonDisplayed, 0);
  }
  sequence.commit(1, 500);
  assert.equal(sequence.advance(1, 579).changed, false, "keep each word visible for 80 ms after its commit");
  const second = display(sequence, 1, 580);
  assert.equal(second.word, "chat");
  assert.equal(second.seasonDisplayed, 1);
  const third = sequence.advance(1, 660);
  assert.equal(third.word, "zebre");
  assert.equal(third.complete, false, "do not finish while the final word is still pending");
  sequence.commit(3, 1000);
  assert.equal(sequence.advance(1, 1000).complete, true);
});

test("stale commits cannot acknowledge a different pending word", () => {
  const sequence = createVocabWordSequence(["ane", "chat"]);
  display(sequence, 1, 0);
  sequence.advance(1, 80);
  sequence.commit(1, 100);
  sequence.commit(3, 200);
  assert.equal(sequence.advance(1, 500).complete, false);
  sequence.commit(2, 500);
  assert.equal(sequence.advance(1, 500).complete, true);
});
