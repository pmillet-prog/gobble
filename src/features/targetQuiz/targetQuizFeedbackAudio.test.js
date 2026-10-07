import test from "node:test";
import assert from "node:assert/strict";
import { createTargetQuizFeedbackAudio, TARGET_QUIZ_FEEDBACK_AUDIO_KEYS, TARGET_QUIZ_FEEDBACK_AUDIO_MANIFEST } from "./targetQuizFeedbackAudio.js";

function fixture({ load = async () => {} } = {}) {
  const listeners = new Set();
  const ctx = {
    state: "running",
    addEventListener(event, callback) { assert.equal(event, "statechange"); listeners.add(callback); },
    removeEventListener(event, callback) { assert.equal(event, "statechange"); listeners.delete(callback); },
  };
  const buffers = new Map(Object.values(TARGET_QUIZ_FEEDBACK_AUDIO_KEYS).map(key => [key, { duration: 2 }]));
  const calls = [], loads = [], handles = [];
  let available = true;
  let muted = false;
  const manager = {
    registerManifest(manifest) { assert.equal(manifest, TARGET_QUIZ_FEEDBACK_AUDIO_MANIFEST); },
    async preload(options) { loads.push(options); await load(); },
    getSfxBuffer: key => buffers.get(key),
    getAudioOutput: () => available && ctx.state === "running" ? { ctx, output: {} } : null,
    playSfx(key, options) {
      calls.push([key, options]);
      if (muted) return null;
      const source = { disconnected: false, disconnect() { this.disconnected = true; } };
      const gainNode = { disconnected: false, disconnect() { this.disconnected = true; } };
      const handle = { ctx, source, gainNode, stops: [], ended: 0, stop(at) { this.stops.push(at); } };
      source.onended = () => { handle.ended += 1; source.disconnect(); gainNode.disconnect(); };
      handles.push(handle);
      return handle;
    },
  };
  const audio = createTargetQuizFeedbackAudio({ assetManager: manager });
  return { audio, ctx, listeners, buffers, calls, loads, handles,
    setAvailable: value => { available = value; }, setMuted: value => { muted = value; } };
}

test("preparation loads only the two verdict assets and never plays a late result", async () => {
  let finish;
  const f = fixture({ load: () => new Promise(resolve => { finish = resolve; }) });
  const loading = f.audio.prepare();
  assert.equal(f.audio.prepare(), loading);
  await Promise.resolve();
  assert.equal(f.loads.length, 1);
  assert.deepEqual(f.loads[0].keys, ["target-quiz:correct", "target-quiz:wrong"]);
  finish();
  assert.equal(await loading, true);
  assert.equal(f.calls.length, 0);
  f.audio.dispose();
});

test("verdicts use rate one without queuing, and replace only their preceding feedback voice", () => {
  const f = fixture();
  const correct = f.audio.play(true);
  assert.deepEqual(f.calls[0], ["target-quiz:correct", { rate: 1, allowQueue: false }]);
  assert.equal(f.listeners.size, 1);
  const wrong = f.audio.play(false);
  assert.deepEqual(f.calls[1], ["target-quiz:wrong", { rate: 1, allowQueue: false }]);
  assert.deepEqual(correct.stops, [0]);
  assert.equal(correct.source.disconnected, true);
  assert.equal(correct.gainNode.disconnected, true);
  assert.equal(correct.source.onended, null);
  assert.equal(f.listeners.size, 1);
  assert.equal(wrong.source.disconnected, false);
  f.audio.stop();
  f.audio.stop();
  assert.deepEqual(wrong.stops, [0]);
  assert.equal(wrong.source.disconnected, true);
  assert.equal(wrong.gainNode.disconnected, true);
  assert.equal(f.listeners.size, 0);
});

test("missing, locked or muted sounds are skipped synchronously without playback after preparation", async () => {
  const f = fixture();
  f.setAvailable(false);
  assert.equal(f.audio.play(true), null);
  assert.equal(f.calls.length, 0);
  f.setAvailable(true);
  f.buffers.delete("target-quiz:wrong");
  assert.equal(f.audio.play(false), null);
  assert.equal(await f.audio.prepare(), false);
  assert.equal(f.calls.length, 0);
  f.setMuted(true);
  assert.equal(f.audio.play(true), null);
  assert.equal(f.listeners.size, 0);
  f.audio.dispose();
});

test("natural end preserves the manager cleanup and removes the context listener", () => {
  const f = fixture();
  const handle = f.audio.play(true);
  handle.source.onended();
  assert.equal(handle.ended, 1);
  assert.equal(handle.source.onended, null);
  assert.equal(handle.source.disconnected, true);
  assert.equal(handle.gainNode.disconnected, true);
  assert.equal(f.listeners.size, 0);
  f.audio.stop();
  assert.deepEqual(handle.stops, []);
});

for (const state of ["suspended", "closed"]) {
  test(`a ${state} context stops and disconnects feedback without retaining listeners`, () => {
    const f = fixture();
    const handle = f.audio.play(false);
    f.ctx.state = state;
    for (const callback of [...f.listeners]) callback();
    assert.deepEqual(handle.stops, [0]);
    assert.equal(handle.source.disconnected, true);
    assert.equal(handle.gainNode.disconnected, true);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.audio.play(true), null);
    f.audio.dispose();
  });
}

test("dispose invalidates preparation and prevents any later feedback", async () => {
  let finish;
  const f = fixture({ load: () => new Promise(resolve => { finish = resolve; }) });
  const handle = f.audio.play(true);
  const loading = f.audio.prepare();
  await Promise.resolve();
  f.audio.dispose();
  finish();
  assert.equal(await loading, false);
  assert.deepEqual(handle.stops, [0]);
  assert.equal(handle.source.disconnected, true);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.audio.play(false), null);
  assert.equal(await f.audio.prepare(), false);
});
