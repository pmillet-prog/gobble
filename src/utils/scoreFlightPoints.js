const SPEED_ROUND_TYPE = "speed";

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveScoreFlightPoints({
  awardedPoints,
  candidatePoints,
  specialRound,
  speedFallback = 11,
} = {}) {
  if (specialRound?.type === SPEED_ROUND_TYPE) {
    return (
      finiteNumber(specialRound?.fixedWordScore) ??
      finiteNumber(awardedPoints) ??
      finiteNumber(speedFallback) ??
      11
    );
  }

  return finiteNumber(candidatePoints) ?? finiteNumber(awardedPoints) ?? 0;
}
