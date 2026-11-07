import assert from 'node:assert/strict';
import test from 'node:test';
import AssetManager from './assetManager.js';

function audioFixture(t) {
  const document = { hidden: false, visibilityState: 'visible' };
  const sources = [], lifecycle = [];
  const node = () => ({ context: ctx, gain: { value: 1 }, connect() {}, disconnect() { this.disconnected = true; } });
  const ctx = {
    state: 'running', currentTime: 0, destination: {},
    createGain: node,
    createBufferSource() {
      const source = { ...node(), playbackRate: { value: 1 },
        start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(source); return source;
    },
    decodeAudioData: async () => ({ duration: 10 }),
    resume: async () => { lifecycle.push('resume'); ctx.state = 'running'; },
    suspend: async () => { lifecycle.push('suspend'); ctx.state = 'suspended'; },
    close: async () => { lifecycle.push('close'); ctx.state = 'closed'; },
  };
  for (const [key, value] of Object.entries({ document, fetch: async () => ({
    ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(8),
  }) })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : Reflect.deleteProperty(globalThis, key));
  }
  t.after(() => AssetManager.dispose());
  AssetManager.setMuted(false);
  AssetManager.registerManifest([{ key: 'background-test', type: 'sfx', candidates: ['/sound/background-test.mp3'] }]);
  const connect = () => AssetManager.setAudioSystemProvider(() => ({ ctx }));
  const hide = () => { document.hidden = true; document.visibilityState = 'hidden'; AssetManager.stopAllSfx(); };
  const show = () => { document.hidden = false; document.visibilityState = 'visible'; };
  return { ctx, sources, lifecycle, connect, hide, show };
}

test('backgrounding clears queued sounds without losing the preloaded asset or replaying it on return', async t => {
  const f = audioFixture(t);
  await AssetManager.preload({ keys: ['background-test'] });
  AssetManager.playSfx('background-test');
  assert.equal(AssetManager.getAudioDebugStats().playQueue, 1);
  f.hide();
  AssetManager.playSfx('background-test');
  assert.equal(AssetManager.getAudioDebugStats().playQueue, 0);
  assert.equal(AssetManager.getAudioDebugStats().pendingBuffers, 1);
  f.show(); f.connect(); await AssetManager.unlockAudio();
  assert.equal(f.sources.length, 0);
  assert.equal(AssetManager.getAudioDebugStats().decodedBuffers, 1);
  assert.ok(AssetManager.playSfx('background-test'));
  assert.equal(f.sources.length, 1);
});

test('backgrounding stops and disconnects all voices while keeping the engine running and decoded assets ready', async t => {
  const f = audioFixture(t); f.connect(); await AssetManager.unlockAudio();
  await AssetManager.preload({ keys: ['background-test'] });
  AssetManager.playSfx('background-test'); AssetManager.playSfx('background-test');
  assert.equal(AssetManager.getAudioDebugStats().activeVoices, 2);
  f.hide();
  assert.equal(AssetManager.getAudioDebugStats().activeVoices, 0);
  assert.ok(f.sources.every(source => source.started && source.stopped && source.disconnected));
  assert.equal(f.ctx.state, 'running'); assert.deepEqual(f.lifecycle, []);
  assert.equal(AssetManager.getAudioDebugStats().decodedBuffers, 1);
  assert.equal(AssetManager.playSfx('background-test'), null);
  assert.equal(await AssetManager.unlockAudio(), null);
  f.show(); assert.ok(AssetManager.playSfx('background-test'));
  assert.equal(f.sources.length, 3);
  f.sources[2].onended();
  assert.equal(AssetManager.getAudioDebugStats().activeVoices, 0);
});

test('a decode completing after a background round trip cannot replay a cancelled event', async t => {
  const f = audioFixture(t);
  await AssetManager.preload({ keys: ['background-test'] });
  let finishDecode;
  f.ctx.decodeAudioData = () => new Promise(resolve => { finishDecode = resolve; });
  f.connect();
  AssetManager.playSfx('background-test');
  assert.equal(AssetManager.getAudioDebugStats().pendingPlays, 1);
  f.hide(); f.show(); finishDecode({ duration: 10 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.sources.length, 0);
  assert.equal(AssetManager.getAudioDebugStats().pendingPlays, 0);
  assert.ok(AssetManager.playSfx('background-test'));
});
