import test from "node:test";
import assert from "node:assert/strict";
import { createExchangeArrivalSound } from "./createExchangeArrivalSound.js";
import { EXCHANGE_ARRIVAL_SECONDS, exchangeTileImpactSeconds, exchangeTilePose } from "./exchangeArrival.js";
import { EXCHANGE_SECTOR_INDICES } from "../../shared/infortuneWheel.js";

const clips = [{ url: "first.wav", impactSeconds: .12348 }, { url: "second.wav", impactSeconds: .09081 }];
function fixture(options = {}) {
  const sources = [], gains = [], requests = [];
  const context = { state: "running", currentTime: 0, destination: {},
    async decodeAudioData(bytes) { return { id: new Uint8Array(bytes)[0], duration: .52 }; },
    createGain() {
      const node = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {}, disconnect() { this.disconnected = true; } }; gains.push(node); return node;
    },
    createBufferSource() {
      const source = { playbackRate: { value: 1 }, connect(node) { return node; }, disconnect() { this.disconnected = true; },
        start(time, offset) { this.startTime = time; this.offset = offset; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
  };
  let seed = 12;
  const sound = createExchangeArrivalSound({ context, clips,
    random: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
    fetchAudio: async url => { requests.push(url); return { ok: true, arrayBuffer: async () => new Uint8Array([clips.findIndex(clip => clip.url === url)]).buffer }; },
    ...options });
  return { sound, context, sources, gains, requests,
    tick(seconds, wall = seconds) { context.currentTime = wall; sound.sync(seconds / EXCHANGE_ARRIVAL_SECONDS); } };
}

test("five independent impacts meet the five staggered contacts despite random clip and pitch", async () => {
  const h = fixture(); await h.sound.prepare();
  for (let frame = 0; frame <= 108; frame++) h.tick(frame / 60);
  assert.equal(h.sources.length, EXCHANGE_SECTOR_INDICES.length);
  assert.deepEqual(h.requests, ["first.wav", "second.wav"]);
  assert.deepEqual(new Set(h.sources.map(source => source.buffer.id)), new Set([0, 1]));
  assert.notEqual(h.sources[0].buffer.id, h.sources[1].buffer.id, "both alternatives are heard in each shuffled pair");
  assert.ok(new Set(h.sources.map(source => source.playbackRate.value)).size > 1);
  h.sources.forEach((source, index) => {
    const rate = source.playbackRate.value;
    assert.ok(rate > .95 && rate < 1.05);
    const audibleImpact = source.startTime + (clips[source.buffer.id].impactSeconds - source.offset) / rate;
    assert.ok(Math.abs(audibleImpact - exchangeTileImpactSeconds(index)) < 1e-9);
    assert.ok(Math.abs(exchangeTilePose(audibleImpact / EXCHANGE_ARRIVAL_SECONDS, index).height) < 1e-9);
    assert.equal(source.stopped, undefined, "a later sector cannot cut off an earlier sector's decay");
    source.onended();
  });
  h.sound.setMuted(true); h.sound.setMuted(false); h.tick(1.8);
  assert.equal(h.sources.length, 5, "finished impacts never replay");
  h.sound.dispose(); assert.ok(h.gains.every(gain => gain.disconnected));
});

test("mute skips impacts and hiding resumes a pending impact on the paused visual clock", async () => {
  const muted = fixture(); await muted.sound.prepare(); muted.sound.setMuted(true);
  for (let frame = 0; frame <= 108; frame++) muted.tick(frame / 60);
  muted.sound.setMuted(false); assert.equal(muted.sources.length, 0); muted.sound.dispose();
  const h = fixture(); await h.sound.prepare();
  h.tick(.8); assert.equal(h.sources.length, 1);
  h.sound.setSuspended(true); assert.equal(h.sources[0].stopped, true);
  h.context.currentTime = 30; h.sound.setSuspended(false);
  const resumed = h.sources.at(-1), rate = resumed.playbackRate.value;
  const impact = resumed.startTime + (clips[resumed.buffer.id].impactSeconds - resumed.offset) / rate;
  assert.ok(Math.abs(impact - (30 + exchangeTileImpactSeconds(0) - .8)) < 1e-9);
  h.sound.dispose(); assert.ok(h.sources.every(source => source.disconnected));
});

test("reset cancels old voices, replay chooses fresh effects, and late loading cannot replay missed impacts", async () => {
  const h = fixture(); await h.sound.prepare(); h.tick(.8); const first = h.sources[0];
  h.tick(0); assert.equal(first.stopped, true); h.tick(.8); assert.equal(h.sources.length, 2);
  h.sound.dispose(); h.tick(1.8); assert.equal(h.sources.length, 2);
  let load;
  const late = fixture({ fetchAudio: () => new Promise(resolve => { (load ||= []).push(resolve); }) });
  const preparing = late.sound.prepare(); late.tick(1.8);
  for (const resolve of load) resolve({ ok: true, arrayBuffer: async () => new Uint8Array([0]).buffer });
  await preparing; late.tick(1.8); assert.equal(late.sources.length, 0); late.sound.dispose();
});

test("disposing a pending decode cannot retain buffers or start a late voice", async () => {
  let decodes = [];
  const h = fixture(); h.context.decodeAudioData = () => new Promise(resolve => decodes.push(resolve));
  const pending = h.sound.prepare();
  await Promise.resolve(); await Promise.resolve(); h.sound.dispose();
  for (const resolve of decodes) resolve({ duration: .5 });
  await pending; h.tick(1); assert.equal(h.sources.length, 0); assert.ok(h.gains.every(gain => gain.disconnected));
});

test("unmuting or returning after the reveal cannot resurrect a cut-off impact tail", async () => {
  for (const setter of ["setMuted", "setSuspended"]) {
    const h = fixture(); await h.sound.prepare();
    for (let frame = 0; frame <= 108; frame++) h.tick(frame / 60);
    h.sound[setter](true); h.context.currentTime = 30; h.sound[setter](false);
    assert.equal(h.sources.length, 5); assert.ok(h.sources.every(source => source.stopped)); h.sound.dispose();
  }
});
