export const INITIAL_MOBILE_ROUND_BACKDROP = Object.freeze({
  phase: null,
  roundId: null,
  opacity: 0,
  durationMs: 0,
  outroCancelled: false,
});

// One continuous opacity transition survives scene replacement. In particular,
// revealing a delayed round must not jump back to opaque black at intro start.
export function resolveMobileRoundBackdrop(previous, {
  enabled,
  phase,
  roundId,
  introStage,
  hideTiles,
  outroActive,
  preparationPending,
}) {
  if (!enabled) return INITIAL_MOBILE_ROUND_BACKDROP;
  const entering = previous.phase !== phase || previous.roundId !== roundId;
  const next = {
    phase,
    roundId,
    opacity: 0,
    durationMs: 0,
    outroCancelled: false,
  };
  if (phase === "results") {
    next.outroCancelled = !!preparationPending || (!entering && previous.outroCancelled);
    next.opacity = outroActive && !next.outroCancelled ? 1 : 0;
    next.durationMs = next.opacity ? 300 : 220;
  } else if (phase === "playing") {
    if (introStage === "intro_fade_in") {
      next.durationMs = 220;
    } else if (introStage === "idle" && hideTiles) {
      // Hold the outgoing black through the render before the intro effect,
      // including when the playing scene is still loading in Suspense.
      next.opacity = entering && previous.phase !== "results" ? 1 : previous.opacity;
      next.durationMs = entering && previous.phase !== "results" ? 0 : previous.durationMs;
    }
  }
  return next;
}
