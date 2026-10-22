import React from "react";

const TERMINAL = new Set(["won", "lost", "expired", "dismissed"]);

export default function useGotusIntro({ active, controller, state }) {
  const [completedFor, setCompletedFor] = React.useState(null);
  const finish = React.useCallback(() => setCompletedFor(controller), [controller]);
  // The controller survives new training words and reconnects. A restored live
  // puzzle with guesses already made opens directly on its board.
  const playing = active && completedFor !== controller && !!state.firstLetter &&
    state.attempts.length === 0 && !TERMINAL.has(state.phase);
  return { playing, finish };
}
