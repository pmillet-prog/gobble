import React from "react";
import AssetManager from "../../assets/assetManager.js";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { createTargetQuizAudioPlayer } from "./targetQuizAudioPlayer.js";

const SOUND_FIELDS = ["isSfxMuted", "isAmbientMuted"];
const PREPARATION_LIMIT_MS = 1000;

// Own one soundtrack for the mini-game session, independently of its questions.
// The first lighting frame starts the jingle; returning to the tab resumes only
// the bed. Loading or blocked autoplay must never hold up the questions.
export default function useTargetQuizAudio({ active, sessionKey }) {
  const preferences = useFeatureRuntime("preferences");
  const { isSfxMuted, isAmbientMuted } = useFeatureFields(preferences, SOUND_FIELDS);
  const enabled = !isSfxMuted && !isAmbientMuted;
  const introSessionRef = React.useRef(null);
  const endedSessionRef = React.useRef(null);
  const playbackRef = React.useRef(null);
  const [readySession, setReadySession] = React.useState(null);

  React.useEffect(() => {
    if (!active || !enabled) return undefined;
    const player = createTargetQuizAudioPlayer();
    let alive = true;
    let prepared = false;
    let starting = false;
    let unlockFrame = null;
    let observedContext = null;
    const releaseIntro = () => { if (alive) setReadySession(sessionKey); };
    const preparationTimer = window.setTimeout(releaseIntro, PREPARATION_LIMIT_MS);

    const start = (withJingle) => {
      if (!alive || starting || endedSessionRef.current === sessionKey || document.hidden || !AssetManager.getAudioOutput()) return;
      starting = true;
      void player.start({ withJingle }).then(timeline => {
        if (!alive) return;
        starting = !!timeline;
        if (timeline) {
          removeUnlockListeners();
          if (observedContext !== timeline.ctx) {
            observedContext?.removeEventListener("statechange", onAudioState);
            observedContext = timeline.ctx;
            observedContext.addEventListener("statechange", onAudioState);
          }
        }
      }).catch(() => { starting = false; });
    };
    const instance = { startIntro: () => { if (prepared) start(true); }, stop: () => player.stop({ fadeMs: 0 }) };
    playbackRef.current = instance;

    // The application owns browser audio unlocking. If entry happened while
    // locked, wait for its next gesture and join the bed without a late jingle.
    const retryAfterGesture = () => {
      if (unlockFrame !== null) cancelAnimationFrame(unlockFrame);
      unlockFrame = requestAnimationFrame(() => {
        unlockFrame = null;
        if (introSessionRef.current === sessionKey) start(false);
      });
    };
    const removeUnlockListeners = () => {
      window.removeEventListener("pointerup", retryAfterGesture);
      window.removeEventListener("keyup", retryAfterGesture);
    };
    const onAudioState = () => {
      if (!alive) return;
      if (observedContext.state !== "running") {
        starting = false;
        window.addEventListener("pointerup", retryAfterGesture);
        window.addEventListener("keyup", retryAfterGesture);
      } else if (introSessionRef.current === sessionKey) start(false);
    };
    const onVisibility = () => {
      if (document.hidden) {
        player.stop({ fadeMs: 0 });
        starting = false;
      }
    };
    window.addEventListener("pointerup", retryAfterGesture);
    window.addEventListener("keyup", retryAfterGesture);
    document.addEventListener("visibilitychange", onVisibility);
    void player.prepare().then(ready => {
      if (!alive) return;
      prepared = ready;
      window.clearTimeout(preparationTimer);
      releaseIntro();
      if (introSessionRef.current === sessionKey) start(false);
    }).catch(() => {
      window.clearTimeout(preparationTimer);
      releaseIntro();
    });

    return () => {
      alive = false;
      window.clearTimeout(preparationTimer);
      if (unlockFrame !== null) cancelAnimationFrame(unlockFrame);
      removeUnlockListeners();
      observedContext?.removeEventListener("statechange", onAudioState);
      document.removeEventListener("visibilitychange", onVisibility);
      if (playbackRef.current === instance) playbackRef.current = null;
      player.dispose();
    };
  }, [active, enabled, sessionKey]);

  const onIntroStart = React.useCallback(() => {
    if (introSessionRef.current === sessionKey) return;
    introSessionRef.current = sessionKey;
    playbackRef.current?.startIntro();
  }, [sessionKey]);

  const stop = React.useCallback(() => {
    endedSessionRef.current = sessionKey;
    playbackRef.current?.stop();
  }, [sessionKey]);

  const introReady = !active || !enabled || !AssetManager.getAudioOutput() || readySession === sessionKey;
  return { introReady, onIntroStart, stop };
}
