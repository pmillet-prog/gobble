import AssetManager from "../../assets/assetManager.js";

const FILES = { correct: "motus-lettre-bonne-reverb.mp3", present: "motus-lettre-mal-placee-reverb.mp3", absent: "motus-lettre-non-valide-reverb.mp3", won: "motus-mot-trouve.mp3", lost: "motus-perdu.mp3" };
export const GOTUS_AUDIO_MANIFEST = Object.entries(FILES).map(([name, file]) => ({
  key: `gotus:${name}`, type: "sfx", priority: "low", candidates: [`/sound/gotus/${file}`],
}));
export const GOTUS_ARPEGGIOS = [[0.048, 0.516], [0.516, 0.995], [0.995, 1.474], [1.474, 1.953]];
export function gotusVictoryLetterAt(seconds) {
  const window = GOTUS_ARPEGGIOS.find(([start, end]) => seconds >= start && seconds < end);
  return window ? Math.min(5, Math.floor((seconds - window[0]) / (window[1] - window[0]) * 6)) : -1;
}

// Uses Gobble's already-unlocked audio graph; never creates/closes its own context.
export function createGotusFeedbackPlayer({ assetManager = AssetManager, onVictoryFrame,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, now = () => performance.now(),
} = {}) {
  assetManager.registerManifest(GOTUS_AUDIO_MANIFEST);
  const sources = new Set();
  let generation = 0, frame = null, disposed = false, enabled = true;
  void assetManager.preload({ keys: GOTUS_AUDIO_MANIFEST.map(item => item.key), includeTypes: ["sfx"], concurrency: 3 }).catch(() => {});
  const stop = () => {
    generation++;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    for (const playback of sources) {
      playback.source.onended = null;
      try { playback.source.stop(); } catch { /* Already ended. */ }
      playback.source.disconnect(); playback.gain.disconnect();
    }
    sources.clear(); onVictoryFrame?.(null);
  };
  const play = name => {
    const buffer = assetManager.getSfxBuffer(`gotus:${name}`), route = assetManager.getAudioOutput();
    if (!enabled || !buffer || !route?.ctx || route.ctx.state !== "running") return null;
    try {
      const source = route.ctx.createBufferSource(), gain = route.ctx.createGain();
      source.buffer = buffer; source.connect(gain); gain.connect(route.output);
      const playback = { source, gain };
      sources.add(playback);
      source.onended = () => { sources.delete(playback); source.disconnect(); gain.disconnect(); };
      const start = route.ctx.currentTime;
      source.start(start);
      return { ctx: route.ctx, start };
    } catch { return null; }
  };
  return {
    setEnabled(value) {
      enabled = !!value;
      for (const { gain } of sources) gain.gain.value = enabled ? 1 : 0;
    },
    cue(detail) {
      if (disposed) return;
      if (detail.type === "reset") { stop(); return; }
      if (detail.type === "letter") { play(detail.mark); return; }
      if (!["won", "lost"].includes(detail.type)) return;
      stop();
      const timeline = play(detail.type);
      if (detail.type !== "won") return;
      const token = generation, wallStart = now();
      let previous = -1;
      const tick = () => {
        frame = null;
        if (disposed || generation !== token) return;
        const elapsed = timeline ? timeline.ctx.currentTime - timeline.start : (now() - wallStart) / 1000;
        const column = gotusVictoryLetterAt(elapsed);
        if (column !== previous) { onVictoryFrame?.(column < 0 ? null : { row: detail.row, column }); previous = column; }
        if (elapsed < GOTUS_ARPEGGIOS.at(-1)[1]) frame = requestFrame(tick);
        else onVictoryFrame?.(null);
      };
      tick();
    },
    dispose() { if (!disposed) { stop(); disposed = true; } },
  };
}
