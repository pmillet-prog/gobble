import React from "react";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { createTargetQuizFeedbackAudio } from "./targetQuizFeedbackAudio.js";

export default function useTargetQuizFeedbackAudio({ active, sessionKey, feedback }) {
  const preferences = useFeatureRuntime("preferences");
  const muted = useFeatureSelector(preferences, state => state.isSfxMuted);
  const playerRef = React.useRef(null);
  const consumedRef = React.useRef(null);
  const endedSessionRef = React.useRef(null);
  const questionToken = feedback?.questionToken;
  const correct = feedback?.correct;

  React.useEffect(() => {
    if (!active) return undefined;
    const player = createTargetQuizFeedbackAudio();
    playerRef.current = player;
    void player.prepare().catch(() => {});
    const onVisibility = () => { if (document.hidden) player.stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (playerRef.current === player) playerRef.current = null;
      player.dispose();
    };
  }, [active, sessionKey]);

  React.useEffect(() => {
    if (muted) playerRef.current?.stop();
  }, [muted]);

  React.useEffect(() => {
    if (!questionToken || typeof correct !== "boolean") return;
    const consumed = consumedRef.current;
    if (consumed?.sessionKey === sessionKey && consumed.questionToken === questionToken) return;
    consumedRef.current = { sessionKey, questionToken };
    // Verdicts belong to their instant of display. Unmuting, reconnecting or
    // revealing the next question must never replay an already consumed cue.
    if (!active || muted || endedSessionRef.current === sessionKey || document.hidden) return;
    playerRef.current?.play(correct);
  }, [active, muted, sessionKey, questionToken, correct]);

  return React.useCallback(() => {
    endedSessionRef.current = sessionKey;
    playerRef.current?.stop();
  }, [sessionKey]);
}
