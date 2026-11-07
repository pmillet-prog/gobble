import { EXCHANGE_SECTOR_INDICES } from "../../shared/infortuneWheel.js";
import { EXCHANGE_ARRIVAL_SECONDS, exchangeTileImpactSeconds } from "./exchangeArrival.js";

// Every voice follows the SAME elapsed time as the falling sectors. The source
// files include a short lead-in: compensate for it and for playback rate so the
// transient, rather than the beginning of the WAV, meets the first contact.
export function createExchangeArrivalSound({ context, clips = [], random = Math.random, fetchAudio = globalThis.fetch }) {
  const buffers = [], abort = new AbortController();
  const bus = context && clips.length ? context.createGain() : null;
  if (bus) { bus.gain.value = .85; bus.connect(context.destination); }
  let cues = [], bag = [], progress = 0, loading = null, disposed = false, muted = false, suspended = false;
  function stop(cue) {
    const voice = cue.voice; cue.voice = null;
    if (!voice) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* Already ended. */ }
    voice.source.disconnect(); voice.gain.disconnect();
  }
  function reset() { for (const cue of cues) stop(cue); cues = []; bag = []; }
  function silence() {
    for (const cue of cues) { stop(cue); if (progress === 1) cue.done = true; }
  }
  function choose() {
    if (!bag.length) {
      bag = clips.map((_, index) => index);
      for (let index = bag.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [bag[index], bag[other]] = [bag[other], bag[index]];
      }
    }
    return bag.pop();
  }
  function sync(value) {
    if (disposed || !bus) return;
    progress = Math.max(0, Math.min(1, value));
    if (!progress) { reset(); return; }
    if (!cues.length) cues = EXCHANGE_SECTOR_INDICES.map((_, index) => {
      const clip = choose(), rate = Math.pow(2, (random() * 2 - 1) * .7 / 12);
      const impactAt = exchangeTileImpactSeconds(index);
      return { clip, rate, impactAt, startAt: impactAt - clips[clip].impactSeconds / rate,
        voice: null, started: false, done: false };
    });
    const elapsed = progress * EXCHANGE_ARRIVAL_SECONDS;
    for (const cue of cues) {
      if (cue.done || elapsed < cue.startAt) continue;
      const buffer = buffers[cue.clip];
      if (!buffer || muted || suspended || context.state !== "running") {
        stop(cue);
        // No delayed bang when a missing sound finally loads or is unmuted.
        if (!cue.started && elapsed >= cue.impactAt) cue.done = true;
        continue;
      }
      if (cue.voice) continue;
      const offset = Math.max(0, (elapsed - cue.startAt) * cue.rate);
      if (offset >= buffer.duration || !cue.started && elapsed > cue.impactAt + .06) { cue.done = true; continue; }
      const source = context.createBufferSource(), gain = context.createGain(), time = context.currentTime;
      source.buffer = buffer; source.playbackRate.value = cue.rate;
      source.connect(gain).connect(bus);
      const duration = (buffer.duration - offset) / cue.rate;
      const attack = Math.min(.003, duration / 2);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(1, time + attack);
      gain.gain.setValueAtTime(1, time + Math.max(attack, duration - .025));
      gain.gain.linearRampToValueAtTime(0, time + duration);
      const voice = { source, gain }; cue.voice = voice; cue.started = true;
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (cue.voice === voice) { cue.voice = null; cue.done = true; }
      };
      source.start(time, offset);
    }
  }
  return {
    prepare() {
      if (!bus || disposed) return Promise.resolve();
      loading ||= Promise.all(clips.map(async (clip, index) => {
        try {
          const response = await fetchAudio(clip.url, { signal: abort.signal });
          if (!response.ok) return;
          const bytes = await response.arrayBuffer(); if (disposed) return;
          const buffer = await context.decodeAudioData(bytes); if (!disposed) buffers[index] = buffer;
        } catch { /* An unavailable effect must never hold up the wheel. */ }
      }));
      return loading;
    },
    sync,
    setMuted(value) { muted = value; if (value) silence(); sync(progress); },
    setSuspended(value) { suspended = value; if (value) silence(); sync(progress); },
    dispose() { disposed = true; abort.abort(); reset(); buffers.length = 0; bus?.disconnect(); },
  };
}
