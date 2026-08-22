import React from "react";

import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureSelector } from "../../app/react/useFeatureRuntime.js";

const PLAYING_PROGRESS = Object.freeze({
  accepted: Object.freeze([]),
  submissionTick: 0,
});

export function useSettledGameProgress(progressFeature) {
  const phase = useApplicationSelector((state) => state.game.phase);
  const cacheRef = React.useRef(null);
  return useFeatureSelector(progressFeature, (state) => {
    if (phase === "playing") return PLAYING_PROGRESS;
    const cached = cacheRef.current;
    if (
      cached &&
      cached.accepted === state.accepted &&
      cached.submissionTick === state.submissionTick
    ) {
      return cached;
    }
    const next = Object.freeze({
      accepted: state.accepted,
      submissionTick: state.submissionTick,
    });
    cacheRef.current = next;
    return next;
  });
}
