export const INFORTUNE_EXCHANGE_CHOICE_MS = 10_000;
export const INFORTUNE_EXCHANGE_STEP_MS = 3200;

// The order is frozen before choices. Every swap uses the balances resulting
// from earlier swaps, irrespective of the order in which results arrived.
export function planInfortuneExchanges(balances, choices, order) {
  const banks = { ...balances }, exchanges = [], cancelled = new Set();
  for (const from of order) {
    if (cancelled.has(from)) continue;
    const to = choices[from];
    if (from === to || !Object.hasOwn(banks, from) || !Object.hasOwn(banks, to)) continue;
    const sourceBank = banks[from], targetBank = banks[to];
    if (choices[to] === from && order.includes(to)) {
      cancelled.add(from); cancelled.add(to);
      exchanges.push({ from, to, sourceBank, targetBank, cancelled: true });
      continue;
    }
    banks[from] = targetBank; banks[to] = sourceBank;
    exchanges.push({ from, to, sourceBank, targetBank });
  }
  return { banks, exchanges };
}

export function exchangeImpact(exchange, selfId) {
  if (!exchange || ![exchange.from, exchange.to].includes(selfId)) return null;
  const before = exchange.from === selfId ? exchange.sourceBank : exchange.targetBank;
  const after = exchange.cancelled ? before : exchange.from === selfId ? exchange.targetBank : exchange.sourceBank;
  return { before, after, delta: after - before };
}
