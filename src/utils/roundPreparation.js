export const ROUND_PREPARATION_FALLBACK_GRACE_MS = 150;

export function isRoundStartPreparationDelayed({
  breakKind = null,
  graceMs = ROUND_PREPARATION_FALLBACK_GRACE_MS,
  nextStartAt = null,
  nowMs = Date.now(),
  phase = null,
} = {}) {
  const startAt = Number(nextStartAt);
  const now = Number(nowMs);
  if (phase !== "results" || breakKind === "tournament_end") return false;
  if (!Number.isFinite(startAt) || !Number.isFinite(now)) return false;
  return now > startAt + Math.max(0, Number(graceMs) || 0);
}

export function shouldShowRoundPreparationOverlay({
  phase = null,
  preparationAnnounced = false,
  startDelayed = false,
  standaloneTraining = false,
} = {}) {
  if (standaloneTraining) return false;
  if (!preparationAnnounced && !startDelayed) return false;

  // Pendant les résultats, une préparation anticipée reste discrète : l'écran
  // ne prend le relais qu'une fois l'heure réelle de départ dépassée.
  if (phase === "results") return !!startDelayed;
  return true;
}
