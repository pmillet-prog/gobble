import test from "node:test";
import assert from "node:assert/strict";
import AssetManager from "../../assets/assetManager.js";
import { createTargetQuizAudioPlayer, TARGET_QUIZ_AUDIO_KEYS, TARGET_QUIZ_AUDIO_MANIFEST } from "./targetQuizAudioPlayer.js";

function audioContext() {
  const gains = [], sources = [], listeners = new Set();
  const ctx = {
    currentTime: 10, state: "running", gains, sources, listeners,
    destination: { name: "speakers" },
    addEventListener(event, callback) { assert.equal(event, "statechange"); listeners.add(callback); },
    removeEventListener(event, callback) { assert.equal(event, "statechange"); listeners.delete(callback); },
    createGain() {
      const events = [];
      const node = {
        context: ctx, connections: [], disconnected: false,
        gain: {
          value: 1, events,
          setValueAtTime(value, at) { events.push(["set", value, at]); },
          linearRampToValueAtTime(value, at) { events.push(["linear", value, at]); },
          cancelScheduledValues(at) { events.push(["cancel", at]); },
        },
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; },
      };
      gains.push(node);
      return node;
    },
    createBufferSource() {
      const node = {
        context: ctx, connections: [], starts: [], stops: [], disconnected: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; },
        start(at) { this.starts.push(at); },
        stop(at) { this.stops.push(at); },
        end() { this.onended?.(); },
      };
      sources.push(node);
      return node;
    },
    changeState(state) { ctx.state = state; for (const listener of [...listeners]) listener(); },
  };
  return ctx;
}

function fixture({ load = async () => {} } = {}) {
  const ctx = audioContext();
  const output = ctx.createGain();
  const buffers = {
    [TARGET_QUIZ_AUDIO_KEYS.jingle]: { duration: 3.0658730158730156 },
    [TARGET_QUIZ_AUDIO_KEYS.intro]: { duration: 1 },
    [TARGET_QUIZ_AUDIO_KEYS.loop]: { duration: 352812 / 44100 },
  };
  let route = { ctx, output };
  const preloadCalls = [];
  const assetManager = {
    registerManifest(manifest) { assert.equal(manifest, TARGET_QUIZ_AUDIO_MANIFEST); },
    async preload(options) { preloadCalls.push(options); await load(); },
    getSfxBuffer: key => buffers[key] || null,
    getAudioOutput: () => route,
  };
  const player = createTargetQuizAudioPlayer({ assetManager });
  return { player, ctx, output, buffers, preloadCalls, setRoute: value => { route = value; } };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("all three original buffers are scheduled at exact boundaries and the full loop uses native looping", async () => {
  const f = fixture();
  assert.equal(await f.player.prepare(), true);
  assert.equal(f.player.isPrepared(), true);
  const timeline = await f.player.start();
  const [jingle, intro, loop] = f.ctx.sources;
  assert.equal(f.ctx.sources.length, 3);
  near(jingle.starts[0], 10.02);
  near(intro.starts[0], jingle.starts[0] + jingle.buffer.duration);
  near(loop.starts[0], intro.starts[0] + intro.buffer.duration);
  assert.equal(loop.loop, true);
  assert.equal(loop.loopStart, 0);
  assert.equal(loop.loopEnd, 352812 / 44100);
  assert.equal(jingle.buffer, f.buffers[TARGET_QUIZ_AUDIO_KEYS.jingle]);
  assert.equal(intro.buffer, f.buffers[TARGET_QUIZ_AUDIO_KEYS.intro]);
  assert.equal(loop.buffer, f.buffers[TARGET_QUIZ_AUDIO_KEYS.loop]);
  assert.equal(jingle.connections[0], intro.connections[0], "jingle/intro share the same unmodified level");
  assert.equal(intro.connections[0], loop.connections[0], "all tracks share one gain without a crossfade");
  assert.deepEqual(intro.connections[0].gain.events, []);
  assert.equal(intro.connections[0].connections[0], f.output);
  near(timeline.jingleEndsAt, intro.starts[0]);
  near(timeline.loopStartsAt, loop.starts[0]);
  assert.equal(f.ctx.gains.length, 2, "only the shared output and playback gain, with no jingle envelope");
  const sourceCount = f.ctx.sources.length;
  jingle.end();
  intro.end();
  assert.equal(f.ctx.sources.length, sourceCount, "ended callbacks only release nodes, never start audio");
  assert.equal(jingle.disconnected, true);
  assert.equal(intro.disconnected, true);
  assert.equal(loop.disconnected, false);
  f.player.dispose();
  assert.equal(f.ctx.listeners.size, 0);
});

test("snapshots follow the audio clock and repeated starts cannot replay a question's jingle", async () => {
  const f = fixture();
  const timeline = await f.player.start();
  assert.equal(f.player.getSnapshot().phase, "scheduled");
  f.ctx.currentTime = timeline.startedAt;
  assert.equal(f.player.getSnapshot().phase, "jingle");
  f.ctx.currentTime = timeline.jingleEndsAt;
  assert.equal(f.player.getSnapshot().phase, "intro");
  f.ctx.currentTime = timeline.loopStartsAt;
  assert.equal(f.player.getSnapshot().phase, "loop");
  assert.equal(await f.player.start(), timeline);
  assert.equal(f.ctx.sources.length, 3);
  f.player.dispose();
});

test("reprise starts only the untouched loop and faded stop cancels every already scheduled source", async () => {
  const f = fixture();
  await f.player.start();
  f.player.stop({ fadeMs: 120 });
  for (const source of f.ctx.sources) near(source.stops[0], 10.12);
  assert.equal(f.player.getSnapshot().phase, "idle");
  const oldSources = [...f.ctx.sources];
  const timeline = await f.player.start({ withJingle: false });
  assert.equal(f.ctx.sources.length, 4);
  assert.ok(oldSources.every(source => source.disconnected));
  const loop = f.ctx.sources.at(-1);
  assert.equal(loop.loop, true);
  assert.equal(loop.buffer, f.buffers[TARGET_QUIZ_AUDIO_KEYS.loop]);
  near(loop.starts[0], timeline.startedAt);
  assert.equal(timeline.jingleDurationMs, 0);
  assert.equal(timeline.loopStartsAt, timeline.startedAt);
  f.player.stop({ fadeMs: 120 });
  const stopCount = loop.stops.length;
  f.player.stop({ fadeMs: 120 });
  assert.equal(loop.stops.length, stopCount, "repeated stops cannot restart or extend a fade");
  loop.end();
  assert.equal(loop.disconnected, true);
  assert.equal(loop.connections[0].disconnected, true);
  assert.equal(f.ctx.listeners.size, 0);
  assert.equal(f.output.disconnected, false, "the shared master output belongs to AssetManager");
});

test("stop and dispose invalidate asynchronous preparation, including concurrent starts", async () => {
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  const f = fixture({ load: () => loading });
  const first = f.player.start();
  assert.equal(f.player.start(), first);
  f.player.stop();
  release();
  assert.equal(await first, null);
  assert.equal(f.ctx.sources.length, 0);
  assert.equal(f.preloadCalls.length, 1);
  await f.player.start();
  f.player.dispose();
  assert.equal(await f.player.start(), null);
  assert.ok(f.ctx.sources.every(source => source.disconnected && source.onended === null));
  assert.equal(f.ctx.listeners.size, 0);
});

test("unavailable audio remains silent without unlocking and can be retried after existing audio becomes ready", async () => {
  const f = fixture();
  f.setRoute(null);
  assert.equal(await f.player.start(), null);
  assert.equal(f.ctx.sources.length, 0);
  f.setRoute({ ctx: f.ctx, output: f.output });
  await f.player.start();
  f.ctx.changeState("suspended");
  assert.equal(f.player.getSnapshot().phase, "idle");
  assert.ok(f.ctx.sources.every(source => source.disconnected));
  assert.equal(f.ctx.listeners.size, 0);
  assert.equal(await f.player.start(), null);
  f.ctx.state = "running";
  await f.player.start({ withJingle: false });
  assert.equal(f.ctx.sources.length, 4);
  f.player.dispose();
});

test("missing buffers and failed preparation do not leave nodes or poison subsequent loads", async () => {
  let fail = true;
  const f = fixture({ load: () => { if (fail) throw new Error("audio_unavailable"); } });
  await assert.rejects(f.player.start(), /audio_unavailable/);
  fail = false;
  const loop = f.buffers[TARGET_QUIZ_AUDIO_KEYS.loop];
  delete f.buffers[TARGET_QUIZ_AUDIO_KEYS.loop];
  assert.equal(await f.player.start(), null);
  assert.equal(f.player.isPrepared(), false);
  assert.equal(f.ctx.sources.length, 0);
  f.buffers[TARGET_QUIZ_AUDIO_KEYS.loop] = loop;
  await f.player.start();
  assert.equal(f.ctx.sources.length, 3);
  f.player.dispose();
});

test("AssetManager output is read-only, uses its existing unlocked context, and obeys mute/master changes", async t => {
  AssetManager.dispose();
  const ctx = audioContext();
  const busIn = ctx.createGain();
  let providerCalls = 0;
  AssetManager.setAudioSystemProvider(() => { providerCalls += 1; return { ctx, busIn }; });
  t.after(() => { AssetManager.setMuted(false); AssetManager.setMasterVolume(1); AssetManager.dispose(); });
  assert.equal(AssetManager.getAudioOutput(), null);
  assert.equal(providerCalls, 0);
  assert.equal(await AssetManager.unlockAudio(), ctx);
  const route = AssetManager.getAudioOutput();
  assert.equal(route.ctx, ctx);
  assert.equal(route.output.connections.at(-1), busIn);
  assert.equal(providerCalls, 1, "reading the route cannot create, resume or resync a context");
  AssetManager.setMasterVolume(0.4);
  assert.equal(route.output.gain.value, 0.4);
  AssetManager.setMuted(true);
  assert.equal(route.output.gain.value, 0);
  AssetManager.setMuted(false);
  assert.equal(route.output.gain.value, 0.4);
  ctx.state = "suspended";
  assert.equal(AssetManager.getAudioOutput(), null);
  ctx.state = "running";
  AssetManager.releaseAudioSystem(ctx);
  assert.equal(AssetManager.getAudioOutput(), null);
});
