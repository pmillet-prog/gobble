const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = (value) => clamp(value, 0, 1);

export const SOUND_EQ = {
  // Default base settings
  default: {
    volume: 1,
    gain: 1,
    pitch: 1,
    pitchMin: 0.5,
    pitchMax: 2.0,
    stretch: 1, //plus grand, plus rapide
    reverb: 0,
    pan: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    cooldownMs: null,
  },
  // UI
  swipe: { volume: 0.3 },
  bipmontre: { volume: 0.45 },
  // Game
  tick: { volume: 0.5 },
  coeur: { volume: 1, stretch: 0.875 },
  countdownTick: { volume: 0.9 },
  vocabTick: { volume: 0.3, pitchMin: 0.35, pitchMax: 3 },
  vocabZero: { volume: 0.5, pitchMin: 0.35, pitchMax: 3 },
  vocabCling: { volume: 0.55, pitchMin: 0.35, pitchMax: 3 },
  vocabCling2: { volume: 0.5, pitchMin: 0.35, pitchMax: 3 },
  tileStep: { volume: 1, stretch: 1, pitch: 2 },
  invalidWord: { volume: 0.85 },
  dejaJoue: { volume: 0.2 },
  shortWord: { volume: 0.4 },
  gobbleVoice: { volume: 0.95 },
  score: { volume: 1, stretch: 2, pitch: 0.5 },
  score2: { volume: 1, stretch: 3.25, pitch: 1 },
  // Black hole
  blackHole: { volume: 0.7 },
  chebabeu: { volume: 1.5 },
  clavier: { volume: 0.9, stretch: 1 },
  souris: { volume: 0.9, stretch: 1 },
  roundStart: { volume: 0.95, stretch: 1 },
  specialFound: { volume: 0.9 },

  // Tournament
  tournamentFireworks: { volume: 0.9 },
  tournamentApplause: { volume: 0.95 },
  // Ambient
  ambient: { volume: 0.45 },
};

export function resolveSoundSettings(key, overrides = {}) {
  const base = SOUND_EQ.default || {};
  const eq = key && SOUND_EQ[key] ? SOUND_EQ[key] : {};
  const merged = { ...base, ...eq, ...overrides };
  const volume = clamp01((merged.volume ?? 1) * (merged.gain ?? 1));
  const pitchMin = Number.isFinite(merged.pitchMin) ? merged.pitchMin : 0.5;
  const pitchMax = Number.isFinite(merged.pitchMax) ? merged.pitchMax : 2.0;
  const pitch = clamp(merged.pitch ?? 1, pitchMin, pitchMax);
  const stretch = clamp(merged.stretch ?? 1, 0.5, 2.0);
  const reverb = clamp01(merged.reverb ?? 0);
  const pan = clamp(merged.pan ?? 0, -1, 1);
  const fadeInMs = Number.isFinite(merged.fadeInMs) ? Math.max(0, merged.fadeInMs) : 0;
  const fadeOutMs = Number.isFinite(merged.fadeOutMs) ? Math.max(0, merged.fadeOutMs) : 0;
  return { ...merged, volume, pitch, stretch, reverb, pan, fadeInMs, fadeOutMs };
}

export function applyHtmlAudioSettings(audio, settings) {
  if (!audio || !settings) return settings;
  const targetVolume = clamp01(settings.volume ?? 1);
  const fadeInMs = Number.isFinite(settings.fadeInMs) ? Math.max(0, settings.fadeInMs) : 0;
  const fadeOutMs = Number.isFinite(settings.fadeOutMs) ? Math.max(0, settings.fadeOutMs) : 0;
  const startFade = (to, durationMs) => {
    if (!durationMs || durationMs <= 0) {
      audio.volume = clamp01(to);
      return;
    }
    if (audio.__fadeRaf) {
      cancelAnimationFrame(audio.__fadeRaf);
      audio.__fadeRaf = null;
    }
    const from = clamp01(audio.volume ?? 0);
    const start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / Math.max(1, durationMs));
      const eased = t * (2 - t);
      audio.volume = clamp01(from + (to - from) * eased);
      if (t < 1) {
        audio.__fadeRaf = requestAnimationFrame(step);
      } else {
        audio.__fadeRaf = null;
      }
    };
    if (typeof requestAnimationFrame === "function") {
      audio.__fadeRaf = requestAnimationFrame(step);
    } else {
      audio.volume = clamp01(to);
    }
  };
  const scheduleFadeOut = () => {
    if (!fadeOutMs || fadeOutMs <= 0) return;
    if (audio.__fadeOutTimer) {
      clearTimeout(audio.__fadeOutTimer);
      audio.__fadeOutTimer = null;
    }
    const duration = audio.duration;
    const playbackRate = audio.playbackRate || 1;
    if (!Number.isFinite(duration) || duration <= 0) {
      const onMeta = () => scheduleFadeOut();
      audio.addEventListener("loadedmetadata", onMeta, { once: true });
      return;
    }
    const remainingMs = Math.max(
      0,
      ((duration - (audio.currentTime || 0)) * 1000) / Math.max(0.01, playbackRate)
    );
    const delay = Math.max(0, remainingMs - fadeOutMs);
    audio.__fadeOutTimer = setTimeout(() => {
      audio.__fadeOutTimer = null;
      startFade(0, fadeOutMs);
    }, delay);
  };
  if (fadeInMs > 0) {
    audio.volume = 0;
    if (audio.paused) {
      audio.addEventListener("play", () => startFade(targetVolume, fadeInMs), { once: true });
    } else {
      startFade(targetVolume, fadeInMs);
    }
  } else {
    audio.volume = targetVolume;
  }
  const pitch = settings.pitch ?? 1;
  const stretch = settings.stretch ?? 1;
  audio.playbackRate = pitch * stretch;
  // Allow pitch to change with playbackRate (browser defaults often preserve pitch).
  if ("preservesPitch" in audio) audio.preservesPitch = false;
  if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = false;
  if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = false;
  if (fadeOutMs > 0) {
    if (audio.paused) {
      audio.addEventListener("play", scheduleFadeOut, { once: true });
    } else {
      scheduleFadeOut();
    }
  }
  return settings;
}
