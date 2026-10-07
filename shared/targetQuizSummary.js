const count = value => Math.max(0, Math.trunc(Number(value) || 0));

export function normalizeTargetQuizSummary(value = {}) {
  return {
    score: Math.trunc(Number(value.score) || 0),
    correctCount: count(value.correctCount),
    wrongCount: count(value.wrongCount),
    bestStreak: count(value.bestStreak),
    ...(value.cancelled ? { cancelled: true } : {}),
    ...(value.progression ? { progression: value.progression } : {}),
  };
}

export function formatTargetQuizPoints(value) {
  const points = Math.trunc(Number(value) || 0);
  return `${points < 0 ? "−" : "+"}${Math.abs(points)}`;
}
