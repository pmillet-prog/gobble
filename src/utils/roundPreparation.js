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

  // Les résultats doivent toujours rester consultables. Un retour d'arrière-plan
  // peut rendre l'heure de départ obsolète, sans que cela justifie un popup bloquant.
  if (phase === "results") return false;
  return true;
}
