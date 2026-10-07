import React from "react";
import AssetManager from "../../src/assets/assetManager.js";
import { REGISTERED_SFX_MANIFEST, buildSfxManifest } from "../../src/audio/audioAssets.js";

const PREVIEW_AUDIO_KEYS = ["jingle", "intro", "loop", "correct", "wrong", "out-of-time"].map(name => `target-quiz:${name}`);
const MUSIC_KEYS = new Set(PREVIEW_AUDIO_KEYS.slice(0, 3));

export function createPreviewPreferences() {
  const punches = buildSfxManifest(REGISTERED_SFX_MANIFEST.filter(entry => entry.meta?.eqKey === "presenterPunch"));
  AssetManager.registerManifest(punches);
  void AssetManager.preload({ keys: punches.map(entry => entry.key) });
  let state = { isAmbientMuted: false, isSfxMuted: false, soundMasterVolume: 1 };
  const listeners = new Set();
  const update = patch => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  return {
    store: { getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
    mute(value) {
      AssetManager.setMuted(!!value);
      update({ isAmbientMuted: !!value, isSfxMuted: !!value });
    },
    volume(value) {
      const volume = Math.max(0, Math.min(1, Number(value) || 0));
      AssetManager.setMasterVolume(volume);
      update({ soundMasterVolume: volume });
    },
  };
}

// Observe native nodes only in this preview. Playback remains owned by the game.
export function installPreviewAudioTrace() {
  const contexts = new Map();
  const gainNodes = new Map();
  const gainIds = new WeakMap();
  const paramIds = new WeakMap();
  const sources = [];
  let sequence = 0;
  const trackContext = context => {
    if (!contexts.has(context)) contexts.set(context, contexts.size + 1);
    return contexts.get(context);
  };
  const base = window.BaseAudioContext?.prototype;
  if (!base) return { snapshot: () => ({ contexts: [], sources: [], gains: [] }) };
  const createGain = base.createGain;
  base.createGain = function (...args) {
    const node = createGain.apply(this, args);
    const id = ++sequence;
    const entry = { id, context: trackContext(this), events: [], node };
    gainNodes.set(id, entry); gainIds.set(node, id); paramIds.set(node.gain, id);
    return node;
  };
  for (const method of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues", "cancelAndHoldAtTime"]) {
    const native = window.AudioParam?.prototype[method];
    if (!native) continue;
    window.AudioParam.prototype[method] = function (...args) {
      const entry = gainNodes.get(paramIds.get(this));
      if (entry) entry.events.push({ method, args: [...args] });
      return native.apply(this, args);
    };
  }
  const createSource = base.createBufferSource;
  base.createBufferSource = function (...args) {
    const source = createSource.apply(this, args);
    const context = this;
    const entry = { id: ++sequence, context: trackContext(context), startAt: null,
      duration: null, loop: false, stopCalls: [], connections: [], ended: false };
    sources.push(entry);
    const start = source.start;
    source.start = function (...startArgs) {
      Object.assign(entry, { startAt: Number(startArgs[0]) || 0, requestedAt: context.currentTime,
        key: PREVIEW_AUDIO_KEYS.find(key => AssetManager.getSfxBuffer(key) === source.buffer) || null,
        requestedWall: performance.now(), duration: source.buffer?.duration, loop: source.loop,
        loopStart: source.loopStart, loopEnd: source.loopEnd, offset: Number(startArgs[1]) || 0,
        playbackRate: source.playbackRate.value,
        lighting: (() => { const canvas = document.querySelector("canvas.target-quiz-lighting");
          return canvas ? { ...canvas.dataset, hidden: canvas.hidden } : null; })() });
      return start.apply(this, startArgs);
    };
    const stop = source.stop;
    source.stop = function (...stopArgs) {
      entry.stopCalls.push({ when: Number(stopArgs[0]) || 0, at: context.currentTime });
      return stop.apply(this, stopArgs);
    };
    const connect = source.connect;
    source.connect = function (...connectArgs) {
      entry.connections.push(gainIds.get(connectArgs[0]) || null);
      return connect.apply(this, connectArgs);
    };
    source.addEventListener("ended", () => { entry.ended = true; });
    return source;
  };
  return {
    async setContextState(state) {
      await Promise.all([...contexts.keys()].map(context => state === "suspended" ? context.suspend() : context.resume()));
    },
    snapshot() {
      return { contexts: [...contexts].map(([context, id]) => ({ id, state: context.state, time: context.currentTime })),
        sources: sources.slice(-60).map(entry => ({ ...entry, stopCalls: [...entry.stopCalls], connections: [...entry.connections] })),
        gains: [...gainNodes.values()].slice(-100).map(({ node, ...entry }) => ({ ...entry, value: node.gain.value, events: [...entry.events] })) };
    },
  };
}

export default function AudioPreview({ trace, preferences, onRestart, onClose, onFinish }) {
  const prefs = React.useSyncExternalStore(preferences.store.subscribe, preferences.store.getState);
  const [audio, setAudio] = React.useState(() => trace.snapshot());
  React.useEffect(() => {
    const timer = setInterval(() => setAudio(trace.snapshot()), 200);
    return () => clearInterval(timer);
  }, [trace]);
  const activeSources = audio.sources.filter(source => {
    const context = audio.contexts.find(item => item.id === source.context);
    if (!context || source.startAt === null || source.ended || source.startAt > context.time) return false;
    if (source.stopCalls.some(stop => Math.max(stop.when, stop.at) <= context.time)) return false;
    return source.loop || context.time < source.startAt + source.duration;
  });
  const playing = activeSources.filter(source => MUSIC_KEYS.has(source.key) || source.key === "target-quiz:out-of-time").at(-1);
  const effect = activeSources.filter(source => source.key === "target-quiz:correct" || source.key === "target-quiz:wrong").at(-1);
  const context = playing && audio.contexts.find(item => item.id === playing.context);
  const elapsed = playing ? Math.max(0, context.time - playing.startAt) : 0;
  const track = !playing ? "En attente" : playing.key === "target-quiz:out-of-time" ? "Temps écoulé"
    : playing.loop ? "Boucle" : playing.duration > 2 ? "Jingle" : "Introduction";
  return <div className="fixture-audio">
    <div className="fixture-controls">
      <button type="button" data-audio-restart onClick={onRestart}>Recommencer avec le son</button>
      <label><input type="checkbox" checked={prefs.isAmbientMuted} onChange={event => preferences.mute(event.target.checked)} />Muet</label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" value={prefs.soundMasterVolume}
        onChange={event => preferences.volume(event.target.value)} /></label>
      <button type="button" onClick={onClose}>Fermer</button>
      <button type="button" onClick={onFinish}>Fin de manche</button>
    </div>
    <output>{track}{playing ? ` · ${elapsed.toFixed(1)} s${playing.loop ? ` · boucle ${playing.duration.toFixed(3)} s` : ""}` : " · cliquer pour autoriser le son"}
      {effect ? ` · effet ${effect.key === "target-quiz:correct" ? "bonne réponse" : "mauvaise réponse"} (${effect.duration.toFixed(2)} s)` : ""}</output>
  </div>;
}
