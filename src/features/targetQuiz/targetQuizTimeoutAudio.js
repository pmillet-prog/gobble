import AssetManager from "../../assets/assetManager.js";

export const TARGET_QUIZ_TIMEOUT_AUDIO_KEY = "target-quiz:out-of-time";
export const TARGET_QUIZ_TIMEOUT_AUDIO_MANIFEST = Object.freeze([
  { key: TARGET_QUIZ_TIMEOUT_AUDIO_KEY, type: "sfx", priority: "low", candidates: ["/sound/presenters/foukro/out of time.mp3"] },
]);

// The final cue may outlive the quiz view. A new session takes over this one
// short-lived voice; natural completion releases all of its listeners/nodes.
let retainedVoice = null;
const disconnect = node => { try { node?.disconnect(); } catch (_) {} };

export function createTargetQuizTimeoutAudio({
  assetManager = AssetManager,
  getNow = Date.now,
  canPlay = () => true,
  onTimeout = () => {},
  subscribeMute = null,
  document: visibilityTarget = globalThis.document,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  assetManager.registerManifest(TARGET_QUIZ_TIMEOUT_AUDIO_MANIFEST);
  let deadline = 0;
  let armed = false;
  let fired = false;
  let timer = null;
  let voice = null;
  let preparing = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
  };
  function releaseVoice(currentVoice) {
    if (currentVoice.released) return;
    currentVoice.released = true;
    const { handle, checkAllowed } = currentVoice;
    visibilityTarget?.removeEventListener?.("visibilitychange", checkAllowed);
    handle.ctx?.removeEventListener?.("statechange", checkAllowed);
    currentVoice.unsubscribeMute?.();
    if (handle.source) handle.source.onended = null;
    disconnect(handle.source);
    disconnect(handle.gainNode);
    if (voice === currentVoice) voice = null;
    if (retainedVoice === currentVoice) retainedVoice = null;
  }
  function stopVoice() {
    const currentVoice = voice;
    if (!currentVoice) return;
    try { currentVoice.handle.stop(0); } catch (_) {}
    releaseVoice(currentVoice);
  }
  function expire() {
    if (!armed || fired) return;
    clearTimer();
    armed = false;
    fired = true; // The callback may cause the view's leave() cleanup immediately.
    onTimeout();
    if (visibilityTarget?.hidden || !canPlay() || !assetManager.getAudioOutput() ||
        !assetManager.getSfxBuffer(TARGET_QUIZ_TIMEOUT_AUDIO_KEY)) return;
    retainedVoice?.cancel();
    const handle = assetManager.playSfx(TARGET_QUIZ_TIMEOUT_AUDIO_KEY, { rate: 1, allowQueue: false });
    if (!handle) return;
    const currentVoice = { handle, released: false, cancel: stopVoice };
    voice = currentVoice;
    retainedVoice = currentVoice;
    currentVoice.checkAllowed = () => {
      if (visibilityTarget?.hidden || !canPlay() || handle.ctx?.state !== "running") stopVoice();
    };
    const onEnded = handle.source?.onended;
    if (handle.source) handle.source.onended = event => {
      try { onEnded?.call(handle.source, event); }
      finally { releaseVoice(currentVoice); }
    };
    visibilityTarget?.addEventListener?.("visibilitychange", currentVoice.checkAllowed);
    handle.ctx?.addEventListener?.("statechange", currentVoice.checkAllowed);
    currentVoice.unsubscribeMute = subscribeMute?.(currentVoice.checkAllowed);
    if (currentVoice.released) currentVoice.unsubscribeMute?.();
    currentVoice.checkAllowed();
  }
  function checkDeadline() {
    clearTimer();
    if (!armed || fired) return;
    const remaining = deadline - getNow();
    if (remaining <= 0) expire();
    else timer = setTimeoutFn(checkDeadline, remaining);
  }
  function cancel() {
    clearTimer();
    armed = false;
    stopVoice();
  }

  return {
    prepare() {
      if (!preparing) {
        const pending = Promise.resolve().then(() => assetManager.preload({
          keys: [TARGET_QUIZ_TIMEOUT_AUDIO_KEY], includeTypes: ["sfx"], concurrency: 1,
        })).then(() => !!assetManager.getSfxBuffer(TARGET_QUIZ_TIMEOUT_AUDIO_KEY));
        preparing = pending;
        pending.finally(() => { if (preparing === pending) preparing = null; }).catch(() => {});
      }
      return preparing;
    },
    arm(endsAt) {
      if (fired) return false;
      if (!Number.isFinite(endsAt) || endsAt <= 0) { cancel(); return false; }
      deadline = endsAt;
      // Updating a previously armed deadline to now expires immediately. A
      // freshly mounted view with an old deadline must never play a late cue.
      armed = armed || deadline > getNow();
      if (!armed) return false;
      retainedVoice?.cancel();
      checkDeadline();
      return true;
    },
    leave() {
      if (armed && getNow() >= deadline) expire();
      else if (!fired) cancel();
    },
    cancel,
  };
}
