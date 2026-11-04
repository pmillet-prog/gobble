export const INTRO_AUDIO_DURATION = 5;
export const INTRO_AUDIO_FADE_START = 4;
const VOLUME = 0.75;

export function introAudioGain(time) {
  return VOLUME * Math.max(0, Math.min(1, (INTRO_AUDIO_DURATION - time) / (INTRO_AUDIO_DURATION - INTRO_AUDIO_FADE_START)));
}

// Only the short local excerpt is decoded. A scheduled GainNode fade works on
// mobile too, without depending on HTMLMediaElement.volume or render frequency.
export function createIntroAudio({ url, onStatus = () => {}, fetchAudio = globalThis.fetch,
  createContext = () => {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Context ? new Context() : null;
  } }) {
  let context = null, buffer = null, voice = null, pending = null, disposed = false, muted = false;
  let desired = { sequence: "intro", time: 0, playing: false }, lastStatus = null;
  const abort = new AbortController();
  function status(value) { if (!disposed && lastStatus !== value) { lastStatus = value; onStatus(value); } }
  function stop() {
    const previous = voice; voice = null;
    if (!previous) return;
    try { previous.source.stop(); } catch { /* Already ended. */ }
    previous.source.disconnect(); previous.gain.disconnect();
  }
  function sync(state) {
    if (disposed) return;
    desired = state;
    const time = Math.max(0, state.time || 0);
    if (muted || state.sequence !== "intro" || !state.playing || time >= INTRO_AUDIO_DURATION) { stop(); return; }
    if (!buffer || context?.state !== "running") return;
    const remaining = Math.min(INTRO_AUDIO_DURATION, buffer.duration) - time;
    if (remaining <= 0) { stop(); return; }
    // A real seek / restart creates one new voice. Ordinary timeline frames
    // leave sample-accurate audio scheduling alone.
    if (voice && Math.abs(voice.offset + context.currentTime - voice.started - time) <= 0.15) return;
    stop();
    const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime;
    source.buffer = buffer; source.connect(gain).connect(context.destination);
    gain.gain.setValueAtTime(introAudioGain(time), now);
    if (time < INTRO_AUDIO_FADE_START) gain.gain.setValueAtTime(VOLUME, now + INTRO_AUDIO_FADE_START - time);
    gain.gain.linearRampToValueAtTime(0, now + remaining);
    const record = { source, gain, offset: time, started: now }; voice = record;
    source.onended = () => {
      if (voice === record) voice = null;
      source.disconnect(); gain.disconnect();
    };
    source.start(now, time, remaining);
  }
  function contextChanged() {
    if (disposed || !buffer) return;
    status(context.state === "running" ? "ready" : "blocked");
    if (context.state === "running") sync(desired);
  }
  async function load() {
    try {
      context = createContext();
      if (!context) { status("unavailable"); return; }
      context.addEventListener?.("statechange", contextChanged);
      status("loading");
      const response = await fetchAudio(url, { signal: abort.signal });
      if (!response.ok) throw new Error("Intro audio unavailable");
      const bytes = await response.arrayBuffer();
      if (disposed) return;
      const decoded = await context.decodeAudioData(bytes);
      if (disposed) return;
      buffer = decoded; contextChanged();
    } catch { if (!disposed) status("error"); }
  }
  return {
    prepare() { if (!disposed) pending ||= load(); return pending; },
    sync,
    async unlock() {
      if (disposed) return;
      // resume() is invoked directly from the gesture, before any await.
      try { if (context && context.state !== "running" && context.state !== "closed") await context.resume(); }
      catch { status("blocked"); }
      contextChanged();
    },
    setMuted(value) { muted = value; if (muted) stop(); else sync(desired); },
    dispose() {
      disposed = true; abort.abort(); stop(); buffer = null;
      context?.removeEventListener?.("statechange", contextChanged);
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
