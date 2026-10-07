import AssetManager from "../../assets/assetManager.js";

export const TARGET_QUIZ_FEEDBACK_AUDIO_KEYS = Object.freeze({
  correct: "target-quiz:correct",
  wrong: "target-quiz:wrong",
});

export const TARGET_QUIZ_FEEDBACK_AUDIO_MANIFEST = Object.freeze([
  { key: TARGET_QUIZ_FEEDBACK_AUDIO_KEYS.correct, type: "sfx", priority: "low", candidates: ["/sound/presenters/foukro/correct-short.wav"] },
  { key: TARGET_QUIZ_FEEDBACK_AUDIO_KEYS.wrong, type: "sfx", priority: "low", candidates: ["/sound/presenters/foukro/wrong-short.wav"] },
]);

const KEYS = Object.values(TARGET_QUIZ_FEEDBACK_AUDIO_KEYS);
const disconnect = node => { try { node?.disconnect(); } catch (_) {} };

// Verdict sounds own one SFX voice. They never pause, fade or alter the music.
export function createTargetQuizFeedbackAudio({ assetManager = AssetManager } = {}) {
  assetManager.registerManifest(TARGET_QUIZ_FEEDBACK_AUDIO_MANIFEST);
  let disposed = false;
  let preparing = null;
  let current = null;

  function release(voice) {
    if (voice.released) return;
    voice.released = true;
    voice.handle.ctx?.removeEventListener?.("statechange", voice.onStateChange);
    if (voice.handle.source) voice.handle.source.onended = null;
    disconnect(voice.handle.source);
    disconnect(voice.handle.gainNode);
    if (current === voice) current = null;
  }

  function stop() {
    const voice = current;
    if (!voice) return;
    try { voice.handle.stop(0); } catch (_) {}
    release(voice);
  }

  return {
    prepare() {
      if (disposed) return Promise.resolve(false);
      if (!preparing) {
        const pending = Promise.resolve().then(() => assetManager.preload({
          keys: KEYS, includeTypes: ["sfx"], concurrency: 2,
        })).then(() => !disposed && KEYS.every(key => !!assetManager.getSfxBuffer(key)));
        preparing = pending;
        pending.finally(() => { if (preparing === pending) preparing = null; }).catch(() => {});
      }
      return preparing;
    },
    play(correct) {
      if (disposed || typeof correct !== "boolean") return null;
      stop();
      const key = correct ? TARGET_QUIZ_FEEDBACK_AUDIO_KEYS.correct : TARGET_QUIZ_FEEDBACK_AUDIO_KEYS.wrong;
      if (!assetManager.getSfxBuffer(key) || !assetManager.getAudioOutput()) return null;
      // Duration/pitch edits are baked into the WAVs: always play the original rate.
      const handle = assetManager.playSfx(key, { rate: 1, allowQueue: false });
      if (!handle) return null;
      const voice = { handle, released: false };
      const onEnded = handle.source?.onended;
      voice.onStateChange = () => {
        if (current === voice && handle.ctx?.state !== "running") stop();
      };
      if (handle.source) handle.source.onended = event => {
        try { onEnded?.call(handle.source, event); }
        finally { release(voice); }
      };
      handle.ctx?.addEventListener?.("statechange", voice.onStateChange);
      current = voice;
      return handle;
    },
    stop,
    dispose() {
      disposed = true;
      stop();
    },
  };
}
