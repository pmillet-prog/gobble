import test from "node:test";
import assert from "node:assert/strict";
import { createTargetQuizTimeoutAudio, TARGET_QUIZ_TIMEOUT_AUDIO_KEY, TARGET_QUIZ_TIMEOUT_AUDIO_MANIFEST } from "./targetQuizTimeoutAudio.js";

function fixture(t, { preload = async () => {} } = {}) {
  let now = 1000;
  let muted = false;
  let loaded = true;
  let timerId = 0;
  const timers = new Map(), visibilityListeners = new Set(), contextListeners = new Set(), muteListeners = new Set();
  const calls = [], handles = [], loads = [];
  const visibility = {
    hidden: false,
    addEventListener(event, fn) { assert.equal(event, "visibilitychange"); visibilityListeners.add(fn); },
    removeEventListener(event, fn) { assert.equal(event, "visibilitychange"); visibilityListeners.delete(fn); },
  };
  const ctx = {
    state: "running",
    addEventListener(event, fn) { assert.equal(event, "statechange"); contextListeners.add(fn); },
    removeEventListener(event, fn) { assert.equal(event, "statechange"); contextListeners.delete(fn); },
  };
  const assetManager = {
    registerManifest(manifest) { assert.equal(manifest, TARGET_QUIZ_TIMEOUT_AUDIO_MANIFEST); },
    async preload(options) { loads.push(options); await preload(); },
    getAudioOutput: () => ctx.state === "running" ? { ctx, output: {} } : null,
    getSfxBuffer: key => loaded && key === TARGET_QUIZ_TIMEOUT_AUDIO_KEY ? { duration: 4.6498 } : null,
    playSfx(key, options) {
      calls.push(["play", key, options]);
      const source = { disconnected: false, disconnect() { this.disconnected = true; } };
      const gainNode = { disconnected: false, disconnect() { this.disconnected = true; } };
      const handle = { ctx, source, gainNode, stops: [], ended: 0, stop(at) { this.stops.push(at); } };
      source.onended = () => { handle.ended += 1; };
      handles.push(handle);
      return handle;
    },
  };
  const options = {
    assetManager, getNow: () => now, canPlay: () => !muted,
    onTimeout: () => calls.push(["stop-music-and-verdict"]), document: visibility,
    subscribeMute(fn) { muteListeners.add(fn); return () => muteListeners.delete(fn); },
    setTimeoutFn(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeoutFn(id) { timers.delete(id); },
  };
  const audio = createTargetQuizTimeoutAudio(options);
  t.after(() => audio.cancel());
  return {
    audio, options, ctx, visibility, calls, handles, loads, timers, visibilityListeners, contextListeners, muteListeners,
    setNow: value => { now = value; }, setLoaded: value => { loaded = value; },
    setMuted(value) { muted = value; for (const fn of [...muteListeners]) fn(); },
    fireTimer() {
      assert.equal(timers.size, 1);
      const [id, { fn }] = timers.entries().next().value;
      timers.delete(id);
      fn();
    },
  };
}

test("deadline stops the old sounds first and plays the full cue once, surviving normal view cleanup", t => {
  const f = fixture(t);
  assert.equal(f.audio.arm(2000), true);
  f.setNow(2000);
  f.fireTimer();
  assert.deepEqual(f.calls, [
    ["stop-music-and-verdict"],
    ["play", "target-quiz:out-of-time", { rate: 1, allowQueue: false }],
  ]);
  f.audio.leave();
  f.audio.leave();
  assert.equal(f.audio.arm(3000), false);
  assert.equal(f.handles.length, 1);
  const handle = f.handles[0];
  assert.deepEqual(handle.stops, [], "no duration trim or unmount interruption");
  handle.source.onended();
  assert.equal(handle.ended, 1);
  assert.equal(handle.source.disconnected, true);
  assert.equal(handle.gainNode.disconnected, true);
  assert.equal(handle.source.onended, null);
  assert.equal(f.contextListeners.size + f.visibilityListeners.size + f.muteListeners.size + f.timers.size, 0);
});

test("unmount at the deadline covers the timer race, while an earlier departure cancels it", t => {
  const f = fixture(t);
  f.audio.arm(2000);
  f.setNow(1999);
  f.audio.leave();
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.length, 0);
  f.audio.arm(3000);
  f.setNow(3000);
  f.audio.leave();
  assert.equal(f.timers.size, 0);
  assert.equal(f.handles.length, 1);
});

test("a late initial mount stays silent, but moving an armed deadline to now expires immediately", t => {
  const f = fixture(t);
  assert.equal(f.audio.arm(999), false);
  assert.equal(f.audio.arm(1000), false);
  f.audio.leave();
  assert.equal(f.calls.length, 0);
  f.audio.arm(9000);
  assert.equal(f.audio.arm(1000), true);
  assert.equal(f.handles.length, 1);
  assert.equal(f.timers.size, 0);
});

test("the timer rechecks server time and rearms after a backwards clock adjustment", t => {
  const f = fixture(t);
  f.audio.arm(3000);
  f.setNow(2500);
  f.fireTimer();
  assert.equal(f.calls.length, 0);
  assert.equal(f.timers.values().next().value.delay, 500);
  f.audio.arm(4000);
  assert.equal(f.timers.size, 1);
  assert.equal(f.timers.values().next().value.delay, 1500);
  f.setNow(4000);
  f.fireTimer();
  assert.equal(f.handles.length, 1);
});

for (const unavailable of ["muted", "hidden", "locked", "not-loaded"]) {
  test(`${unavailable} audio still stops music at expiry without queuing a late cue`, async t => {
    const f = fixture(t);
    if (unavailable === "muted") f.setMuted(true);
    if (unavailable === "hidden") f.visibility.hidden = true;
    if (unavailable === "locked") f.ctx.state = "suspended";
    if (unavailable === "not-loaded") f.setLoaded(false);
    f.audio.arm(2000);
    f.setNow(2000);
    f.fireTimer();
    assert.deepEqual(f.calls, [["stop-music-and-verdict"]]);
    f.setMuted(false);
    f.visibility.hidden = false;
    f.ctx.state = "running";
    f.setLoaded(true);
    assert.equal(await f.audio.prepare(), true);
    f.audio.leave();
    assert.equal(f.handles.length, 0);
  });
}

for (const interruption of ["muted", "hidden", "suspended", "closed", "cancelled"]) {
  test(`the detached cue releases its nodes and listeners when ${interruption}`, t => {
    const f = fixture(t);
    f.audio.arm(2000);
    f.setNow(2000);
    f.audio.leave();
    const handle = f.handles[0];
    if (interruption === "muted") f.setMuted(true);
    else if (interruption === "hidden") {
      f.visibility.hidden = true;
      for (const fn of [...f.visibilityListeners]) fn();
    } else if (interruption === "cancelled") f.audio.cancel();
    else {
      f.ctx.state = interruption;
      for (const fn of [...f.contextListeners]) fn();
    }
    assert.deepEqual(handle.stops, [0]);
    assert.equal(handle.source.disconnected, true);
    assert.equal(handle.gainNode.disconnected, true);
    assert.equal(f.contextListeners.size + f.visibilityListeners.size + f.muteListeners.size, 0);
  });
}

test("a newly armed session stops the previous view's retained cue", t => {
  const f = fixture(t);
  f.audio.arm(2000);
  f.setNow(2000);
  f.audio.leave();
  const other = createTargetQuizTimeoutAudio(f.options);
  t.after(() => other.cancel());
  other.arm(3000);
  assert.deepEqual(f.handles[0].stops, [0]);
  assert.equal(f.contextListeners.size + f.visibilityListeners.size + f.muteListeners.size, 0);
  f.setNow(3000);
  other.leave();
  assert.equal(f.handles.length, 2);
});

test("preparation is explicit, shared by concurrent callers, and never initiates playback", async t => {
  const f = fixture(t);
  const first = f.audio.prepare();
  assert.equal(f.audio.prepare(), first);
  assert.equal(await first, true);
  assert.equal(f.loads.length, 1);
  assert.deepEqual(f.loads[0].keys, [TARGET_QUIZ_TIMEOUT_AUDIO_KEY]);
  assert.equal(f.calls.length, 0);
});
