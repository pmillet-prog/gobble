export const INFORTUNE_EXCHANGE_CHOICE_MS = 10_000;
export const INFORTUNE_EXCHANGE_STEP_MS = 3200;

// The order is frozen before choices. Every swap uses the balances resulting
// from earlier swaps, irrespective of the order in which results arrived.
export function planInfortuneExchanges(balances, choices, order) {
  const banks = { ...balances }, exchanges = [];
  for (const from of order) {
    const to = choices[from];
    if (from === to || !Object.hasOwn(banks, from) || !Object.hasOwn(banks, to)) continue;
    const sourceBank = banks[from], targetBank = banks[to];
    banks[from] = targetBank; banks[to] = sourceBank;
    exchanges.push({ from, to, sourceBank, targetBank });
  }
  return { banks, exchanges };
}

export function exchangeImpact(exchange, selfId) {
  if (!exchange || ![exchange.from, exchange.to].includes(selfId)) return null;
  const before = exchange.from === selfId ? exchange.sourceBank : exchange.targetBank;
  const after = exchange.from === selfId ? exchange.targetBank : exchange.sourceBank;
  return { before, after, delta: after - before };
}
