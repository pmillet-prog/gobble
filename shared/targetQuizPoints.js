export const TARGET_QUIZ_POINTS_GOAL = 10000;
export const TARGET_QUIZ_GOBBLARS_REWARD = 50;

const integer = value => Number.isSafeInteger(Number(value)) ? Number(value) : 0;

export function normalizeTargetQuizPoints(value = {}) {
  return {
    total: integer(value?.total),
    points: Math.min(TARGET_QUIZ_POINTS_GOAL - 1, Math.max(0, integer(value?.points))),
    cycles: Math.max(0, integer(value?.cycles)),
  };
}

export function advanceTargetQuizPoints(current, delta) {
  const before = normalizeTargetQuizPoints(current);
  const gain = integer(delta);
  const points = Math.max(0, before.points + gain);
  const cycles = Math.floor(points / TARGET_QUIZ_POINTS_GOAL);
  return {
    before,
    after: { total: before.total + gain, points: points % TARGET_QUIZ_POINTS_GOAL, cycles: before.cycles + cycles },
    amount: cycles * TARGET_QUIZ_GOBBLARS_REWARD,
  };
}
