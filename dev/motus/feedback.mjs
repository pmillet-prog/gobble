const SOUND_FILES = {
  correct: "motus-lettre-bonne-reverb.mp3",
  present: "motus-lettre-mal-placee-reverb.mp3",
  absent: "motus-lettre-non-valide-reverb.mp3",
  won: "motus-mot-trouve.mp3",
  lost: "motus-perdu.mp3",
};

// Seconds measured in the decoded original recording. The coin overlaps the last arpeggio.
export const VICTORY_ARPEGGIOS = Object.freeze([
  Object.freeze({ start: 0.048, end: 0.516 }),
  Object.freeze({ start: 0.516, end: 0.995 }),
  Object.freeze({ start: 0.995, end: 1.474 }),
  Object.freeze({ start: 1.474, end: 1.953 }),
]);

export function victoryLetterAt(seconds, letterCount = 6) {
  const arpeggio = VICTORY_ARPEGGIOS.find(({ start, end }) => seconds >= start && seconds < end);
  return arpeggio ? Math.min(letterCount - 1, Math.floor((seconds - arpeggio.start) / (arpeggio.end - arpeggio.start) * letterCount)) : -1;
}

const createBrowserContext = () => {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Context ? new Context() : null;
};

// Owns decoded sounds, playing sources and the one temporary victory frame loop.
// The game controller emits semantic cues and never owns audio or animation state.
export function createMotusFeedback({
  onVictoryFrame,
  createContext = createBrowserContext,
  fetchSound = fetch,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  now = () => performance.now(),
} = {}) {
  let context = null;
  try { context = createContext(); } catch { /* Visual feedback still works without audio. */ }
  const output = context?.createGain();
  output?.connect(context.destination);
  const loading = new AbortController();
  const buffers = new Map();
  const sources = new Set();
  const ready = Object.fromEntries(Object.entries(SOUND_FILES).map(([name, file]) => [name,
    context ? Promise.resolve().then(async () => {
      const response = await fetchSound(new URL(`./assets/audio/${file}`, import.meta.url), { signal: loading.signal });
      if (!response.ok) throw new Error(`Son indisponible : ${file}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!loading.signal.aborted) buffers.set(name, buffer);
      return buffer;
    }).catch(() => null) : Promise.resolve(null),
  ]));
  let frame = null;
  let generation = 0;
  let disposed = false;
  let enabled = true;

  const stop = () => {
    generation++;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    for (const source of sources) {
      source.onended = null;
      try { source.stop(); } catch { /* The source may have just ended. */ }
      source.disconnect();
    }
    sources.clear();
    onVictoryFrame?.(null);
  };
  const play = buffer => {
    if (!buffer || disposed || context?.state !== "running") return null;
    let source;
    try {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.onended = () => { sources.delete(source); source.disconnect(); };
      sources.add(source);
      const start = context.currentTime;
      source.start(start);
      return start;
    } catch {
      sources.delete(source);
      source?.disconnect();
      return null;
    }
  };
  const celebrate = (row, token, audioStart) => {
    const wallStart = now();
    let previous = -1;
    const tick = () => {
      frame = null;
      if (disposed || token !== generation) return;
      const elapsed = audioStart === null ? (now() - wallStart) / 1000 : context.currentTime - audioStart;
      const column = victoryLetterAt(elapsed);
      if (column !== previous) {
        onVictoryFrame?.(column < 0 ? null : { row, column });
        previous = column;
      }
      if (elapsed < VICTORY_ARPEGGIOS.at(-1).end) frame = requestFrame(tick);
      else onVictoryFrame?.(null);
    };
    tick();
  };

  return {
    // Called synchronously from a real pointer/keyboard interaction, before reveal timers.
    unlock() {
      if (disposed || !context || context.state === "running") return;
      void context.resume().catch(() => {});
    },
    setEnabled(value) {
      enabled = Boolean(value);
      if (output) output.gain.value = enabled ? 1 : 0;
      return enabled;
    },
    cue(detail) {
      if (disposed) return;
      if (detail.type === "reset") { stop(); return; }
      if (detail.type === "letter") {
        // Never queue a late letter sound behind a slow asset download.
        play(buffers.get(detail.mark));
        return;
      }
      if (!["won", "lost"].includes(detail.type)) return;
      stop();
      const token = generation;
      void ready[detail.type].then(buffer => {
        if (disposed || token !== generation) return;
        const audioStart = play(buffer);
        if (detail.type === "won") celebrate(detail.row, token, audioStart);
      });
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      loading.abort();
      buffers.clear();
      output?.disconnect();
      void context?.close().catch(() => {});
    },
  };
}
