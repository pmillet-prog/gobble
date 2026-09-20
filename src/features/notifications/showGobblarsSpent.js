// Only confirmed server debits trigger an animation; balance refreshes do not.
export function showGobblarsSpent(show, { spent, balance } = {}, label = "Achat effectué") {
  if (!Number.isSafeInteger(spent) || spent <= 0 || !Number.isSafeInteger(balance) || balance < 0) return null;
  return show("", 0, { gobblarsReward: { amount: -spent, balance, label } });
}
