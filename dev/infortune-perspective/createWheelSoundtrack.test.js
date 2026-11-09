import test from "node:test";
import assert from "node:assert/strict";
import { createWheelSoundtrack } from "./createWheelSoundtrack.js";
import { resultSoundVariant } from "./wheelSoundPlan.js";

function harness(random = () => 0, { context, introMuted = false, disposeTrack = () => {} } = {}) {
  const tracks = new Map();
  const engine = createWheelSoundtrack({ urls: { intro: "intro", spin: "music", drums: "drums",
    results: Object.fromEntries(["small", "good", "jackpot", "bonus", "bankrupt", "exchange"].map(id => [id, id])),
    audience: { low1: "audience-low1", low2: "audience-low2", honorable: "audience-honorable", fiveHundred: "audience-500", fiveHundred2: 'audience-500-2', laughter: 'audience-laughter', top: "audience-top" } }, random,
    createContext: () => context || ({ state: "running", decodeAudioData: async () => ({ duration: 5 }), close: async () => {} }),
    fetchAudio: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
    makeTrack(options) {
      const track = { options, calls: [], prepare() {}, sync(value) { this.calls.push(value); },
        setMuted(value) { this.muted = value; }, setSuspended(value) { this.suspended = value; }, dispose() { this.disposed = true; return disposeTrack(options); } };
      tracks.set(options.url, track); return track;
    },
  });
  engine.setIntroMuted(introMuted); void engine.unlock();
  return { engine, tracks, last: id => tracks.get(id).calls.at(-1),
    spin(elapsed, speed, id = 1) { engine.handleWheel({ type: "spin", progress: { phase: "spinning", id, elapsed, velocity: speed * Math.PI * 2 } }); },
    phase(phase, result = null) { engine.handleWheel({ type: "phase", view: { phase, result } }); },
    camera(sequence, time, playing = true) { engine.syncCamera({ sequence, time, playing }); },
  };
}

test('intro preference mutes only the opening music, survives unlock and never overrides global mute', async () => {
  const voices=[];
  const context={state:'running',currentTime:0,destination:{},decodeAudioData:async()=>({duration:5}),close:async()=>{},
    createBufferSource(){const voice={stops:0,connect:node=>node,disconnect(){},start(...args){this.started=args;},stop(){this.stops++;}};voices.push(voice);return voice;},
    createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}};},
  };
  const app=harness(()=>0,{context,introMuted:true});
  app.camera('intro',0); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(voices.length,0);
  app.spin(0,2); assert.equal(app.last('music').active,true);
  assert.ok([...app.tracks.values()].every(track=>track.muted===false));
  app.engine.setIntroMuted(false); assert.deepEqual(voices[0].started,[0,0,5]);
  app.engine.setIntroMuted(true); assert.equal(voices[0].stops,1);
  app.camera('intro',2);app.engine.setIntroMuted(false);
  assert.deepEqual(voices[1].started,[0,2,3],'reenabling follows the camera instead of restarting the intro');
  app.engine.setMuted(true);app.engine.setIntroMuted(false);assert.equal(voices.length,2);
  app.engine.setMuted(false);assert.equal(voices.length,3);
  app.engine.setIntroMuted(true);app.engine.setMuted(true);app.engine.setMuted(false);
  assert.equal(voices.length,3,'global unmute must preserve the dedicated preference');
  app.engine.dispose();
});

test("each exchange plays the local player's reaction once, including when targeted by somebody else", () => {
  const app = harness();
  const event = { type: "exchange", id: "4:0", selfId: "self",
    exchange: { from: "opponent", to: "self", sourceBank: 900, targetBank: 100 } };
  app.engine.handleWheel(event); app.engine.handleWheel(event);
  assert.equal(app.tracks.get("audience-top").calls.filter(call => call.active).length, 1);
  app.engine.handleWheel({ ...event, id: "4:1", exchange: { from: "self", to: "opponent", sourceBank: 900, targetBank: 100 } });
  assert.equal(app.last("audience-laughter").active, true);
  app.engine.dispose();
});

test("drums start during the physical slowdown and outlive the camera's three seconds until actual rest", () => {
  const app = harness(); app.phase("aiming"); assert.equal(app.tracks.get("music").calls.length, 0);
  app.spin(0, 2); assert.equal(app.last("music").active, true); assert.equal(app.last("drums").active, false);
  app.camera("launch", 0); app.camera("launch", 3, false);
  assert.equal(app.last("drums").active, false, "Camera time alone cannot start the roll.");
  app.spin(8, 0.15); assert.equal(app.last("drums").active, false, "Wait for the last part of the slowdown.");
  assert.equal(app.last("music").level, 1);
  app.spin(8.5, 0.1); assert.equal(app.last("drums").active, true); assert.equal(app.last("drums").time, 0);
  assert.equal(app.last("music").level, 0.28);
  app.spin(14.5, -0.4); assert.equal(app.last("drums").active, true); assert.equal(app.last("drums").time, 6);
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
  assert.equal(resultSoundVariant({ kind: "pass", amount: 0 }), 'bankrupt');
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
  assert.equal(app.last("audience-500-2").active, true);
  app.engine.dispose();
});

test("leaving the wheel keeps its shared context open until the celebration fades", async () => {
  let finish, closed = 0;
  const app = harness(() => 0, {
    context: { state: 'running', decodeAudioData: async () => ({ duration: 5 }), close: async () => { closed++; } },
    disposeTrack: ({ url }) => url === 'audience-top' ? new Promise(resolve => { finish = resolve; }) : undefined,
  });
  app.phase('finished', { kind: 'bonus' });
  for (const id of ['audience-top', 'bonus', 'jackpot']) assert.equal(app.tracks.get(id).options.disposeFadeOut, .9);
  const completion = app.engine.dispose();
  assert.equal(closed, 0, 'unmount must not cut the fade by closing the AudioContext');
  app.engine.setHidden(true);
  assert.ok(app.tracks.get('audience-top').suspended, 'background controls still reach the tail');
  finish(); await completion;
  assert.equal(closed, 1);
  await app.engine.dispose(); assert.equal(closed, 1);
});
