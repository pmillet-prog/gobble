import AssetManager from "../../assets/assetManager.js";

export const TARGET_QUIZ_AUDIO_KEYS = Object.freeze({
  jingle: "target-quiz:jingle",
  intro: "target-quiz:intro",
  loop: "target-quiz:loop",
});

export const TARGET_QUIZ_AUDIO_MANIFEST = Object.freeze([
  { key: TARGET_QUIZ_AUDIO_KEYS.jingle, type: "sfx", priority: "low", candidates: ["/sound/presenters/foukro/Jingle.mp3"] },
  { key: TARGET_QUIZ_AUDIO_KEYS.intro, type: "sfx", priority: "low", candidates: ["/sound/presenters/foukro/intro.wav"] },
  { key: TARGET_QUIZ_AUDIO_KEYS.loop, type: "sfx", priority: "low", candidates: ["/sound/presenters/foukro/boucle.wav"] },
]);

const AUDIO_KEYS = Object.values(TARGET_QUIZ_AUDIO_KEYS);
const SCHEDULE_LEAD_SECONDS = 0.02;

function disconnect(node) {
  try { node.disconnect(); } catch (_) {}
}

// AudioBufferSource scheduling owns every musical boundary. DOM timers and
// onended never start a successor. All three files retain their original samples
// and level, with no fade or inserted silence at their boundaries.
export function createTargetQuizAudioPlayer({ assetManager = AssetManager } = {}) {
  assetManager.registerManifest(TARGET_QUIZ_AUDIO_MANIFEST);
  let generation = 0;
  let disposed = false;
  let preparing = null;
  let starting = null;
  let current = null;
  const playbacks = new Set();

  const readBuffers = () => Object.fromEntries(Object.entries(TARGET_QUIZ_AUDIO_KEYS)
    .map(([name, key]) => [name, assetManager.getSfxBuffer(key)]));
  const isPrepared = () => Object.values(readBuffers())
    .every(buffer => buffer && Number.isFinite(buffer.duration) && buffer.duration > 0);

  function prepare() {
    if (disposed) return Promise.resolve(false);
    if (!preparing) {
      const pending = Promise.resolve().then(() => assetManager.preload({
        keys: AUDIO_KEYS, includeTypes: ["sfx"], concurrency: 3,
      })).then(() => !disposed && isPrepared());
      preparing = pending;
      pending.finally(() => { if (preparing === pending) preparing = null; }).catch(() => {});
    }
    return preparing;
  }

  function releasePlayback(playback) {
    if (!playbacks.has(playback)) return;
    disconnect(playback.gain);
    playback.ctx.removeEventListener?.("statechange", playback.onStateChange);
    playbacks.delete(playback);
    if (current === playback) current = null;
  }

  function releaseSource(playback, source) {
    if (!playback.sources.has(source)) return;
    source.onended = null;
    disconnect(source);
    playback.sources.delete(source);
    if (playback.sources.size > 0) return;
    releasePlayback(playback);
  }

  function stopPlayback(playback, fadeMs) {
    if (!playbacks.has(playback)) return;
    const at = playback.ctx.currentTime;
    const fadeSeconds = playback.ctx.state === "running"
      ? Math.max(0, Number(fadeMs) || 0) / 1000 : 0;
    if (fadeSeconds > 0 && playback.stoppingAt != null) return;
    const stopAt = at + fadeSeconds;
    playback.stoppingAt = stopAt;
    const gain = playback.gain.gain;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(playback.level, at);
    if (fadeSeconds > 0) gain.linearRampToValueAtTime(0, stopAt);
    else gain.setValueAtTime(0, at);
    for (const source of [...playback.sources.keys()]) {
      try { source.stop(stopAt); } catch (_) {}
      if (!fadeSeconds) releaseSource(playback, source);
    }
    if (playback.sources.size === 0) releasePlayback(playback);
    if (current === playback) current = null;
  }

  function stop({ fadeMs = 120 } = {}) {
    generation += 1;
    starting = null;
    for (const playback of [...playbacks]) stopPlayback(playback, fadeMs);
  }

  function schedule({ ctx, output }, buffers, { withJingle, gain }) {
    const startedAt = ctx.currentTime + SCHEDULE_LEAD_SECONDS;
    const jingleEndsAt = startedAt + (withJingle ? buffers.jingle.duration : 0);
    const introEndsAt = jingleEndsAt + (withJingle ? buffers.intro.duration : 0);
    const level = Math.max(0, Math.min(1, Number.isFinite(gain) ? gain : 1));
    const playback = {
      ctx, level, gain: ctx.createGain(), sources: new Set(),
      timeline: Object.freeze({
        ctx, startedAt, jingleEndsAt, introEndsAt, loopStartsAt: introEndsAt,
        jingleDurationMs: withJingle ? buffers.jingle.duration * 1000 : 0,
      }),
    };
    playback.gain.gain.value = level;
    playback.gain.connect(output);
    playback.onStateChange = () => {
      // A suspended/closed context must not later resurrect a hidden soundtrack.
      if (ctx.state !== "running") stopPlayback(playback, 0);
    };
    ctx.addEventListener?.("statechange", playback.onStateChange);
    playbacks.add(playback);
    current = playback;

    const addSource = (buffer, at, { loop = false } = {}) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      source.connect(playback.gain);
      playback.sources.add(source);
      source.onended = () => releaseSource(playback, source);
      source.start(at);
    };

    try {
      if (withJingle) {
        addSource(buffers.jingle, startedAt);
        addSource(buffers.intro, jingleEndsAt);
      }
      addSource(buffers.loop, introEndsAt, { loop: true });
    } catch (error) {
      stopPlayback(playback, 0);
      throw error;
    }
    return playback.timeline;
  }

  function start({ withJingle = true, gain = 1 } = {}) {
    if (disposed) return Promise.resolve(null);
    if (current) return Promise.resolve(current.timeline);
    if (starting) return starting;
    const requestedGeneration = generation;
    const pending = prepare().then(ready => {
      if (!ready || disposed || generation !== requestedGeneration) return null;
      const route = assetManager.getAudioOutput();
      if (!route?.ctx || !route.output || route.ctx.state !== "running") return null;
      for (const playback of [...playbacks]) stopPlayback(playback, 0);
      return schedule(route, readBuffers(), { withJingle, gain });
    });
    starting = pending;
    pending.finally(() => { if (starting === pending) starting = null; }).catch(() => {});
    return pending;
  }

  return {
    prepare,
    isPrepared,
    start,
    stop,
    getSnapshot() {
      const prepared = isPrepared();
      if (!current) return { phase: "idle", prepared };
      const { ctx, startedAt, jingleEndsAt, introEndsAt, loopStartsAt } = current.timeline;
      const contextTime = ctx.currentTime;
      const phase = contextTime < startedAt ? "scheduled"
        : contextTime < jingleEndsAt ? "jingle" : contextTime < introEndsAt ? "intro" : "loop";
      return { phase, prepared, contextTime, startedAt, jingleEndsAt, introEndsAt, loopStartsAt,
        elapsedMs: Math.max(0, contextTime - startedAt) * 1000,
        jingleRemainingMs: Math.max(0, jingleEndsAt - contextTime) * 1000 };
    },
    dispose({ fadeMs = 0 } = {}) {
      disposed = true;
      stop({ fadeMs });
    },
  };
}
