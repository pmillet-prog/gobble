import test from "node:test";
import assert from "node:assert/strict";
import { createWheelSoundtrack } from "./createWheelSoundtrack.js";
import { resultSoundVariant } from "./wheelSoundPlan.js";

function harness(random = () => 0) {
  const tracks = new Map();
  const engine = createWheelSoundtrack({ urls: { intro: "intro", spin: "music", drums: "drums",
    results: Object.fromEntries(["small", "good", "jackpot", "bonus", "bankrupt", "exchange"].map(id => [id, id])),
    audience: { low1: "audience-low1", low2: "audience-low2", honorable: "audience-honorable", fiveHundred: "audience-500", top: "audience-top" } }, random,
    createContext: () => ({ state: "running", decodeAudioData: async () => ({ duration: 5 }), close: async () => {} }),
    fetchAudio: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
    makeTrack(options) {
      const track = { options, calls: [], prepare() {}, sync(value) { this.calls.push(value); },
        setMuted(value) { this.muted = value; }, setSuspended(value) { this.suspended = value; }, dispose() { this.disposed = true; } };
      tracks.set(options.url, track); return track;
    },
  });
  void engine.unlock();
  return { engine, tracks, last: id => tracks.get(id).calls.at(-1),
    spin(elapsed, speed, id = 1) { engine.handleWheel({ type: "spin", progress: { phase: "spinning", id, elapsed, velocity: speed * Math.PI * 2 } }); },
    phase(phase, result = null) { engine.handleWheel({ type: "phase", view: { phase, result } }); },
    camera(sequence, time, playing = true) { engine.syncCamera({ sequence, time, playing }); },
  };
}

test("drums start during the physical slowdown and outlive the camera's three seconds until actual rest", () => {
  const app = harness(); app.phase("aiming"); assert.equal(app.tracks.get("music").calls.length, 0);
  app.spin(0, 2); assert.equal(app.last("music").active, true); assert.equal(app.last("drums").active, false);
  app.camera("launch", 0); app.camera("launch", 3, false);
  assert.equal(app.last("drums").active, false, "Camera time alone cannot start the roll.");
  app.spin(8, 0.15); assert.equal(app.last("drums").active, true); assert.equal(app.last("drums").time, 0);
  assert.equal(app.last("music").level, 0.28);
  app.spin(14, -0.4); assert.equal(app.last("drums").active, true); assert.equal(app.last("drums").time, 6);
  assert.equal(app.tracks.get("drums").options.loop, true);
  app.phase("finished", { kind: "bonus" });
  assert.equal(app.last("music").active, false); assert.equal(app.last("drums").active, false);
  app.camera("results", 0); assert.equal(app.last("bonus").active, true); assert.equal(app.last("bankrupt").active, false);
});

test("a new throw resets the suspense latch, and result playback follows scrubbing / mute", () => {
  const app = harness(); app.spin(10, 0.1); app.phase("finished", { kind: "bankrupt" });
  app.camera("results", 2); const key = app.last("bankrupt").key;
  app.camera("results", 1, false); assert.equal(app.last("bankrupt").active, false);
  app.camera("results", 1); assert.equal(app.last("bankrupt").active, true); assert.notEqual(app.last("bankrupt").key, key);
  app.phase("ready"); app.spin(0, 2, 2); assert.equal(app.last("drums").active, false); assert.equal(app.last("music").level, 1);
  app.engine.setMuted(true); assert.ok([...app.tracks.values()].every(track => track.muted));
  app.engine.setHidden(true); assert.ok([...app.tracks.values()].every(track => track.suspended));
  app.engine.dispose(); assert.ok([...app.tracks.values()].every(track => track.disposed));
});

test("result sounds distinguish modest gains, stronger gains, jackpot and special outcomes", () => {
  assert.equal(resultSoundVariant(null), null);
  assert.equal(resultSoundVariant({ kind: "pass", amount: 0 }), null);
  assert.equal(resultSoundVariant({ kind: "amount", amount: 100 }), "small");
  assert.equal(resultSoundVariant({ kind: "amount", amount: 500 }), "good");
  assert.equal(resultSoundVariant({ kind: "amount", amount: 1000 }), "jackpot");
  for (const kind of ["bonus", "bankrupt", "exchange"]) assert.equal(resultSoundVariant({ kind }), kind);
});

test("prefetch and StrictMode-style disposal never create an AudioContext; a gesture creates exactly one", async () => {
  let contexts = 0, fetches = 0, closed = 0, muted;
  const options = { urls: { intro: "intro", spin: "spin", drums: "drums", results: {}, audience: {} },
    fetchAudio: async () => { fetches++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; },
    createContext: () => { contexts++; return { state: "running", decodeAudioData: async () => ({ duration: 5 }), close: async () => { closed++; } }; },
    makeTrack: () => ({ prepare() {}, sync() {}, setMuted(value) { muted = value; }, setSuspended() {}, dispose() {} }),
  };
  const cancelled = createWheelSoundtrack(options); cancelled.dispose(); await cancelled.unlock();
  assert.equal(contexts, 0); assert.equal(fetches, 0);
  const player = createWheelSoundtrack(options); player.setMuted(true); player.prepare();
  await Promise.resolve(); assert.equal(contexts, 0); assert.equal(fetches, 1);
  await player.unlock(); await player.unlock();
  assert.equal(contexts, 1); assert.equal(fetches, 1); assert.equal(muted, true);
  player.dispose(); assert.equal(closed, 1);
});

test("the audience reacts at actual rest even while the camera launch shot is still running", () => {
  const app = harness(() => 0.9);
  app.spin(0, 2); app.camera("launch", 0.3); app.spin(9, 0);
  assert.ok(!app.last("audience-low2")?.active, "Zero speed during a pawl hesitation is not a result.");
  app.phase("finished", { kind: "amount", amount: 150 });
  assert.equal(app.last("audience-low2").active, true);
  assert.equal(app.last("drums").active, false);
  app.camera("launch", 2); app.camera("results", 0); app.camera("results", 2);
  app.camera("results", 0, false); app.phase("finished", { kind: "amount", amount: 150 });
  assert.equal(app.tracks.get("audience-low2").calls.filter(call => call.active).length, 1);
  app.phase("ready"); assert.equal(app.last("audience-low2").active, false);
  app.spin(0, 2, 2); app.phase("finished", { kind: "amount", amount: 400 });
  assert.equal(app.last("audience-500").active, true);
  app.engine.dispose();
});
