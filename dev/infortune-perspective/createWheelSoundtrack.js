import { createIntroAudio } from "./createIntroAudio.js";
import { createBufferedTrack } from "./createBufferedTrack.js";
import { DRUMS_START_SPEED, resultSoundVariant } from "./wheelSoundPlan.js";
import { createWheelAudience } from "./wheelAudienceReactions.js";
import { createWheelAudioPreload } from "./wheelAudioPreload.js";

export function createWheelSoundtrack(options) {
  const preload = createWheelAudioPreload(options.fetchAudio);
  let player = null, disposed = false, muted = false, hidden = false, prepared = false;
  let camera = { sequence: "intro", time: 0, playing: false };
  const status = value => { if (!disposed) options.onStatus?.(value); };
  return {
    prepare() {
      if (disposed || prepared) return;
      prepared = true; status("blocked");
      void preload.prime(options.urls.intro).catch(() => { if (!player) status("error"); });
    },
    syncCamera(value) { camera = value; player?.syncCamera(value); },
    handleWheel(value) { player?.handleWheel(value); },
    async unlock() {
      if (disposed) return;
      // Create synchronously on the gesture, or after the caller has verified
      // that this document already permits audio. Never create on a cold mount.
      if (!player) {
        player = createActiveWheelSoundtrack({ ...options, fetchAudio: preload.fetch, onStatus: status });
        player.setMuted(muted); player.setHidden(hidden); player.syncCamera(camera); player.prepare();
      }
      await player.unlock();
    },
    setMuted(value) { muted = value; player?.setMuted(value); },
    setHidden(value) { hidden = value; player?.setHidden(value); },
    preview: id => player?.preview(id), previewAudience: id => player?.previewAudience(id),
    dispose() { disposed = true; player?.dispose(); preload.dispose(); },
  };
}

function createActiveWheelSoundtrack({ urls, onStatus, fetchAudio = globalThis.fetch, random = Math.random,
  createContext = () => { const Context = globalThis.AudioContext || globalThis.webkitAudioContext; return Context ? new Context() : null; },
  makeTrack = createBufferedTrack }) {
  let context;
  try { context = createContext(); } catch { context = null; }
  const intro = createIntroAudio({ url: urls.intro, onStatus, fetchAudio, createContext: () => context });
  const tracks = [];
  const track = options => {
    if (!context) return null;
    const value = makeTrack({ context, fetchAudio, ...options }); tracks.push(value); return value;
  };
  const music = track({ url: urls.spin, volume: 0.48, fadeIn: 0.4, fadeOut: 0.65, loop: true, syncClock: false });
  const drums = track({ url: urls.drums, volume: 0.65, loop: true, syncClock: false, fadeIn: 0.08, fadeOut: 0.15 });
  const results = Object.fromEntries(Object.entries(urls.results).map(([id, url]) =>
    [id, track({ url, volume: 0.9, duration: 3, fadeIn: 0.01, fadeOut: 0.12 })]));
  const audience = createWheelAudience({ urls: urls.audience, track, random });
  let spin = { phase: "ready", id: 0, elapsed: 0 }, result = null, drumsStartedAt = null;
  let hidden = false, interrupted = false;
  let camera = { sequence: "intro", time: 0, playing: false }, generation = 0, preview = 0;
  let preparation = null, disposed = false;
  function syncMusic() {
    const spinning = spin.phase === "spinning", suspense = spinning && drumsStartedAt !== null;
    music?.sync({ active: spinning, time: spin.elapsed, key: spin.id, level: suspense ? 0.28 : 1 });
    drums?.sync({ active: suspense, time: Math.max(0, spin.elapsed - (drumsStartedAt ?? spin.elapsed)), key: spin.id });
  }
  function syncCamera(value) {
    if (value.sequence !== camera.sequence || value.time < camera.time - 0.05) generation++;
    camera = value; intro.sync(value);
    const selected = resultSoundVariant(result);
    for (const [id, player] of Object.entries(results)) player?.sync({
      active: value.sequence === "results" && value.playing && id === selected,
      time: value.time, key: `${spin.id}:${generation}`,
    });
  }
  function handleWheel(event) {
    if (event.type === "phase") {
      result = event.view.result;
      if (event.view.phase === "ready" || event.view.phase === "spinning") audience.reset();
      if (event.view.phase === "ready") {
        spin = { ...spin, phase: "ready" }; drumsStartedAt = null; syncMusic();
        for (const player of Object.values(results)) player?.sync({ active: false });
      } else if (event.view.phase === "finished") {
        spin = { ...spin, phase: "finished" }; syncMusic();
        audience.stopped(result, spin.id);
      }
    } else if (event.type === "spin") {
      if (event.progress.id !== spin.id) drumsStartedAt = null;
      spin = event.progress;
      // Latch once: reversals and spring rebounds cannot restart / interrupt
      // the roll. Its endpoint is the physical rest event, never camera time.
      if (spin.phase === "spinning" && drumsStartedAt === null && Math.abs(spin.velocity) / (Math.PI * 2) <= DRUMS_START_SPEED) {
        drumsStartedAt = spin.elapsed;
      }
      syncMusic();
    } else if (event.type === "suspend") {
      interrupted = true;
      for (const player of tracks) player.setSuspended(true);
      intro.sync({ ...camera, playing: false });
    }
  }
  return {
    prepare() {
      preparation ||= (async () => {
        await intro.prepare();
        for (const player of tracks) {
          if (disposed) return;
          await player.prepare();
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      })();
      return preparation;
    },
    syncCamera, handleWheel,
    async unlock() { await intro.unlock(); if (!hidden && !interrupted) for (const player of tracks) player.setSuspended(false); },
    setMuted(value) { intro.setMuted(value); for (const player of tracks) player.setMuted(value); },
    setHidden(value) {
      hidden = value;
      for (const player of tracks) player.setSuspended(value || interrupted);
      if (value) intro.sync({ ...camera, playing: false });
    },
    preview(id) {
      if (!results[id] || spin.phase === "spinning" || camera.playing) return;
      audience.reset();
      for (const player of Object.values(results)) player?.sync({ active: false });
      results[id].sync({ active: true, time: 0, key: `preview:${++preview}` });
    },
    previewAudience(id) {
      if (spin.phase === "spinning" || camera.playing) return;
      for (const player of Object.values(results)) player?.sync({ active: false });
      audience.preview(id);
    },
    dispose() { disposed = true; for (const player of tracks) player.dispose(); intro.dispose(); },
  };
}
