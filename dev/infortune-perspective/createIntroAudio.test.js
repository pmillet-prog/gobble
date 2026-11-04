import test from "node:test";
import assert from "node:assert/strict";
import { createIntroAudio, introAudioGain } from "./createIntroAudio.js";

function harness(initialState = "running", overrides = {}) {
  const statuses = [], voices = [], gains = [], events = new Map();
  const context = {
    state: initialState, currentTime: 0, destination: {},
    addEventListener(name, callback) { events.set(name, callback); }, removeEventListener(name) { events.delete(name); },
    decodeAudioData: async () => ({ duration: 5.1 }),
    async resume() { this.state = "running"; events.get("statechange")?.(); },
    async close() { this.state = "closed"; },
    createBufferSource() {
      const voice = { stops: 0, connect(node) { return node; }, disconnect() {},
        start(...args) { this.started = args; }, stop() { this.stops++; } };
      voices.push(voice); return voice;
    },
    createGain() {
      const points = [];
      const gain = { points, connect() {}, disconnect() {}, gain: {
        setValueAtTime: (value, time) => points.push(["set", value, time]),
        linearRampToValueAtTime: (value, time) => points.push(["ramp", value, time]),
      } }; gains.push(gain); return gain;
    },
  };
  const player = createIntroAudio({ url: "intro.mp3", createContext: () => context,
    fetchAudio: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    onStatus: value => statuses.push(value), ...overrides });
  return { player, context, voices, gains, statuses, events,
    sync(time, playing = true, sequence = "intro") { player.sync({ time, playing, sequence }); },
  };
}

test("the intro schedules its fade on the audio clock and is silent at five seconds", async () => {
  const app = harness(); await app.player.prepare(); app.sync(0);
  assert.deepEqual(app.voices[0].started, [0, 0, 5]);
  assert.deepEqual(app.gains[0].points, [["set", 0.75, 0], ["set", 0.75, 4], ["ramp", 0, 5]]);
  for (const time of [0.1, 1, 3, 4.5]) { app.context.currentTime = time; app.sync(time); }
  assert.equal(app.voices.length, 1, "Normal frames do not recreate voices or automate volume again.");
  assert.equal(introAudioGain(4.5), 0.375); assert.equal(introAudioGain(5), 0);
  app.sync(5); assert.equal(app.voices[0].stops, 1); app.player.dispose();
});

test("pause and seek resume from the camera time with the correct remaining fade", async () => {
  const app = harness(); await app.player.prepare(); app.sync(0); app.context.currentTime = 2; app.sync(2, false);
  app.context.currentTime = 20; app.sync(4.5);
  assert.deepEqual(app.voices[1].started, [20, 4.5, 0.5]);
  assert.deepEqual(app.gains[1].points, [["set", 0.375, 20], ["ramp", 0, 20.5]]);
  app.sync(0); assert.equal(app.voices[1].stops, 1); assert.deepEqual(app.voices[2].started, [20, 0, 5]);
  app.player.dispose();
});

test("muting, changing sequence and unmounting stop playback without late restarts", async () => {
  const app = harness(); await app.player.prepare(); app.sync(0); app.player.setMuted(true);
  app.context.currentTime = 4.2; app.sync(4.2); assert.equal(app.voices.length, 1);
  app.player.setMuted(false); assert.equal(app.voices.length, 2);
  assert.ok(Math.abs(app.gains[1].points[0][1] - 0.6) < 1e-8);
  app.sync(0, true, "launch"); assert.equal(app.voices[1].stops, 1);
  app.sync(0); app.player.dispose(); app.sync(0);
  assert.equal(app.voices.length, 3); assert.equal(app.voices[2].stops, 1);
  assert.equal(app.context.state, "closed"); assert.equal(app.events.size, 0);
});

test("a browser audio lock waits for a gesture and does not play an out-of-date intro", async () => {
  const app = harness("suspended"); await app.player.prepare(); app.sync(1);
  assert.equal(app.statuses.at(-1), "blocked"); assert.equal(app.voices.length, 0);
  await app.player.unlock(); assert.equal(app.statuses.at(-1), "ready");
  assert.deepEqual(app.voices[0].started, [0, 1, 4]);
  app.sync(5, false); await app.player.unlock(); assert.equal(app.voices.length, 1);
  app.player.dispose();
});

test("a missing sound reports failure, while cancellation discards an unfinished fetch", async () => {
  const failed = harness("running", { fetchAudio: async () => ({ ok: false }) });
  await failed.player.prepare(); assert.equal(failed.statuses.at(-1), "error"); failed.player.dispose();
  let resolve;
  const pending = harness("running", { fetchAudio: () => new Promise(done => { resolve = done; }) });
  const loaded = pending.player.prepare(); pending.sync(0); pending.player.dispose();
  resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); await loaded;
  assert.equal(pending.voices.length, 0); assert.equal(pending.context.state, "closed");
});
