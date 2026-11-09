// A viewer sees the swaps of their frozen trio, including opponent/opponent
// swaps. Never replay another group's transfer or infer a concealed amount.
export function createPlateauExchangeReplay(economy, plateau) {
  if (!plateau || !economy?.resolvedGroups?.includes(plateau.id)) return null;
  const ids = new Set(plateau.members.map(player => player.id));
  const exchanges = (economy.exchangeReplays?.[plateau.id] || []).filter(exchange =>
    exchange.from !== exchange.to && ids.has(exchange.from) && ids.has(exchange.to)
    && [exchange.sourceBank, exchange.targetBank].every(value => Number.isSafeInteger(value) && value >= 0));
  if (!exchanges.length) return null;
  const banks = Object.fromEntries([...ids].map(id => [id, economy.members[id]?.bank]));
  for (const exchange of [...exchanges].reverse()) {
    banks[exchange.from] = exchange.sourceBank; banks[exchange.to] = exchange.targetBank;
  }
  return { exchanges, index: 0, activeExchange: exchanges[0], banks };
}

export function advancePlateauExchangeReplay(replay) {
  const index = replay.index + 1;
  if (index >= replay.exchanges.length) return null;
  const { from, to, sourceBank, targetBank } = replay.activeExchange;
  return { ...replay, index, activeExchange: replay.exchanges[index],
    banks: replay.activeExchange.cancelled ? replay.banks : { ...replay.banks, [from]: targetBank, [to]: sourceBank } };
}

export function exchangeReplayEconomy(economy, replay) {
  if (!replay) return economy;
  const members = { ...economy.members };
  for (const [id, bank] of Object.entries(replay.banks)) members[id] = { ...members[id], bank, revealed: true };
  return { ...economy, members };
}
