export const GOTUS_WORDS_GOAL = 10;
export const GOTUS_GOBBLARS_REWARD = 500;

export function normalizeGotusProgress(value) {
  const count = Number(value?.totalWins ?? value ?? 0);
  const totalWins = Number.isSafeInteger(count) ? Math.max(0, count) : 0;
  return {
    totalWins,
    words: totalWins % GOTUS_WORDS_GOAL,
    cycles: Math.floor(totalWins / GOTUS_WORDS_GOAL),
    target: GOTUS_WORDS_GOAL,
    rewardAmount: GOTUS_GOBBLARS_REWARD,
  };
}
