import { normalizeSoundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT } from '../../../audio/audioPreferences.js';

// Dedicated short UI cues: the finale keeps the game's ambient/effects buses
// silent. No downloaded asset, per-letter timeout or persistent audio context.
export function createFinaleFeedbackAudio({ createContext = () => {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Context ? new Context() : null;
} } = {}) {
  let context = null, settings = {}, hidden = false, disposed = false;
  const voices = new Set();
  const allowed = kind => !disposed && !hidden && !settings.isSfxMuted &&
    normalizeSoundMasterVolume(settings.soundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT) > 0 &&
    settings[kind === 'absent' ? 'soundInvalidErrorEnabled' : 'soundTileStepEnabled'] !== false;
  function stop() {
    for (const voice of voices) { voice.oscillator.onended = null; try { voice.oscillator.stop(); } catch {} voice.oscillator.disconnect(); voice.gain.disconnect(); }
    voices.clear();
  }
  function tone({ at, frequency, end = frequency, duration = .085, type = 'sine', level = .065 }) {
    const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + at;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level * normalizeSoundMasterVolume(settings.soundMasterVolume, SOUND_MASTER_VOLUME_DEFAULT), start + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    const voice = { oscillator, gain }; voices.add(voice);
    oscillator.onended = () => { voices.delete(voice); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .01);
  }
  return {
    unlock() {
      if (!allowed('reveal') && !allowed('absent')) return;
      try { context ||= createContext(); if (context?.state === 'suspended') void context.resume().catch(() => {}); } catch { context = null; }
    },
    setPreferences(value) { settings = value || {}; stop(); },
    setHidden(value) { hidden = value; if (hidden) stop(); },
    play(cue, reducedMotion = false) {
      stop();
      if (!cue || !allowed(cue.kind) || context?.state !== 'running') return;
      if (cue.kind === 'absent') tone({ at: 0, frequency: 220, end: 130, duration: .2, type: 'triangle', level: .08 });
      else {
        let previous = -Infinity;
        for (let i = 0; i < (reducedMotion ? 1 : cue.count); i++) {
          const at = reducedMotion ? 0 : (cue.flipMs / 2 + i * cue.stepMs) / 1000;
          // Dense batches retain the 1.5s visual timeline without an audio buzz.
          if (at - previous < .075) continue;
          tone({ at, frequency: [880, 988, 1175, 1319][i % 4] }); previous = at;
        }
      }
    },
    stop,
    dispose() { disposed = true; stop(); if (context) void context.close().catch(() => {}); context = null; },
  };
}
