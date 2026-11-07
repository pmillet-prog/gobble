// Truncate to three characters without overstating the player's balance.
export function compactCurrency(value) {
  if (!Number.isFinite(value)) return '—';
  const amount = Math.max(0, Math.floor(value));
  if (amount < 1000) return String(amount);
  for (const [unit, scale] of [['k', 1e3], ['m', 1e6], ['b', 1e9], ['t', 1e12]]) {
    const scaled = amount / scale;
    if (scaled >= 100) continue;
    if (scaled >= 10) return `${Math.floor(scaled)}${unit}`;
    const tenths = Math.floor(amount / (scale / 10));
    return `${Math.floor(tenths / 10)}${unit}${tenths % 10 || ''}`;
  }
  return '99t';
}
