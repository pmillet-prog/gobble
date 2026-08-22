import React from "react";

import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";

const PLAYING_PROGRESS = Object.freeze({
  accepted: Object.freeze([]),
  submissionTick: 0,
});

export function useSettledGameProgress() {
  const cacheRef = React.useRef(null);
  return useApplicationSelector((state) => {
    const game = state.game;
    if (game.phase === "playing") return PLAYING_PROGRESS;
    const cached = cacheRef.current;
    if (
      cached &&
      cached.accepted === game.accepted &&
      cached.submissionTick === game.submissionTick
    ) {
      return cached;
    }
    const next = Object.freeze({
      accepted: game.accepted,
      submissionTick: game.submissionTick,
    });
    cacheRef.current = next;
    return next;
  });
}
