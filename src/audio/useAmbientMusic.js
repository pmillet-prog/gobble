import React from "react";

import { resolveSoundSettings } from "./equalizer";
import {
  SOUND_MASTER_VOLUME_DEFAULT,
  normalizeSoundMasterVolume,
} from "./audioAssets";

function shuffleTracks(tracks, lastTrack = null) {
  const order = [...tracks];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && lastTrack && order[0] === lastTrack) {
    const swapIndex = 1 + Math.floor(Math.random() * (order.length - 1));
    [order[0], order[swapIndex]] = [order[swapIndex], order[0]];
  }
  return order;
}

export default function useAmbientMusic({
  ambientTracksRef,
  appViewRef,
  breakCountdownRef,
  isAmbientMutedRef,
  isLoggedInRef,
  isSamsungBrowserRef,
  phaseRef,
  resolveAmbientSrc,
  soundMasterVolumeRef,
} = {}) {
  const ambientMusicRef = React.useRef({
    audio: null,
    index: -1,
    order: null,
    orderKey: "",
    lastTrack: null,
    fadeRaf: null,
    fadeTimer: null,
    startGuard: null,
    playCheck: null,
    keepAlive: false,
    primed: false,
    active: false,
  });
  const ambientStartPendingRef = React.useRef(false);
  const ambientRetryRef = React.useRef(false);
  const lastAmbientPhaseRef = React.useRef(null);

  const fadeAudioVolume = React.useCallback((audio, targetVolume, durationMs = 800) => {
    if (!audio) return;
    if (ambientMusicRef.current.fadeRaf) {
      cancelAnimationFrame(ambientMusicRef.current.fadeRaf);
      ambientMusicRef.current.fadeRaf = null;
    }
    const start = performance.now();
    const fromRaw = Number.isFinite(audio.volume) ? audio.volume : 0;
    const from = Math.max(0, Math.min(1, fromRaw));
    const to = Math.max(0, Math.min(1, targetVolume));
    const step = (now) => {
      const t = Math.min(1, (now - start) / Math.max(1, durationMs));
      const eased = t * (2 - t);
      const nextVolume = from + (to - from) * eased;
      audio.volume = Math.max(0, Math.min(1, nextVolume));
      if (t < 1) {
        ambientMusicRef.current.fadeRaf = requestAnimationFrame(step);
      } else {
        ambientMusicRef.current.fadeRaf = null;
      }
    };
    ambientMusicRef.current.fadeRaf = requestAnimationFrame(step);
  }, []);

  const resetAmbientOrder = React.useCallback(() => {
    ambientMusicRef.current.order = null;
    ambientMusicRef.current.orderKey = "";
    ambientMusicRef.current.index = -1;
    ambientMusicRef.current.lastTrack = null;
  }, []);

  const getNextAmbientTrack = React.useCallback(() => {
    const tracks = ambientTracksRef?.current || [];
    if (!tracks.length) return null;
    const trackKey = tracks.join("|");
    const needsReshuffle =
      !Array.isArray(ambientMusicRef.current.order) ||
      ambientMusicRef.current.order.length !== tracks.length ||
      ambientMusicRef.current.orderKey !== trackKey;
    if (needsReshuffle) {
      ambientMusicRef.current.order = shuffleTracks(
        tracks,
        ambientMusicRef.current.lastTrack
      );
      ambientMusicRef.current.orderKey = trackKey;
      ambientMusicRef.current.index = -1;
    }
    if (
      !ambientMusicRef.current.order ||
      ambientMusicRef.current.index >= ambientMusicRef.current.order.length - 1
    ) {
      ambientMusicRef.current.order = shuffleTracks(
        tracks,
        ambientMusicRef.current.lastTrack
      );
      ambientMusicRef.current.index = -1;
    }
    const nextIndex = ambientMusicRef.current.index + 1;
    ambientMusicRef.current.index = nextIndex;
    const nextTrack = ambientMusicRef.current.order[nextIndex];
    ambientMusicRef.current.lastTrack = nextTrack;
    return nextTrack;
  }, [ambientTracksRef]);

  const ensureAmbientAudio = React.useCallback(() => {
    if (ambientMusicRef.current.audio) return ambientMusicRef.current.audio;
    const audio = new Audio();
    audio.preload = isSamsungBrowserRef?.current ? "metadata" : "auto";
    audio.loop = false;
    audio.volume = 0;
    audio.addEventListener("ended", () => {
      if (!ambientMusicRef.current.active) return;
      const next = getNextAmbientTrack();
      if (!next) return;
      const resolvedNext = resolveAmbientSrc?.(next);
      if (!resolvedNext) return;
      audio.src = resolvedNext;
      const eq = resolveSoundSettings("ambient");
      const bc = breakCountdownRef?.current;
      const hasCountdown = typeof bc === "number";
      const shouldBeAudible =
        phaseRef?.current === "results" &&
        !ambientMusicRef.current.keepAlive &&
        !isAmbientMutedRef?.current &&
        (!hasCountdown || bc > 14);
      audio.muted = !shouldBeAudible;
      audio.play().catch(() => {});
      const masterVolume = normalizeSoundMasterVolume(
        soundMasterVolumeRef?.current,
        SOUND_MASTER_VOLUME_DEFAULT
      );
      const targetVolume = shouldBeAudible ? (eq.volume ?? 0.45) * masterVolume : 0;
      fadeAudioVolume(audio, targetVolume, shouldBeAudible ? 1000 : 600);
    });
    ambientMusicRef.current.audio = audio;
    return audio;
  }, [
    breakCountdownRef,
    fadeAudioVolume,
    getNextAmbientTrack,
    isAmbientMutedRef,
    isSamsungBrowserRef,
    phaseRef,
    resolveAmbientSrc,
    soundMasterVolumeRef,
  ]);

  const primeAmbientAudio = React.useCallback(() => {
    if (ambientMusicRef.current.primed) return;
    const tracks = ambientTracksRef?.current || [];
    if (!tracks.length) return;
    const audio = ensureAmbientAudio();
    const previousVolume = audio.volume;
    const previousSrc = audio.src;
    const primeSrc = resolveAmbientSrc?.(tracks[0]);
    if (!primeSrc) return;
    audio.src = primeSrc;
    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          ambientMusicRef.current.primed = true;
          audio.pause();
          audio.currentTime = 0;
          audio.volume = previousVolume;
          audio.src = previousSrc;
        })
        .catch(() => {
          audio.volume = previousVolume;
          audio.src = previousSrc;
        });
    } else {
      audio.volume = previousVolume;
      audio.src = previousSrc;
    }
  }, [ambientTracksRef, ensureAmbientAudio, resolveAmbientSrc]);

  const stopAmbientMusic = React.useCallback(
    ({ fadeMs = 800, keepAlive = false, immediate = false } = {}) => {
      const audio = ambientMusicRef.current.audio;
      if (!keepAlive) {
        ambientMusicRef.current.active = false;
        ambientMusicRef.current.keepAlive = false;
      } else {
        ambientMusicRef.current.keepAlive = true;
      }
      if (!audio) return;
      if (ambientMusicRef.current.startGuard) {
        clearTimeout(ambientMusicRef.current.startGuard);
        ambientMusicRef.current.startGuard = null;
      }
      if (ambientMusicRef.current.playCheck) {
        clearTimeout(ambientMusicRef.current.playCheck);
        ambientMusicRef.current.playCheck = null;
      }
      if (ambientMusicRef.current.fadeTimer) {
        clearTimeout(ambientMusicRef.current.fadeTimer);
        ambientMusicRef.current.fadeTimer = null;
      }
      if (ambientMusicRef.current.fadeRaf) {
        cancelAnimationFrame(ambientMusicRef.current.fadeRaf);
        ambientMusicRef.current.fadeRaf = null;
      }
      if (immediate) {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = true;
          audio.src = "";
          audio.removeAttribute?.("src");
          audio.load?.();
        } catch (_) {}
        return;
      }
      fadeAudioVolume(audio, 0, fadeMs);
      if (!keepAlive) {
        ambientMusicRef.current.fadeTimer = setTimeout(() => {
          try {
            audio.pause();
            audio.currentTime = 0;
            if (isSamsungBrowserRef?.current) {
              audio.muted = true;
              audio.src = "";
              audio.removeAttribute?.("src");
              audio.load?.();
            }
          } catch (_) {}
        }, Math.max(0, fadeMs) + 60);
      }
    },
    [fadeAudioVolume, isSamsungBrowserRef]
  );

  const startAmbientMusic = React.useCallback(
    ({ silent = false, fadeMs = null } = {}) => {
      if (isAmbientMutedRef?.current) return;
      const tracks = ambientTracksRef?.current || [];
      if (!tracks.length) return;
      const audio = ensureAmbientAudio();
      const scheduleRetry = () => {
        if (ambientRetryRef.current) return;
        ambientRetryRef.current = true;
        const retry = () => {
          ambientRetryRef.current = false;
          const view = appViewRef?.current;
          const canPlayLiveAmbient =
            isLoggedInRef?.current &&
            view !== "daily" &&
            view !== "daily_play" &&
            view !== "daily_results";
          const bc = breakCountdownRef?.current;
          const hasCountdown = typeof bc === "number";
          const shouldBeAudible =
            canPlayLiveAmbient &&
            phaseRef?.current === "results" &&
            (!hasCountdown || bc > 14);
          const canPlayAmbient = !isAmbientMutedRef?.current && shouldBeAudible;
          if (canPlayAmbient) {
            const retryFadeMs =
              hasCountdown && typeof bc === "number"
                ? Math.max(0, Math.round((bc - 10) * 1000))
                : null;
            startAmbientMusic({ silent: false, fadeMs: retryFadeMs });
          } else {
            stopAmbientMusic({ fadeMs: 260, keepAlive: false });
          }
        };
        window.addEventListener("pointerdown", retry, { once: true });
        window.addEventListener("touchstart", retry, { once: true });
        window.addEventListener("keydown", retry, { once: true });
      };
      const markPending = () => {
        ambientStartPendingRef.current = true;
        ambientMusicRef.current.active = false;
        scheduleRetry();
      };
      audio.muted = !!silent;
      const fadeOutMs = Number.isFinite(fadeMs) ? fadeMs : 700;
      const fadeInMs = Number.isFinite(fadeMs) ? fadeMs : 1200;
      const fadeStartMs = Number.isFinite(fadeMs) ? fadeMs : 350;
      if (ambientMusicRef.current.active) {
        ambientMusicRef.current.keepAlive = silent;
        const eq = resolveSoundSettings("ambient");
        const masterVolume = normalizeSoundMasterVolume(
          soundMasterVolumeRef?.current,
          SOUND_MASTER_VOLUME_DEFAULT
        );
        const targetVolume = silent ? 0 : (eq.volume ?? 0.45) * masterVolume;
        fadeAudioVolume(audio, targetVolume, silent ? fadeOutMs : fadeInMs);
        if (audio.paused || audio.ended) {
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(markPending);
          }
        }
        return;
      }
      const next = getNextAmbientTrack();
      if (!next) return;
      if (ambientMusicRef.current.playCheck) {
        clearTimeout(ambientMusicRef.current.playCheck);
        ambientMusicRef.current.playCheck = null;
      }
      const resolvedNext = resolveAmbientSrc?.(next);
      if (!resolvedNext) return;
      ambientMusicRef.current.active = true;
      ambientMusicRef.current.keepAlive = silent;
      audio.src = resolvedNext;
      audio.muted = !!silent;
      audio.volume = 0;
      try {
        audio.load?.();
      } catch (_) {}
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(markPending);
      }
      const eq = resolveSoundSettings("ambient");
      const masterVolume = normalizeSoundMasterVolume(
        soundMasterVolumeRef?.current,
        SOUND_MASTER_VOLUME_DEFAULT
      );
      const targetVolume = silent ? 0 : (eq.volume ?? 0.45) * masterVolume;
      fadeAudioVolume(audio, targetVolume, silent ? fadeStartMs : fadeInMs);
      if (ambientMusicRef.current.startGuard) {
        clearTimeout(ambientMusicRef.current.startGuard);
      }
      ambientMusicRef.current.startGuard = setTimeout(() => {
        if (!ambientMusicRef.current.active) return;
        if (audio.paused || audio.readyState < 2) {
          const retryPromise = audio.play();
          if (retryPromise && typeof retryPromise.catch === "function") {
            retryPromise.catch(markPending);
          }
        }
        if (ambientMusicRef.current.playCheck) {
          clearTimeout(ambientMusicRef.current.playCheck);
        }
        ambientMusicRef.current.playCheck = setTimeout(() => {
          if (!ambientMusicRef.current.active) return;
          if (audio.paused) {
            markPending();
          }
        }, 300);
      }, 550);
    },
    [
      ambientTracksRef,
      appViewRef,
      breakCountdownRef,
      ensureAmbientAudio,
      fadeAudioVolume,
      getNextAmbientTrack,
      isAmbientMutedRef,
      isLoggedInRef,
      phaseRef,
      resolveAmbientSrc,
      soundMasterVolumeRef,
      stopAmbientMusic,
    ]
  );

  return {
    ambientMusicRef,
    ambientStartPendingRef,
    ambientRetryRef,
    lastAmbientPhaseRef,
    primeAmbientAudio,
    resetAmbientOrder,
    startAmbientMusic,
    stopAmbientMusic,
  };
}
