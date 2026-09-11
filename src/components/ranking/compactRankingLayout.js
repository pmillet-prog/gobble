// Keep readable type; use three rows once five no longer fit comfortably.
export function getCompactRankingLayout(height) {
  const target = Math.max(54, Number(height) || 128);
  const fiveRows = target >= 90;
  const minimumRows = fiveRows ? [12, 16, 26, 16, 12] : [14, 22, 14];
  const maximumRows = fiveRows ? [14, 20, 34, 20, 14] : [20, 34, 20];
  const minimum = fiveRows ? 90 : 54;
  const maximum = fiveRows ? 128 : 90;
  const ratio = Math.min(1, Math.max(0, (target - minimum) / (maximum - minimum)));
  const interpolate = (low, high) => low + (high - low) * ratio;
  return {
    offsets: fiveRows ? [-2, -1, 0, 1, 2] : [-1, 0, 1],
    rowHeights: minimumRows.map((value, index) => interpolate(value, maximumRows[index])),
    gap: interpolate(1, 2),
    inset: interpolate(fiveRows ? 2 : 1, fiveRows ? 9 : 6),
    fontScale: interpolate(0.82, 1),
  };
}
