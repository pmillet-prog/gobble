// A shared-context track with sample-accurate envelopes. No timers or frame
// loop of its own; the physical wheel / camera supplies playback intent.
export function createBufferedTrack({ context, url, volume = 0.5, duration = Infinity,
  fadeIn = 0.15, fadeOut = 0.35, loop = false, syncClock = true, resumeFromPlayback = false, fetchAudio = globalThis.fetch }) {
  const bus = context.createGain(); bus.gain.value = volume; bus.connect(context.destination);
  const abort = new AbortController(), retiring = new Set();
  let buffer, loading, voice = null, disposed = false, muted = false, suspended = false, level = 1, finishedKey = null;
  let desired = { active: false, time: 0, key: null };
  function disconnect(record) {
    record.source.disconnect(); record.gain.disconnect(); retiring.delete(record);
  }
  function clearRetiring() {
    for (const record of [...retiring]) { try { record.source.stop(); } catch {} disconnect(record); }
  }
  function rememberPlayback() {
    if (resumeFromPlayback && voice) desired = { ...desired, time: voice.offset + context.currentTime - voice.started };
  }
  function stop(fade = fadeOut) {
    const record = voice; voice = null;
    if (!record) return;
    const now = context.currentTime, parameter = record.gain.gain;
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(now);
    else { const value = parameter.value; parameter.cancelScheduledValues(now); parameter.setValueAtTime(value, now); }
    parameter.linearRampToValueAtTime(0, now + fade);
    retiring.add(record);
    try { record.source.stop(now + fade); } catch {}
    if (!fade) disconnect(record);
    // Rapid scrubbing cannot accumulate a stack of fading voices.
    if (retiring.size > 2) {
      const oldest = retiring.values().next().value;
      try { oldest.source.stop(); } catch {} disconnect(oldest);
    }
  }
  function sync(value) {
    if (disposed) return;
    desired = value;
    const nextLevel = Math.max(0, Math.min(1, value.level ?? 1));
    if (nextLevel !== level) { level = nextLevel; bus.gain.setTargetAtTime(volume * level, context.currentTime, 0.12); }
    if (!value.active || muted || suspended) { stop(!value.active ? fadeOut : 0.015); return; }
    if (!buffer || context.state !== "running") return;
    const time = Math.max(0, value.time), end = loop ? Infinity : Math.min(duration, buffer.duration);
    if (time >= end) { stop(0.01); return; }
    if (voice?.key === value.key && (!syncClock || Math.abs(voice.offset + context.currentTime - voice.started - time) < 0.18)) return;
    if (!voice && finishedKey === value.key) return;
    stop(0.015);
    const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime;
    source.buffer = buffer; source.loop = loop; source.connect(gain).connect(bus);
    gain.gain.setValueAtTime(0, now);
    const remaining = end - time, attack = Math.min(fadeIn, remaining / 2);
    const initialLevel = Number.isFinite(end) ? Math.min(1, remaining / fadeOut) : 1;
    gain.gain.linearRampToValueAtTime(initialLevel, now + attack);
    if (Number.isFinite(end)) {
      if (remaining > fadeOut + attack) gain.gain.setValueAtTime(1, now + remaining - fadeOut);
      gain.gain.linearRampToValueAtTime(0, now + remaining);
    }
    const record = { source, gain, key: value.key, offset: time, started: now }; voice = record;
    source.onended = () => {
      if (voice === record) { voice = null; finishedKey = record.key; }
      disconnect(record);
    };
    if (loop) source.start(now, time % buffer.duration);
    else source.start(now, time, remaining);
  }
  return {
    prepare() {
      if (!loading && !disposed) loading = (async () => {
        try {
          const response = await fetchAudio(url, { signal: abort.signal });
          if (!response.ok) throw new Error("Sound unavailable");
          const bytes = await response.arrayBuffer(); if (disposed) return;
          const decoded = await context.decodeAudioData(bytes); if (disposed) return;
          buffer = decoded; sync(desired);
        } catch { /* Sound failure never blocks a turn. */ }
      })();
      return loading;
    },
    sync(value) { if (!value.active) finishedKey = null; sync(value); },
    setMuted(value) { if (value) rememberPlayback(); muted = value; sync(desired); if (value) clearRetiring(); },
    setSuspended(value) { if (value) rememberPlayback(); suspended = value; sync(desired); if (value) clearRetiring(); },
    dispose() {
      disposed = true; abort.abort(); stop(0);
      clearRetiring();
      buffer = null; bus.disconnect();
    },
  };
}
