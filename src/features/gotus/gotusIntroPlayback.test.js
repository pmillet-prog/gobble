import test from "node:test";
import assert from "node:assert/strict";
import { createGotusIntroPlayback, GOTUS_INTRO_DURATION_MS } from "./gotusIntroPlayback.js";

function fixture({ duration = 1.419416667, preload = async () => {} } = {}) {
  const frames = new Map(), timers = new Map(), sources = [], gains = [], visuals = [];
  let id = 0, wall = 0, finishes = 0;
  const ctx = { state: "running", currentTime: 10,
    createGain() { const gain = { gain: { value: 1 }, connect() {}, disconnect() { this.disconnected = true; } }; gains.push(gain); return gain; },
    createBufferSource() {
      const source = { connect() {}, disconnect() { this.disconnected = true; },
        start(at) { this.at = at; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
  };
  const player = createGotusIntroPlayback({
    assetManager: { registerManifest() {}, preload, getSfxBuffer: () => duration ? { duration } : null,
      getAudioOutput: () => ({ ctx, output: {} }) },
    onFrame: value => visuals.push(value), onFinish: () => finishes++, now: () => wall,
    requestFrame: fn => { frames.set(++id, fn); return id; }, cancelFrame: token => frames.delete(token),
    schedule: fn => { timers.set(++id, fn); return id; }, cancel: token => timers.delete(token),
  });
  return { player, ctx, sources, gains, visuals, frames, timers, finishes: () => finishes,
    tick(audioSeconds, wallMs) {
      ctx.currentTime = audioSeconds; wall = wallMs;
      const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());
    },
  };
}

test("intro zoom follows the decoded jingle clock and releases all playback resources", async () => {
  const f = fixture();
  await f.player.start(); await f.player.start();
  assert.equal(f.sources.length, 1);
  f.tick(10.7, 5000);
  assert.ok(Math.abs(f.visuals.at(-1).progress - .7 / 1.419416667) < .00001);
  f.player.setEnabled(false);
  assert.equal(f.gains[0].gain.value, 0);
  f.tick(11.42, 6000);
  assert.equal(f.visuals.at(-1).progress, 1);
  assert.equal(f.finishes(), 1);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.ok(f.sources[0].stopped && f.sources[0].disconnected && f.gains[0].disconnected);
});

test("muted intro keeps the same visual duration without starting a sound", async () => {
  const f = fixture();
  f.player.setEnabled(false); await f.player.start();
  f.tick(10, 710);
  assert.ok(f.visuals.at(-1).progress > .49 && f.visuals.at(-1).progress < .51);
  f.tick(10, 1420);
  assert.equal(f.sources.length, 0);
  assert.equal(f.finishes(), 1);
});

test("leaving during preparation prevents a late sound or animation", async () => {
  let resolve;
  const f = fixture({ preload: () => new Promise(done => { resolve = done; }) });
  const pending = f.player.start();
  await Promise.resolve(); f.player.dispose(); resolve(); await pending;
  assert.equal(f.sources.length, 0);
  assert.equal(f.visuals.length, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.finishes(), 0);
});

test("unavailable audio has a bounded wait and the recorded visual duration", async () => {
  const f = fixture({ duration: 0, preload: () => new Promise(() => {}) });
  const pending = f.player.start();
  [...f.timers.values()].forEach(fn => fn()); await pending;
  assert.equal(f.visuals.at(-1).durationMs, GOTUS_INTRO_DURATION_MS);
  f.tick(10, GOTUS_INTRO_DURATION_MS + 1);
  assert.equal(f.finishes(), 1);
});

test("closing or suspending audio cannot leave a running intro behind", async () => {
  for (const action of ["dispose", "suspend"]) {
    const f = fixture(); await f.player.start();
    if (action === "dispose") f.player.dispose();
    else { f.ctx.state = "suspended"; f.tick(10.2, 200); }
    assert.equal(f.frames.size, 0);
    assert.ok(f.sources[0].stopped && f.sources[0].disconnected);
    assert.equal(f.finishes(), action === "suspend" ? 1 : 0);
  }
});
