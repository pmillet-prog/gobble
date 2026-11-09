export const CELEBRATION_FADE_OUT_MS = 900;

// The sound may outlive its screen only for this short exit envelope. It never
// restarts, and hiding the page or muting it still silences it immediately.
export function fadeOutMediaAudio(audio, { durationMs = CELEBRATION_FADE_OUT_MS,
  documentTarget = globalThis.document, now = () => performance.now(),
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise(resolve => {
    let timer = null, released = false;
    const started = now(), volume = audio.volume;
    const release = () => {
      if (released) return;
      released = true;
      if (timer !== null) clearTimer(timer);
      documentTarget?.removeEventListener('visibilitychange', visibility);
      audio.removeEventListener('ended', release);
      audio.removeEventListener('pause', release);
      audio.pause(); audio.removeAttribute('src'); audio.load();
      resolve();
    };
    const visibility = () => { if (documentTarget.hidden) release(); };
    const step = () => {
      if (released) return;
      if (audio.paused || audio.ended || audio.muted || documentTarget?.hidden || !volume || durationMs <= 0) { release(); return; }
      const progress = Math.min(1, Math.max(0, (now() - started) / durationMs));
      audio.volume = volume * (1 - progress);
      if (progress >= 1) release();
      else timer = setTimer(step, Math.min(25, durationMs * (1 - progress)));
    };
    documentTarget?.addEventListener('visibilitychange', visibility);
    audio.addEventListener('ended', release);
    audio.addEventListener('pause', release);
    step();
  });
}
