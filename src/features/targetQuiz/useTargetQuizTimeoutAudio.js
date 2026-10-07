import React from "react";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { createTargetQuizTimeoutAudio } from "./targetQuizTimeoutAudio.js";

export default function useTargetQuizTimeoutAudio({ active, sessionKey, endsAt, getNowServerMs, onTimeout }) {
  const preferences = useFeatureRuntime("preferences");
  const playerRef = React.useRef(null);
  const latestRef = React.useRef(null);
  latestRef.current = { endsAt, getNowServerMs, onTimeout };

  React.useEffect(() => {
    if (!active) return undefined;
    const onSessionTimeout = latestRef.current.onTimeout;
    const player = createTargetQuizTimeoutAudio({
      getNow: () => latestRef.current.getNowServerMs?.() ?? Date.now(),
      canPlay: () => !document.hidden && !preferences.store.getState().isSfxMuted,
      onTimeout: () => onSessionTimeout?.(),
      subscribeMute: listener => preferences.store.subscribe(listener),
    });
    playerRef.current = player;
    void player.prepare().catch(() => {});
    player.arm(latestRef.current.endsAt);
    return () => {
      // A natural round end unmounts this surface. Let its final cue finish;
      // leaving early cancels the deadline without playing an ending sound.
      player.leave();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [active, sessionKey, preferences]);

  React.useEffect(() => { playerRef.current?.arm(endsAt); }, [endsAt]);
}
