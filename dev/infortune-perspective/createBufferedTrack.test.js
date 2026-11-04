import test from "node:test";
import assert from "node:assert/strict";
import { createBufferedTrack } from "./createBufferedTrack.js";

function harness(options = {}) {
  const sources = [], gains = [];
  const context = {
    state: "running", currentTime: 0, destination: {}, decodeAudioData: async () => ({ duration: 5 }),
    createGain() {
      const events = [];
      const node = { events, disconnected: false, connect() {}, disconnect() { this.disconnected = true; },
        gain: { value: 1, setValueAtTime: (value, time) => events.push(["set", value, time]),
          linearRampToValueAtTime: (value, time) => events.push(["ramp", value, time]),
          setTargetAtTime: (value, time, delay) => events.push(["target", value, time, delay]),
          cancelAndHoldAtTime: time => events.push(["hold", time]),
        } };
      gains.push(node); return node;
    },
    createBufferSource() {
      const source = { stops: [], connect(node) { return node; }, disconnect() { this.disconnected = true; },
        start(...args) { this.startArgs = args; }, stop(...args) { this.stops.push(args); } };
      sources.push(source); return source;
    },
  };
  const track = createBufferedTrack({ context, url: "sound.mp3", fetchAudio: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }), ...options });
  return { context, sources, gains, track };
}

test("an open-ended roll loops until real stop, with entrance and exit fades", async () => {
  const app = harness({ loop: true, syncClock: false, fadeIn: 0.4, fadeOut: 0.65 });
  await app.track.prepare(); app.track.sync({ active: true, time: 0, key: 1 });
  assert.equal(app.sources[0].loop, true); assert.deepEqual(app.sources[0].startArgs, [0, 0]);
  assert.deepEqual(app.gains[1].events.slice(0, 2), [["set", 0, 0], ["ramp", 1, 0.4]]);
  app.context.currentTime = 12; app.track.sync({ active: true, time: 10, key: 1 });
  assert.equal(app.sources.length, 1, "Slower rendering never restarts the background music.");
  app.track.sync({ active: false, time: 10, key: 1 });
  assert.deepEqual(app.sources[0].stops.at(-1), [12.65]);
  assert.deepEqual(app.gains[1].events.at(-1), ["ramp", 0, 12.65]); app.track.dispose();
});

test("a camera cue follows seeks and pauses while ordinary frames reuse the voice", async () => {
  const app = harness({ duration: 3, fadeIn: 0.01, fadeOut: 0.12 });
  await app.track.prepare(); app.track.sync({ active: true, time: 0, key: 1 });
  app.context.currentTime = 1; app.track.sync({ active: true, time: 1, key: 1 }); assert.equal(app.sources.length, 1);
  app.track.sync({ active: true, time: 2.5, key: 1 });
  assert.deepEqual(app.sources[1].startArgs, [1, 2.5, 0.5]);
  assert.deepEqual(app.gains[2].events.at(-1), ["ramp", 0, 1.5]);
  app.track.sync({ active: false }); app.track.dispose();
});

test("mute and backgrounding silence retiring voices as well as the active one", async () => {
  const app = harness({ loop: true }); await app.track.prepare();
  app.track.sync({ active: true, time: 0, key: 1 }); app.track.sync({ active: false });
  app.track.setMuted(true); assert.equal(app.sources[0].disconnected, true);
  app.track.sync({ active: true, time: 6, key: 2 }); assert.equal(app.sources.length, 1);
  app.track.setMuted(false); assert.deepEqual(app.sources[1].startArgs, [0, 1]);
  app.track.setSuspended(true); assert.equal(app.sources[1].disconnected, true);
  app.track.setSuspended(false); assert.equal(app.sources.length, 3);
  app.track.dispose(); assert.ok(app.sources.every(source => source.disconnected));
});

test("late loading cannot start a sound after the wheel has stopped", async () => {
  let resolve;
  const app = harness({ fetchAudio: () => new Promise(done => { resolve = done; }) });
  const prepared = app.track.prepare(); app.track.sync({ active: true, time: 0, key: 1 });
  app.track.sync({ active: false }); resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); await prepared;
  assert.equal(app.sources.length, 0); app.track.dispose();
});

test("an audience reaction resumes at its playback position after hiding or muting", async () => {
  const app = harness({ resumeFromPlayback: true, syncClock: false }); await app.track.prepare();
  app.track.sync({ active: true, time: 0, key: "audience:1" });
  app.context.currentTime = 2; app.track.setSuspended(true);
  app.context.currentTime = 20; app.track.setSuspended(false);
  assert.deepEqual(app.sources[1].startArgs, [20, 2, 3]);
  app.context.currentTime = 21; app.track.setMuted(true);
  app.context.currentTime = 30; app.track.setMuted(false);
  assert.deepEqual(app.sources[2].startArgs, [30, 3, 2]);
  app.sources[2].onended(); app.track.setMuted(true); app.track.setMuted(false);
  assert.equal(app.sources.length, 3, "A completed reaction is not replayed when sound is re-enabled.");
  app.track.dispose();
});
