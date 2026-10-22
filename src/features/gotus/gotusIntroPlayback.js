import AssetManager from "../../assets/assetManager.js";

export const GOTUS_INTRO_DURATION_MS = 68132 / 48000 * 1000;
export const GOTUS_INTRO_MANIFEST = [{ key: "gotus:intro", type: "sfx", priority: "low",
  candidates: ["/sound/gotus/go-go-gotus-essai.wav"] }];

// One clock for the jingle and the zoom. Muting keeps that clock running;
// missing/locked audio uses the recorded duration without blocking the game.
export function createGotusIntroPlayback({ assetManager = AssetManager, onFrame, onFinish,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  assetManager.registerManifest(GOTUS_INTRO_MANIFEST);
  let disposed = false, started = false, enabled = true, frame = null, preparationTimer = null;
  let source = null, gain = null, ctx = null, releasePreparation = null;

  function cleanup() {
    if (frame !== null) cancelFrame(frame);
    if (preparationTimer !== null) cancel(preparationTimer);
    frame = preparationTimer = null;
    releasePreparation?.(); releasePreparation = null;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect(); source = null;
    }
    gain?.disconnect(); gain = null;
  }
  function finish() {
    if (disposed) return;
    disposed = true; cleanup(); onFinish?.();
  }
  async function start({ ready = Promise.resolve() } = {}) {
    if (started || disposed) return;
    started = true;
    await Promise.race([
      Promise.all([ready, Promise.resolve().then(() => assetManager.preload({ keys: ["gotus:intro"], includeTypes: ["sfx"] }))]).catch(() => {}),
      new Promise(resolve => { releasePreparation = resolve; preparationTimer = schedule(resolve, 1200); }),
    ]);
    if (preparationTimer !== null) cancel(preparationTimer);
    preparationTimer = null; releasePreparation = null;
    if (disposed) return;
    const buffer = assetManager.getSfxBuffer("gotus:intro");
    const durationMs = buffer?.duration > 0 ? buffer.duration * 1000 : GOTUS_INTRO_DURATION_MS;
    const route = assetManager.getAudioOutput();
    let audioStart = null;
    if (enabled && buffer && route?.ctx?.state === "running") {
      try {
        ctx = route.ctx; source = ctx.createBufferSource(); gain = ctx.createGain();
        source.buffer = buffer; source.connect(gain); gain.connect(route.output);
        audioStart = ctx.currentTime; source.start(audioStart);
      } catch { cleanup(); ctx = null; audioStart = null; }
    }
    const wallStart = now();
    const tick = () => {
      frame = null;
      if (disposed) return;
      // A suspended context must never leave the intro covering the game.
      if (audioStart !== null && ctx.state !== "running") { finish(); return; }
      const elapsedMs = audioStart === null ? now() - wallStart : (ctx.currentTime - audioStart) * 1000;
      const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
      onFrame?.({ progress, durationMs });
      if (progress >= 1) finish();
      else frame = requestFrame(tick);
    };
    tick();
  }
  return {
    start,
    setEnabled(value) { enabled = !!value; if (gain) gain.gain.value = enabled ? 1 : 0; },
    finish,
    dispose() { disposed = true; cleanup(); },
  };
}
