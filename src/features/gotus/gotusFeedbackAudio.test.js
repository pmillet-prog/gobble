import test from "node:test";
import assert from "node:assert/strict";
import { createGotusFeedbackPlayer, gotusVictoryLetterAt, GOTUS_ARPEGGIOS } from "./gotusFeedbackAudio.js";

test("all four recorded arpeggios map to six successive neutral letters", () => {
  assert.equal(gotusVictoryLetterAt(0), -1);
  for (const [start, end] of GOTUS_ARPEGGIOS) {
    for (let letter = 0; letter < 6; letter++) assert.equal(gotusVictoryLetterAt(start + (letter + .5) * (end - start) / 6), letter);
  }
  assert.equal(gotusVictoryLetterAt(1.953), -1);
});

test("victory follows shared audio clock, muting preserves timing and cleanup releases all sources", () => {
  const frames = new Map(), visuals = [], sources = [];
  let id = 0;
  const ctx = { state: "running", currentTime: 5,
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBufferSource() { const source = { connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } }; sources.push(source); return source; },
  };
  const assetManager = { registerManifest() {}, preload: async () => true, getSfxBuffer: key => ({ key }), getAudioOutput: () => ({ ctx, output: {} }) };
  const player = createGotusFeedbackPlayer({ assetManager, onVictoryFrame: value => visuals.push(value),
    requestFrame: fn => { frames.set(++id, fn); return id; }, cancelFrame: token => frames.delete(token), now: () => 0,
  });
  player.cue({ type: "letter", mark: "correct" });
  player.cue({ type: "won", row: 5 });
  assert.equal(sources[0].stopped, true);
  const tick = seconds => { ctx.currentTime = seconds; const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn()); };
  tick(5.05); assert.deepEqual(visuals.at(-1), { row: 5, column: 0 });
  player.setEnabled(false); tick(6.2); assert.deepEqual(visuals.at(-1), { row: 5, column: 2 });
  tick(6.96); assert.equal(frames.size, 0); assert.equal(visuals.at(-1), null);
  player.dispose(); assert.ok(sources.every(source => source.stopped));
});
