import React from "react";

import AssetManager from "../assets/assetManager";
import { SFX_KEYS } from "../assets/assetKeys";
import { resolveSoundSettings } from "./equalizer";
import {
  AUDIO_COOLDOWN_MAX_KEYS,
  AUDIO_COOLDOWN_PRUNE_MS,
  AUDIO_COOLDOWNS_MS,
  AUDIO_MASTER_GAIN,
  AUDIO_POLYPHONY_LIMIT,
  DEBUG_AUDIO,
  SOUND_MASTER_VOLUME_DEFAULT,
  normalizeSoundMasterVolume,
} from "./audioAssets";
import {
  createReverbImpulse,
  createSoftClipCurve,
} from "./audioGraph";

function clampAudioSample(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export default function useAudioEngine({
  isSfxMuted,
  soundMasterVolume,
  soundMasterVolumeRef,
} = {}) {
  const audioCtxRef = React.useRef(null);
  const audioSystemRef = React.useRef(null);
  const audioUnlockedRef = React.useRef(false);
  const audioVoiceRef = React.useRef({
    activeVoices: 0,
    maxVoices: AUDIO_POLYPHONY_LIMIT,
    lastPlayed: new Map(),
    drops: 0,
    lastLogAt: 0,
    lastPruneAt: 0,
  });
  const combinedScoreBufferCacheRef = React.useRef({
    ctx: null,
    buffers: new Map(),
  });
  const blackHoleHandleRef = React.useRef(null);
  const blackHoleChebHandleRef = React.useRef(null);
  const blackHoleClavierHandleRef = React.useRef(null);
  const blackHoleSourisLoopRef = React.useRef({ intervalId: null, stopTimer: null });
  const blackHoleClavierFadeRef = React.useRef(null);
  const blackHoleAuxStopRef = React.useRef(null);
  const blackHoleSyncTokenRef = React.useRef(0);

  const getAudioSystem = React.useCallback(
    ({ force = false } = {}) => {
      if (!force && !audioUnlockedRef.current) return null;
      const AudioCtx =
        typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
      if (!AudioCtx) return null;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioCtx();
        audioSystemRef.current = null;
        audioVoiceRef.current.activeVoices = 0;
        audioVoiceRef.current.lastPlayed = new Map();
        audioVoiceRef.current.drops = 0;
        audioVoiceRef.current.lastPruneAt = 0;
      }
      const ctx = audioCtxRef.current;
      if (!audioSystemRef.current || audioSystemRef.current.ctx !== ctx) {
        const busIn = ctx.createGain();
        const masterGain = ctx.createGain();
        masterGain.gain.value =
          AUDIO_MASTER_GAIN *
          normalizeSoundMasterVolume(
            soundMasterVolumeRef?.current,
            SOUND_MASTER_VOLUME_DEFAULT
          );

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 24;
        compressor.ratio.value = 10;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.2;

        const limiter = ctx.createWaveShaper();
        limiter.curve = createSoftClipCurve(1.25);
        limiter.oversample = "4x";

        const reverbIn = ctx.createGain();
        const reverb = ctx.createConvolver();
        const reverbHP = ctx.createBiquadFilter();
        const reverbLP = ctx.createBiquadFilter();
        const reverbGain = ctx.createGain();
        reverb.buffer = createReverbImpulse(ctx, 0.35, 2.4);
        reverbHP.type = "highpass";
        reverbHP.frequency.value = 220;
        reverbLP.type = "lowpass";
        reverbLP.frequency.value = 7200;
        reverbGain.gain.value = 0.22;

        reverbIn.connect(reverb);
        reverb.connect(reverbHP);
        reverbHP.connect(reverbLP);
        reverbLP.connect(reverbGain);
        reverbGain.connect(busIn);

        busIn.connect(masterGain);
        masterGain.connect(compressor);
        compressor.connect(limiter);
        limiter.connect(ctx.destination);

        audioSystemRef.current = {
          ctx,
          busIn,
          masterGain,
          compressor,
          limiter,
          reverb,
          reverbHP,
          reverbLP,
          reverbIn,
          reverbGain,
        };
      }
      return audioSystemRef.current;
    },
    [soundMasterVolumeRef]
  );

  const logAudioDrop = React.useCallback((reason, soundKey) => {
    if (!DEBUG_AUDIO) return;
    const state = audioVoiceRef.current;
    const now = Date.now();
    if (now - state.lastLogAt < 150) return;
    state.lastLogAt = now;
    console.debug(
      `[audio] drop:${reason} ${soundKey} active=${state.activeVoices}/${state.maxVoices} drops=${state.drops}`
    );
  }, []);

  const pruneAudioCooldownState = React.useCallback((now) => {
    const state = audioVoiceRef.current;
    const currentNow = Number.isFinite(now)
      ? now
      : typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
    if (currentNow - (state.lastPruneAt || 0) < AUDIO_COOLDOWN_PRUNE_MS) return;
    state.lastPruneAt = currentNow;
    const cutoff = currentNow - AUDIO_COOLDOWN_PRUNE_MS;
    const map = state.lastPlayed;
    if (!(map instanceof Map) || map.size === 0) {
      AssetManager.compactAudioState?.({ nowMs: Date.now() });
      return;
    }

    map.forEach((lastAt, key) => {
      if (!Number.isFinite(lastAt) || lastAt < cutoff) {
        map.delete(key);
      }
    });
    if (map.size > AUDIO_COOLDOWN_MAX_KEYS) {
      const latest = Array.from(map.entries())
        .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
        .slice(0, AUDIO_COOLDOWN_MAX_KEYS);
      state.lastPlayed = new Map(latest);
    }
    AssetManager.compactAudioState?.({ nowMs: Date.now() });
  }, []);

  const shouldPlay = React.useCallback(
    (soundKey, cooldownMs, { ignorePolyphony = false } = {}) => {
      const state = audioVoiceRef.current;
      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      pruneAudioCooldownState(now);
      const maxVoices = AUDIO_POLYPHONY_LIMIT;
      if (state.maxVoices !== maxVoices) state.maxVoices = maxVoices;
      const minInterval =
        Number.isFinite(cooldownMs) && cooldownMs >= 0
          ? cooldownMs
          : AUDIO_COOLDOWNS_MS[soundKey] ?? 0;
      const last = state.lastPlayed.get(soundKey) || 0;
      if (minInterval > 0 && now - last < minInterval) {
        state.drops += 1;
        logAudioDrop("cooldown", soundKey);
        return false;
      }
      if (!ignorePolyphony && state.activeVoices >= state.maxVoices) {
        state.drops += 1;
        logAudioDrop("polyphony", soundKey);
        return false;
      }
      state.lastPlayed.set(soundKey, now);
      return true;
    },
    [logAudioDrop, pruneAudioCooldownState]
  );

  const startVoiceCount = React.useCallback((soundKey, durationSec) => {
    const state = audioVoiceRef.current;
    state.activeVoices += 1;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      state.activeVoices = Math.max(0, state.activeVoices - 1);
    };
    if (Number.isFinite(durationSec) && durationSec > 0) {
      setTimeout(cleanup, Math.ceil(durationSec * 1000) + 30);
    }
    return cleanup;
  }, []);

  const playOneShotAudio = React.useCallback(
    (
      assetKey,
      {
        volume,
        cooldownKey,
        cooldownMs,
        eqKey,
        pitch,
        onBlocked,
        ignorePolyphony,
        allowQueue = true,
      } = {}
    ) => {
      if (isSfxMuted) return null;
      const key = cooldownKey || eqKey || assetKey;
      const overrides = {};
      if (Number.isFinite(volume)) overrides.volume = volume;
      if (Number.isFinite(pitch)) overrides.pitch = pitch;
      const settings = resolveSoundSettings(eqKey || key, overrides);
      const effectiveCooldown =
        Number.isFinite(cooldownMs) && cooldownMs >= 0 ? cooldownMs : settings.cooldownMs;
      if (!shouldPlay(key, effectiveCooldown, { ignorePolyphony: !!ignorePolyphony })) {
        return null;
      }
      const rate = (settings.pitch ?? 1) * (settings.stretch ?? 1);
      const handle = AssetManager.playSfx(assetKey, {
        eqKey: eqKey || key,
        gain: settings.volume ?? 1,
        rate,
        allowQueue,
      });
      if (!handle) {
        if (typeof onBlocked === "function") onBlocked();
        return null;
      }
      if (!ignorePolyphony) {
        const buffer = AssetManager.getSfxBuffer(assetKey);
        const duration = buffer ? buffer.duration / Math.max(0.01, rate) : 0.6;
        startVoiceCount(key, duration);
      }
      return handle;
    },
    [isSfxMuted, shouldPlay, startVoiceCount]
  );

  const playSfxHandle = React.useCallback(
    (assetKey, { eqKey, gain, rate, voiceKey, allowQueue = true } = {}) => {
      if (isSfxMuted) return null;
      const key = voiceKey || eqKey || assetKey;
      const settings = resolveSoundSettings(eqKey || key, {
        volume: Number.isFinite(gain) ? gain : undefined,
      });
      const effectiveRate =
        Number.isFinite(rate) ? rate : (settings.pitch ?? 1) * (settings.stretch ?? 1);
      const handle = AssetManager.playSfx(assetKey, {
        eqKey: eqKey || key,
        gain: settings.volume ?? 1,
        rate: effectiveRate,
        allowQueue,
      });
      const buffer = AssetManager.getSfxBuffer(assetKey);
      if (handle && buffer) {
        const duration = buffer.duration / Math.max(0.01, effectiveRate);
        startVoiceCount(key, duration);
      }
      return handle;
    },
    [isSfxMuted, startVoiceCount]
  );

  const getCombinedScoreBuffer = React.useCallback(
    (primaryKey, pianoKey) => {
      const system = getAudioSystem();
      if (!system?.ctx || !primaryKey || !pianoKey) return null;
      const ctx = system.ctx;
      const cache = combinedScoreBufferCacheRef.current;
      if (cache.ctx !== ctx) {
        cache.ctx = ctx;
        cache.buffers = new Map();
      }
      const cacheKey = `${primaryKey}|${pianoKey}`;
      if (cache.buffers.has(cacheKey)) return cache.buffers.get(cacheKey) || null;

      const primaryBuffer = AssetManager.getSfxBuffer(primaryKey);
      const pianoBuffer = AssetManager.getSfxBuffer(pianoKey);
      if (!primaryBuffer || !pianoBuffer) return null;

      const primarySettings = resolveSoundSettings("score");
      const pianoSettings = resolveSoundSettings("score2");
      const primaryRate = Math.max(
        0.01,
        (primarySettings.pitch ?? 1) * (primarySettings.stretch ?? 1)
      );
      const pianoRate = Math.max(
        0.01,
        (pianoSettings.pitch ?? 1) * (pianoSettings.stretch ?? 1)
      );
      const primaryGain = Number.isFinite(primarySettings.volume) ? primarySettings.volume : 1;
      const pianoGain = Number.isFinite(pianoSettings.volume) ? pianoSettings.volume : 1;
      const channelCount = Math.max(
        1,
        primaryBuffer.numberOfChannels || 1,
        pianoBuffer.numberOfChannels || 1
      );
      const outDuration = Math.max(
        primaryBuffer.duration / primaryRate,
        pianoBuffer.duration / pianoRate
      );
      const outLength = Math.max(1, Math.ceil(outDuration * ctx.sampleRate));
      const mixed = ctx.createBuffer(channelCount, outLength, ctx.sampleRate);

      const mixLayer = (buffer, rate, gainValue) => {
        const srcRateScale = (buffer.sampleRate || ctx.sampleRate) / ctx.sampleRate;
        for (let ch = 0; ch < channelCount; ch += 1) {
          const srcData = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
          const dstData = mixed.getChannelData(ch);
          for (let i = 0; i < outLength; i += 1) {
            const srcPos = i * rate * srcRateScale;
            const baseIndex = Math.floor(srcPos);
            if (baseIndex >= srcData.length) break;
            const nextIndex = Math.min(srcData.length - 1, baseIndex + 1);
            const frac = srcPos - baseIndex;
            const sample = srcData[baseIndex] + (srcData[nextIndex] - srcData[baseIndex]) * frac;
            dstData[i] += sample * gainValue;
          }
        }
      };

      mixLayer(primaryBuffer, primaryRate, primaryGain);
      mixLayer(pianoBuffer, pianoRate, pianoGain);

      for (let ch = 0; ch < channelCount; ch += 1) {
        const data = mixed.getChannelData(ch);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = clampAudioSample(data[i]);
        }
      }

      cache.buffers.set(cacheKey, mixed);
      return mixed;
    },
    [getAudioSystem]
  );

  const playCombinedScoreSound = React.useCallback(
    (primaryKey, pianoKey) => {
      const system = getAudioSystem();
      if (!system?.ctx || !system.busIn) return false;
      const buffer = getCombinedScoreBuffer(primaryKey, pianoKey);
      if (!buffer) return false;
      const source = system.ctx.createBufferSource();
      const gainNode = system.ctx.createGain();
      source.buffer = buffer;
      gainNode.gain.value = 1;
      source.connect(gainNode);
      gainNode.connect(system.busIn);
      source.onended = () => {
        try {
          source.disconnect();
        } catch (_) {}
        try {
          gainNode.disconnect();
        } catch (_) {}
      };
      source.start();
      return true;
    },
    [getAudioSystem, getCombinedScoreBuffer]
  );

  const stopBlackHoleAudio = React.useCallback(({ fadeMs = 220 } = {}) => {
    blackHoleSyncTokenRef.current += 1;
    AssetManager.cancelQueuedSfx?.(SFX_KEYS.blackHole);
    AssetManager.cancelQueuedSfx?.(SFX_KEYS.chebabeu);
    AssetManager.cancelQueuedSfx?.(SFX_KEYS.clavier);
    AssetManager.cancelQueuedSfx?.(SFX_KEYS.souris);
    if (blackHoleSourisLoopRef.current.intervalId) {
      clearInterval(blackHoleSourisLoopRef.current.intervalId);
      blackHoleSourisLoopRef.current.intervalId = null;
    }
    if (blackHoleSourisLoopRef.current.stopTimer) {
      clearTimeout(blackHoleSourisLoopRef.current.stopTimer);
      blackHoleSourisLoopRef.current.stopTimer = null;
    }
    if (blackHoleClavierFadeRef.current) {
      clearTimeout(blackHoleClavierFadeRef.current);
      blackHoleClavierFadeRef.current = null;
    }
    if (blackHoleAuxStopRef.current) {
      clearTimeout(blackHoleAuxStopRef.current);
      blackHoleAuxStopRef.current = null;
    }
    if (blackHoleHandleRef.current) {
      blackHoleHandleRef.current.stop?.();
      blackHoleHandleRef.current = null;
    }
    if (blackHoleChebHandleRef.current) {
      blackHoleChebHandleRef.current.stop?.();
      blackHoleChebHandleRef.current = null;
    }
    if (blackHoleClavierHandleRef.current) {
      if (fadeMs > 0) blackHoleClavierHandleRef.current.fadeOut?.(fadeMs);
      else blackHoleClavierHandleRef.current.stop?.();
      blackHoleClavierHandleRef.current = null;
    }
  }, []);

  const requestAudioUnlock = React.useCallback(
    (event) => {
      if (event && event.isTrusted === false) return false;
      const hasGesture = !!event;
      if (!hasGesture && !audioUnlockedRef.current) return false;
      if (!audioUnlockedRef.current) {
        audioUnlockedRef.current = true;
      }
      void AssetManager.unlockAudio();
      const system = getAudioSystem({ force: true });
      if (system?.ctx && system.ctx.state === "suspended") {
        system.ctx.resume().catch(() => {});
      }
      return !!system?.ctx;
    },
    [getAudioSystem]
  );

  React.useEffect(() => {
    const safeMasterVolume = normalizeSoundMasterVolume(
      soundMasterVolume,
      SOUND_MASTER_VOLUME_DEFAULT
    );
    if (soundMasterVolumeRef) {
      soundMasterVolumeRef.current = safeMasterVolume;
    }
    AssetManager.setMasterVolume(safeMasterVolume);
    if (audioSystemRef.current?.masterGain) {
      audioSystemRef.current.masterGain.gain.value = AUDIO_MASTER_GAIN * safeMasterVolume;
    }
  }, [soundMasterVolume, soundMasterVolumeRef]);

  React.useEffect(
    () => () => {
      stopBlackHoleAudio({ fadeMs: 0 });
      const ctx = audioCtxRef.current;
      const system = audioSystemRef.current;
      const nodes = [
        system?.reverbIn,
        system?.reverb,
        system?.reverbHP,
        system?.reverbLP,
        system?.reverbGain,
        system?.busIn,
        system?.masterGain,
        system?.compressor,
        system?.limiter,
      ];
      for (const node of nodes) {
        try {
          node?.disconnect?.();
        } catch (_) {}
      }
      combinedScoreBufferCacheRef.current = {
        ctx: null,
        buffers: new Map(),
      };
      AssetManager.releaseAudioSystem?.(ctx);
      if (ctx && ctx.state !== "closed") {
        try {
          void ctx.close();
        } catch (_) {}
      }
      audioCtxRef.current = null;
      audioSystemRef.current = null;
      audioUnlockedRef.current = false;
      audioVoiceRef.current.activeVoices = 0;
      audioVoiceRef.current.lastPlayed.clear();
    },
    [stopBlackHoleAudio]
  );

  return {
    audioCtxRef,
    audioSystemRef,
    audioUnlockedRef,
    audioVoiceRef,
    blackHoleHandleRef,
    blackHoleChebHandleRef,
    blackHoleClavierHandleRef,
    blackHoleSourisLoopRef,
    blackHoleClavierFadeRef,
    blackHoleAuxStopRef,
    blackHoleSyncTokenRef,
    getAudioSystem,
    shouldPlay,
    startVoiceCount,
    playOneShotAudio,
    playSfxHandle,
    playCombinedScoreSound,
    stopBlackHoleAudio,
    requestAudioUnlock,
  };
}
