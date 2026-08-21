export function normalizeRotationTurns(turns) {
  if (!Number.isFinite(turns)) return 0;
  const normalized = turns % 4;
  return normalized < 0 ? normalized + 4 : normalized;
}

export function rotateIndexByTurns(index, size, turns) {
  if (!Number.isInteger(index) || !Number.isInteger(size) || size <= 0) return index;
  const normalized = normalizeRotationTurns(turns);
  if (normalized === 0) return index;
  const row = Math.floor(index / size);
  const column = index % size;
  if (normalized === 1) return column * size + (size - 1 - row);
  if (normalized === 2) return (size - 1 - row) * size + (size - 1 - column);
  return (size - 1 - column) * size + row;
}

export function mapDisplayToBoardIndex(displayIndex, size, turns) {
  const normalized = normalizeRotationTurns(turns);
  return rotateIndexByTurns(displayIndex, size, (4 - normalized) % 4);
}
