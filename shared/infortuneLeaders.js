export const INFORTUNE_LEADER_WALK_MS = 5200;
export const INFORTUNE_LEADER_LEAD_IN_MS = 600;
export const INFORTUNE_LEADER_LEAD_OUT_MS = 300;
export const INFORTUNE_LEADER_WINDOW_MS = INFORTUNE_LEADER_LEAD_IN_MS + INFORTUNE_LEADER_WALK_MS + INFORTUNE_LEADER_LEAD_OUT_MS;

// Explicit public projection: no balances, deltas or hidden economy fields.
// Selection belongs to the server (or the local workshop's private ledger).
export function infortuneLeaders(players, readBank) {
  const candidates = [...new Map(players.filter(player => !player.isBot).map(player => [player.id, player])).values()]
    .map(player => ({ player, bank: readBank(player.id) })).filter(entry => Number.isFinite(entry.bank));
  const highest = Math.max(...candidates.map(entry => entry.bank));
  return candidates.filter(entry => entry.bank === highest)
    .sort((a, b) => a.player.id.localeCompare(b.player.id))
    .map(({ player }) => ({ id: player.id, userId: player.userId || null, nick: player.nick }));
}
