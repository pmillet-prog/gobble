import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createMotusFeedback, victoryLetterAt, VICTORY_ARPEGGIOS } from "./feedback.mjs";

function harness({ available = true, fetchSound } = {}) {
  const sources = [], frames = new Map(), visuals = [];
  let id = 0, wallTime = 0;
  const output = { gain: { value: 1 }, connect() {}, disconnect() {} };
  const context = {
    state: "running", currentTime: 0, destination: {},
    createGain: () => output,
    async decodeAudioData(bytes) { return { name: new TextDecoder().decode(bytes) }; },
    async resume() { context.state = "running"; },
    async close() { context.state = "closed"; },
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start(time) { this.startedAt = time; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    },
  };
  const feedback = createMotusFeedback({
    createContext: () => available ? context : null,
    fetchSound: fetchSound || (async url => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer })),
    requestFrame: fn => { frames.set(++id, fn); return id; }, cancelFrame: token => frames.delete(token),
    now: () => wallTime, onVictoryFrame: value => visuals.push(value),
  });
  const tick = (audioTime, milliseconds = 0) => {
    context.currentTime = audioTime; wallTime = milliseconds;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn());
  };
  return { feedback, context, output, sources, frames, visuals, tick };
}

test("each recorded arpeggio produces exactly one six-letter cascade", () => {
  assert.equal(victoryLetterAt(0), -1);
  for (const { start, end } of VICTORY_ARPEGGIOS) {
    const duration = end - start;
    for (let column = 0; column < 6; column++) {
      assert.equal(victoryLetterAt(start + (column + 0.5) * duration / 6), column);
    }
  }
  assert.equal(victoryLetterAt(1.953), -1);
  assert.equal(victoryLetterAt(2.612), -1);
});

test("letter cues use their own samples and discarded downloads do not replay late letters", async () => {
  const h = harness();
  h.feedback.cue({ type: "letter", mark: "correct" });
  await setImmediate();
  assert.equal(h.sources.length, 0);
  for (const mark of ["correct", "present", "absent"]) h.feedback.cue({ type: "letter", mark });
  assert.deepEqual(h.sources.map(source => source.buffer.name.split("/").at(-1)), [
    "motus-lettre-bonne-reverb.mp3", "motus-lettre-mal-placee-reverb.mp3", "motus-lettre-non-valide-reverb.mp3",
  ]);
  h.sources[0].onended();
  h.feedback.dispose();
  assert.equal(h.sources[0].stopped, undefined);
  assert.ok(h.sources.slice(1).every(source => source.stopped));
});

test("victory follows the audio clock across delayed frames and muting", async () => {
  const h = harness();
  await setImmediate();
  h.context.currentTime = 10;
  h.feedback.cue({ type: "won", row: 5 });
  await setImmediate();
  assert.equal(h.sources.length, 1);
  assert.match(h.sources[0].buffer.name, /motus-mot-trouve\.mp3$/);
  h.tick(10.05, 9000);
  assert.deepEqual(h.visuals.at(-1), { row: 5, column: 0 });
  h.feedback.setEnabled(false);
  assert.equal(h.output.gain.value, 0);
  h.tick(11.2, 9001);
  assert.deepEqual(h.visuals.at(-1), { row: 5, column: 2 });
  assert.equal(h.frames.size, 1);
  h.tick(11.96);
  assert.equal(h.visuals.at(-1), null);
  assert.equal(h.frames.size, 0);
  assert.equal(h.sources[0].stopped, undefined, "coin sound can finish after the cascade");
  h.feedback.setEnabled(true);
  assert.equal(h.output.gain.value, 1);
  h.feedback.dispose();
});

test("new round and disposal cancel sounds, pending frames and stale callbacks", async () => {
  const h = harness();
  await setImmediate();
  h.feedback.cue({ type: "won", row: 1 });
  await setImmediate();
  const stale = [...h.frames.values()][0];
  h.feedback.cue({ type: "reset" });
  assert.equal(h.frames.size, 0);
  assert.equal(h.sources[0].stopped, true);
  const count = h.visuals.length;
  stale();
  assert.equal(h.visuals.length, count);
  assert.equal(h.frames.size, 0);
  h.feedback.dispose();
  h.feedback.cue({ type: "won", row: 1 });
  await setImmediate();
  assert.equal(h.sources.length, 1);
  assert.equal(h.context.state, "closed");
});

test("reset during sound loading cannot start the previous victory later", async () => {
  let finishDownload;
  const download = new Promise(resolve => { finishDownload = resolve; });
  const h = harness({ fetchSound: async () => { await download; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
  h.feedback.cue({ type: "won", row: 0 });
  h.feedback.cue({ type: "reset" });
  finishDownload();
  await setImmediate();
  assert.equal(h.sources.length, 0);
  assert.equal(h.frames.size, 0);
  h.feedback.dispose();
});

test("unavailable audio still permits the complete visual celebration", async () => {
  const h = harness({ available: false });
  h.feedback.unlock();
  h.feedback.cue({ type: "won", row: 2 });
  await setImmediate();
  h.tick(0, 50);
  assert.deepEqual(h.visuals.at(-1), { row: 2, column: 0 });
  h.tick(0, 1960);
  assert.equal(h.visuals.at(-1), null);
  assert.equal(h.frames.size, 0);
  h.feedback.dispose();
});

test("loss plays only its terminal sample and starts no letter cascade", async () => {
  const h = harness();
  await setImmediate();
  h.feedback.cue({ type: "lost", row: 5 });
  await setImmediate();
  assert.equal(h.sources.length, 1);
  assert.match(h.sources[0].buffer.name, /motus-perdu\.mp3$/);
  assert.equal(h.frames.size, 0);
  assert.deepEqual(h.visuals, [null]);
  h.feedback.dispose();
});
