import { GOBBLARS_REWARD_DURATION, normalizeGobblarsReward } from "./gobblarsRewardAnimation.js";

// One animation at a time; consecutive gains or expenses share a pending total.
export function createGobblarsRewardQueue({ publish, now = Date.now, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  let active = null;
  const pending = [];
  let timer = null;
  let sequence = 0;
  const receipts = new Set();

  function present(reward) {
    active = Object.freeze({ ...reward, id: `gobblars-${++sequence}`, startedAt: now() });
    publish(active);
    timer = setTimeoutFn(() => {
      timer = null;
      active = null;
      const next = pending.shift();
      if (next) present(next);
      else publish(null);
    }, GOBBLARS_REWARD_DURATION);
    return active;
  }

  function enqueue(value) {
    const reward = normalizeGobblarsReward(value);
    if (!reward || (reward.receipt && receipts.has(reward.receipt))) return null;
    if (reward.receipt) {
      receipts.add(reward.receipt);
      if (receipts.size > 128) receipts.delete(receipts.values().next().value);
    }
    if (!active) return present(reward);
    const last = pending[pending.length - 1];
    if (last && Math.sign(last.amount) === Math.sign(reward.amount) && last.balance === reward.before) {
      pending[pending.length - 1] = {
        ...reward, amount: last.amount + reward.amount, before: last.before,
        label: reward.amount < 0 ? "Achats cumulés" : "Gains cumulés",
      };
    } else pending.push(reward);
    return pending[pending.length - 1];
  }

  function clear() {
    if (timer != null) clearTimeoutFn(timer);
    timer = null;
    active = null;
    pending.length = 0;
    receipts.clear();
    publish(null);
  }

  return Object.freeze({ enqueue, clear });
}
