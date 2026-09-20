export const GOBBLARS_REWARD_DURATION = 4200;
export const GOBBLARS_COUNT_START = 1900;
export const GOBBLARS_COUNT_DURATION = 950;

export function normalizeGobblarsReward(value) {
  if (value?.balance == null) return null;
  const amount = Number(value?.amount);
  const balance = Number(value.balance);
  const before = balance - amount;
  if (!Number.isSafeInteger(amount) || amount === 0 || !Number.isSafeInteger(balance) || balance < 0
    || !Number.isSafeInteger(before) || before < 0) return null;
  return {
    amount,
    balance,
    before,
    label: String(value.label || (amount < 0 ? "Achat effectué" : "Bien joué !")).trim(),
    receipt: value.receipt ? String(value.receipt) : "",
  };
}

export function getGobblarsRewardBalance(reward, elapsed, reducedMotion = false) {
  if (reducedMotion) return reward.balance;
  const progress = Math.min(1, Math.max(0, (elapsed - GOBBLARS_COUNT_START) / GOBBLARS_COUNT_DURATION));
  const eased = 1 - (1 - progress) ** 3;
  return Math.round(reward.before + (reward.balance - reward.before) * eased);
}
