import React from "react";

import AssetManager from "../assets/assetManager";
import { SFX_KEYS } from "../assets/assetKeys";
import {
  AUDIO_COOLDOWNS_MS,
  INCREMENTAL_BASE_NOTE_INDEX,
  INCREMENTAL_BASE_SFX_KEY,
  INCREMENTAL_SOUND_COUNT,
  SCORE2_LOW_KEY,
  SCORE2_SFX_KEYS,
  SCORE_LOW_KEY,
  SCORE_SFX_KEYS,
  SCORE_SOUND_BANDS,
  VOCAB_SAMPLE_BASE_FREQ,
} from "./audioAssets";
import {
  connectSfxChain,
  humanizeFreq,
  humanizeGain,
  scheduleNodeCleanup,
  withEnvelope,
} from "./audioGraph";

export default function useGameSounds({
  appViewRef,
  devMode = false,
  getAudioSystem,
  isDailyPlayRef,
  isLoggedInRef,
  isMobileLayoutRef,
  isSfxMuted,
  mobileRoundIntroCountdownFrom = 3,
  nickname = "",
  nicknameRef,
  phaseRef,
  playCombinedScoreSound,
  playOneShotAudio,
  roundIdRef,
  shouldPlay,
  soundGobbleEnabled,
  soundInvalidErrorEnabled,
  soundTileStepEnabled,
  soundTimerEnabled,
  soundValidationEnabled,
  startVoiceCount,
} = {}) {
  const roundEndTickHandleRef = React.useRef(null);
  const roundStartHandleRef = React.useRef(null);
  const roundStartStopTimerRef = React.useRef(null);
  const roundStartSoundUntilRef = React.useRef(0);
  const introCountdownTickGuardRef = React.useRef({
    at: 0,
    token: 0,
    value: null,
    roundId: null,
  });
  const introCountdownHandleRef = React.useRef(null);
  const introCountdownStopTimerRef = React.useRef(null);
  const introCountdownPlayedRoundRef = React.useRef(null);
  const roundStartPendingRef = React.useRef(null);
  const roundStartRetryRef = React.useRef(false);

  function isPlayingContext() {
    return phaseRef?.current === "playing";
  }

  function hasPlayableSession({ allowDaily = true } = {}) {
    return !!isLoggedInRef?.current || (allowDaily && !!isDailyPlayRef?.current);
  }

  function playGobbleVoice() {
    if (!isPlayingContext()) return;
    if (!hasPlayableSession()) return;
    if (!soundGobbleEnabled) return;
    playOneShotAudio?.(SFX_KEYS.gobbleVoice, {
      cooldownKey: "gobbleVoice",
      eqKey: "gobbleVoice",
    });
  }

  function playDoubleGobbleVoice() {
    if (!isPlayingContext()) return;
    if (!hasPlayableSession()) return;
    if (!soundGobbleEnabled) return;
    playOneShotAudio?.(SFX_KEYS.doubleGobbleVoice, {
      cooldownKey: "gobbleVoice",
      eqKey: "gobbleVoice",
    });
  }

  function playBonusVoice() {
    if (!isPlayingContext()) return;
    if (!hasPlayableSession()) return;
    if (!soundGobbleEnabled) return;
    playOneShotAudio?.(SFX_KEYS.bonusVoice, {
      cooldownKey: "bonusVoice",
      eqKey: "bonusVoice",
    });
  }

  function playTileStepSound(step) {
    if (!soundTileStepEnabled) return;
    if (!Number.isFinite(step)) return;
    const semitoneOffset =
      Math.max(0, Math.min(INCREMENTAL_SOUND_COUNT - 1, Math.floor(step))) -
      INCREMENTAL_BASE_NOTE_INDEX;
    const pitch = Math.pow(2, semitoneOffset / 12);
    playOneShotAudio?.(INCREMENTAL_BASE_SFX_KEY, {
      cooldownKey: "tileStep",
      eqKey: "tileStep",
      pitch,
      ignorePolyphony: true,
    });
  }

  function stopRoundEndTickSound({ fadeMs = 120 } = {}) {
    const handle = roundEndTickHandleRef.current;
    if (!handle) return;
    if (fadeMs > 0) handle.fadeOut?.(fadeMs);
    else handle.stop?.();
    roundEndTickHandleRef.current = null;
  }

  function stopRoundStartSound({ fadeMs = 120 } = {}) {
    if (roundStartStopTimerRef.current) {
      clearTimeout(roundStartStopTimerRef.current);
      roundStartStopTimerRef.current = null;
    }
    const handle = roundStartHandleRef.current;
    if (!handle) {
      roundStartSoundUntilRef.current = 0;
      return;
    }
    if (fadeMs > 0) handle.fadeOut?.(fadeMs);
    else handle.stop?.();
    roundStartHandleRef.current = null;
    roundStartSoundUntilRef.current = 0;
  }

  function stopIntroCountdownSound({ fadeMs = 120 } = {}) {
    if (introCountdownStopTimerRef.current) {
      clearTimeout(introCountdownStopTimerRef.current);
      introCountdownStopTimerRef.current = null;
    }
    AssetManager.cancelQueuedSfx?.(SFX_KEYS.tictoc);
    const handle = introCountdownHandleRef.current;
    if (!handle) return;
    if (fadeMs > 0) handle.fadeOut?.(fadeMs);
    else handle.stop?.();
    introCountdownHandleRef.current = null;
  }

  function playTickSound({ isTargetRound } = {}) {
    if (!soundTimerEnabled) return;
    if (isSfxMuted) return;
    if (!isPlayingContext()) return;
    if (!hasPlayableSession()) return;
    stopRoundEndTickSound({ fadeMs: 0 });
    const soundKey = isTargetRound ? "coeur" : "tick";
    const assetKey = isTargetRound ? SFX_KEYS.coeur : SFX_KEYS.tictac10;
    roundEndTickHandleRef.current = playOneShotAudio?.(assetKey, {
      cooldownKey: "tick",
      eqKey: soundKey,
    });
  }

  function playCountdownTickSound(value = null, introToken = null) {
    if (!soundTimerEnabled) return;
    if (isSfxMuted) return;
    if (!isLoggedInRef?.current) return;
    if (Number.isFinite(value) && Number(value) !== mobileRoundIntroCountdownFrom) {
      return;
    }
    const roundKey = roundIdRef?.current || null;
    if (roundKey && introCountdownPlayedRoundRef.current === roundKey) {
      return;
    }
    if (isMobileLayoutRef?.current) {
      const roundId = roundIdRef?.current || null;
      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      const guard =
        introCountdownTickGuardRef.current || { at: 0, token: 0, value: null, roundId: null };
      const delta = now - (Number(guard.at) || 0);
      const sameRoundValue =
        value != null && roundId && guard.roundId === roundId && guard.value === value;
      const sameToken = introToken != null && guard.token === introToken;
      const sameValue = value != null && guard.value === value;
      if (
        (sameRoundValue && delta < 3200) ||
        (sameToken && sameValue && delta < 900) ||
        delta < 220
      ) {
        return;
      }
      introCountdownTickGuardRef.current = {
        at: now,
        token: introToken != null ? introToken : guard.token || 0,
        value: value != null ? value : null,
        roundId,
      };
    }
    stopIntroCountdownSound({ fadeMs: 0 });
    const handle = playOneShotAudio?.(SFX_KEYS.tictoc, {
      cooldownKey: "countdownTick",
      eqKey: "countdownTick",
      allowQueue: false,
    });
    if (!handle) return;
    introCountdownHandleRef.current = handle;
    if (roundKey) {
      introCountdownPlayedRoundRef.current = roundKey;
    }
    introCountdownStopTimerRef.current = setTimeout(() => {
      if (introCountdownHandleRef.current === handle) {
        handle.fadeOut?.(120);
        introCountdownHandleRef.current = null;
      }
      introCountdownStopTimerRef.current = null;
    }, 3000);
  }

  function playSwipeSound() {
    playOneShotAudio?.(SFX_KEYS.uiClick, { cooldownKey: "swipe", eqKey: "swipe" });
  }

  function playCloseSound() {
    playOneShotAudio?.(SFX_KEYS.uiClose, { cooldownKey: "bipmontre", eqKey: "bipmontre" });
  }

  function scheduleRoundStartRetry(roundKey) {
    if (roundStartRetryRef.current) return;
    roundStartRetryRef.current = true;
    const retry = () => {
      roundStartRetryRef.current = false;
      if (!isPlayingContext()) return;
      if (roundKey && roundIdRef?.current && roundIdRef.current !== roundKey) return;
      playRoundStartSound();
    };
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("touchstart", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
  }

  function playTournamentCelebrationSound() {
    if (!shouldPlay?.("tournamentCelebration", AUDIO_COOLDOWNS_MS.tournamentCelebration)) {
      return;
    }
    playOneShotAudio?.(SFX_KEYS.tournamentFireworks, {
      cooldownKey: "tournamentFireworks",
      eqKey: "tournamentFireworks",
    });
    setTimeout(() => {
      playOneShotAudio?.(SFX_KEYS.tournamentApplause, {
        cooldownKey: "tournamentApplause",
        eqKey: "tournamentApplause",
      });
    }, 260);
  }

  function playRoundStartSound() {
    if (!soundTimerEnabled) return;
    if (isSfxMuted) return;
    if (!isPlayingContext()) return;
    if (!hasPlayableSession()) return;
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    if (now < (roundStartSoundUntilRef.current || 0) - 20) return;
    stopRoundStartSound({ fadeMs: 0 });
    const handle = playOneShotAudio?.(SFX_KEYS.roundStart, {
      cooldownKey: "roundStart",
      eqKey: "roundStart",
      allowQueue: false,
      onBlocked: () => {
        const roundKey = roundIdRef?.current || null;
        if (!roundKey) return;
        roundStartPendingRef.current = roundKey;
        scheduleRoundStartRetry(roundKey);
      },
    });
    if (!handle) return;
    const maxDurationMs = 3000;
    roundStartHandleRef.current = handle;
    roundStartSoundUntilRef.current = now + maxDurationMs;
    roundStartStopTimerRef.current = setTimeout(() => {
      if (roundStartHandleRef.current === handle) {
        handle.fadeOut?.(120);
        roundStartHandleRef.current = null;
      }
      roundStartSoundUntilRef.current = 0;
      roundStartStopTimerRef.current = null;
    }, maxDurationMs);
  }

  function playScoreSound(points) {
    if (!isPlayingContext()) return;
    if (!hasPlayableSession()) return;
    if (!soundValidationEnabled) return;
    if (isSfxMuted) return;
    const safePoints = Number.isFinite(points) ? Math.max(0, points) : 0;
    const useCombinedScoreSfx = !!isMobileLayoutRef?.current;
    if (safePoints <= 2) {
      if (safePoints < 1) return;
      if (useCombinedScoreSfx && playCombinedScoreSound?.(SCORE_LOW_KEY, SCORE2_LOW_KEY)) {
        return;
      }
      playOneShotAudio?.(SCORE_LOW_KEY, {
        cooldownKey: "score",
        cooldownMs: 0,
        eqKey: "score",
        ignorePolyphony: true,
      });
      playOneShotAudio?.(SCORE2_LOW_KEY, {
        cooldownKey: "score2",
        cooldownMs: 0,
        eqKey: "score2",
        ignorePolyphony: true,
      });
      return;
    }
    const bandIndex =
      SCORE_SOUND_BANDS.findIndex(
        (entry) => safePoints >= entry.min && safePoints <= entry.max
      ) || 0;
    const scoreKey = SCORE_SFX_KEYS[bandIndex] || SCORE_SFX_KEYS[0];
    const pianoKey = SCORE2_SFX_KEYS[bandIndex] || SCORE2_SFX_KEYS[0];
    if (useCombinedScoreSfx && playCombinedScoreSound?.(scoreKey, pianoKey)) {
      return;
    }
    const primaryHandle = playOneShotAudio?.(scoreKey, {
      cooldownKey: "score",
      cooldownMs: 0,
      eqKey: "score",
      ignorePolyphony: true,
    });
    const pianoHandle = playOneShotAudio?.(pianoKey, {
      cooldownKey: "score2",
      cooldownMs: 0,
      eqKey: "score2",
      ignorePolyphony: true,
    });
    if (!primaryHandle) {
      playOneShotAudio?.(SCORE_LOW_KEY, {
        cooldownKey: "score",
        cooldownMs: 0,
        eqKey: "score",
        ignorePolyphony: true,
      });
    }
    if (!pianoHandle) {
      playOneShotAudio?.(SCORE2_LOW_KEY, {
        cooldownKey: "score2",
        cooldownMs: 0,
        eqKey: "score2",
        ignorePolyphony: true,
      });
    }
  }

  function playVocabOverlayTone(
    freq,
    durationMs = 120,
    gainValue = 0.14,
    soundKey = "vocabTick",
    sampleKey = SFX_KEYS.vocabOverlay
  ) {
    if (isSfxMuted) return;
    const jitteredFreq = humanizeFreq(freq, 4);
    const pitch = jitteredFreq / VOCAB_SAMPLE_BASE_FREQ;
    const cooldownTag = `${soundKey}:${Math.round(pitch * 1000)}`;
    playOneShotAudio?.(sampleKey, {
      cooldownKey: cooldownTag,
      cooldownMs: 0,
      eqKey: soundKey,
      pitch,
      ignorePolyphony: true,
    });
  }

  function playVocabOverlayTickSound(wordIndex) {
    if (!Number.isFinite(wordIndex) || wordIndex <= 0) return;
    const idx = Math.floor(wordIndex);
    const low = 220;
    const mid = 440;
    const high = 660;
    let freq = high;
    if (idx <= 10) {
      const t = (idx - 1) / 9;
      freq = low + (mid - low) * t;
    } else if (idx <= 20) {
      const t = (idx - 11) / 9;
      freq = mid + (high - mid) * t;
    }
    playVocabOverlayTone(freq, 95, 0.1, "vocabTick");
  }

  function playVocabOverlayZeroSound() {
    playVocabOverlayTone(170, 520, 0.16, "vocabZero");
  }

  function playVocabOverlayClingSound() {
    playVocabOverlayTone(880, 110, 0.14, "vocabCling", SFX_KEYS.vocabCling);
    setTimeout(
      () => playVocabOverlayTone(1320, 160, 0.12, "vocabCling2", SFX_KEYS.vocabCling),
      70
    );
  }

  function debugVocabTickBurst(count = 20, intervalMs = 28) {
    const safeCount = Math.max(1, Math.floor(count));
    const safeInterval = Math.max(8, Math.floor(intervalMs));
    for (let i = 0; i < safeCount; i += 1) {
      const t = safeCount > 1 ? i / (safeCount - 1) : 0;
      const freq = 220 + (1320 - 220) * t;
      setTimeout(() => playVocabOverlayTone(freq, 90, 0.12, "vocabTick"), i * safeInterval);
    }
  }

  React.useEffect(() => {
    if (!devMode || typeof window === "undefined") return undefined;
    window.__debugVocabTicks = () => debugVocabTickBurst();
    return () => {
      try {
        delete window.__debugVocabTicks;
      } catch (_) {}
    };
  }, [devMode]);

  function playSpecialFoundSound() {
    if (!isPlayingContext()) return;
    const view = appViewRef?.current;
    if (view === "daily" || view === "daily_play" || view === "daily_results") return;
    if (isSfxMuted) return;
    playOneShotAudio?.(SFX_KEYS.specialFound, {
      cooldownKey: "specialFound",
      eqKey: "specialFound",
    });
  }

  function maybePlayAnnouncementSound(item) {
    if (!item) return;
    if (item.type !== "best_possible_score" && item.type !== "longest_possible") {
      return;
    }
    const selfRaw = (nicknameRef?.current || nickname || "").trim();
    const authorRaw = (item.nick || "").trim();
    const self = selfRaw ? selfRaw.toLowerCase() : "";
    const author = authorRaw ? authorRaw.toLowerCase() : "";
    if (!self || !author || self !== author) return;
    playGobbleVoice();
  }

  function playDefeatTone(freqs = [280, 220], soundKey = "error") {
    if (isSfxMuted) return;
    if (!shouldPlay?.(soundKey, AUDIO_COOLDOWNS_MS[soundKey] ?? 120)) return;
    const system = getAudioSystem?.();
    if (!system) return;
    const { ctx } = system;
    const start = () => {
      if (ctx.state !== "running") return;
      const now = ctx.currentTime + 0.01;
      const master = ctx.createGain();
      master.gain.setValueAtTime(humanizeGain(0.9, 1.0), now);
      const fxNodes = connectSfxChain(
        ctx,
        system,
        master,
        {
          filter: { type: "lowpass", base: 1800, peak: 4200, q: 0.8, attack: 0.02, release: 0.12 },
          saturation: 0.7,
          panRange: 0.12,
          reverbSend: 0.06,
        },
        now
      );
      const nodes = [master, ...fxNodes];
      let lastStop = now;
      let lastOsc = null;
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + idx * 0.1;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(humanizeFreq(freq, 5), t0);
        const endTime = withEnvelope(
          gain,
          t0,
          0.006,
          humanizeGain(0.14, 1.4),
          0.05,
          0.16
        );
        const stopTime = endTime + 0.02;
        osc.connect(gain);
        gain.connect(master);
        nodes.push(osc, gain);
        if (stopTime > lastStop) lastStop = stopTime;
        lastOsc = osc;
        try {
          osc.start(t0);
          osc.stop(stopTime);
        } catch (_) {}
      });
      const finalStopTime = lastStop;
      const cleanup = startVoiceCount?.(soundKey, finalStopTime - ctx.currentTime + 0.1);
      const finalize = scheduleNodeCleanup(ctx, finalStopTime + 0.05, nodes, cleanup);
      if (lastOsc) lastOsc.onended = finalize;
    };
    ctx.resume().then(start).catch(start);
  }

  function playErrorSound() {
    if (!soundInvalidErrorEnabled) return;
    playDefeatTone([290, 230], "error");
  }

  function playInvalidWordSound() {
    if (!soundInvalidErrorEnabled) return;
    if (isSfxMuted) return;
    playOneShotAudio?.(SFX_KEYS.invalidWord, {
      cooldownKey: "invalidWord",
      eqKey: "invalidWord",
    });
  }

  function playShortWordSound() {
    if (!soundValidationEnabled) return;
    if (isSfxMuted) return;
    playOneShotAudio?.(SFX_KEYS.shortWord, {
      cooldownKey: "shortWord",
      eqKey: "shortWord",
    });
  }

  function playAlreadyPlayedSound() {
    if (!soundInvalidErrorEnabled) return;
    if (isSfxMuted) return;
    playOneShotAudio?.(SFX_KEYS.dejaJoue, {
      cooldownKey: "dejaJoue",
      eqKey: "dejaJoue",
    });
  }

  function playDuplicateErrorTone() {
    if (!soundInvalidErrorEnabled) return;
    playDefeatTone([320, 260], "duplicate");
  }

  function playDailySpecialLockValidationSound() {
    if (!soundValidationEnabled || isSfxMuted) return;
    const soundKey = "dailySpecialLockValidation";
    if (!shouldPlay?.(soundKey, 55, { ignorePolyphony: true })) return;
    const system = getAudioSystem?.();
    if (!system) return;
    const { ctx } = system;
    const start = () => {
      if (ctx.state !== "running") return;
      const now = ctx.currentTime + 0.008;
      const master = ctx.createGain();
      master.gain.setValueAtTime(humanizeGain(0.95, 0.8), now);
      const fxNodes = connectSfxChain(
        ctx,
        system,
        master,
        {
          filter: {
            type: "bandpass",
            base: 1100,
            peak: 2800,
            q: 1.1,
            attack: 0.01,
            release: 0.16,
          },
          saturation: 0.8,
          panRange: 0.06,
          reverbSend: 0.08,
        },
        now
      );
      const nodes = [master, ...fxNodes];
      let lastStop = now;
      let lastOsc = null;
      const notes = [
        { freq: 720, offset: 0, attack: 0.004, hold: 0.045, release: 0.07, gain: 0.11, type: "triangle" },
        { freq: 1080, offset: 0.052, attack: 0.003, hold: 0.055, release: 0.1, gain: 0.125, type: "sine" },
      ];
      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + note.offset;
        osc.type = note.type;
        osc.frequency.setValueAtTime(humanizeFreq(note.freq, 3), t0);
        const endTime = withEnvelope(
          gain,
          t0,
          note.attack,
          humanizeGain(note.gain, 0.7),
          note.hold,
          note.release
        );
        const stopTime = endTime + 0.025;
        osc.connect(gain);
        gain.connect(master);
        nodes.push(osc, gain);
        if (stopTime > lastStop) lastStop = stopTime;
        lastOsc = osc;
        try {
          osc.start(t0);
          osc.stop(stopTime);
        } catch (_) {}
      });
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      const clickAt = now + 0.01;
      clickOsc.type = "square";
      clickOsc.frequency.setValueAtTime(humanizeFreq(1900, 5), clickAt);
      const clickEnd = withEnvelope(clickGain, clickAt, 0.0015, humanizeGain(0.03, 0.5), 0.004, 0.02);
      const clickStop = clickEnd + 0.01;
      clickOsc.connect(clickGain);
      clickGain.connect(master);
      nodes.push(clickOsc, clickGain);
      if (clickStop > lastStop) lastStop = clickStop;
      try {
        clickOsc.start(clickAt);
        clickOsc.stop(clickStop);
      } catch (_) {}
      const finalStopTime = lastStop;
      const cleanup = startVoiceCount?.(soundKey, finalStopTime - ctx.currentTime + 0.08);
      const finalize = scheduleNodeCleanup(ctx, finalStopTime + 0.05, nodes, cleanup);
      if (lastOsc) {
        lastOsc.onended = finalize;
      } else {
        setTimeout(finalize, Math.max(30, Math.round((finalStopTime - ctx.currentTime) * 1000)));
      }
    };
    ctx.resume().then(start).catch(start);
  }

  return {
    introCountdownTickGuardRef,
    introCountdownPlayedRoundRef,
    roundEndTickHandleRef,
    roundStartPendingRef,
    roundStartRetryRef,
    maybePlayAnnouncementSound,
    playAlreadyPlayedSound,
    playBonusVoice,
    playCloseSound,
    playCountdownTickSound,
    playDailySpecialLockValidationSound,
    playDoubleGobbleVoice,
    playDuplicateErrorTone,
    playErrorSound,
    playGobbleVoice,
    playInvalidWordSound,
    playRoundStartSound,
    playScoreSound,
    playShortWordSound,
    playSpecialFoundSound,
    playSwipeSound,
    playTickSound,
    playTileStepSound,
    playTournamentCelebrationSound,
    playVocabOverlayClingSound,
    playVocabOverlayTickSound,
    playVocabOverlayZeroSound,
    stopIntroCountdownSound,
    stopRoundEndTickSound,
    stopRoundStartSound,
  };
}
