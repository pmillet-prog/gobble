export function clampValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function formatNumber(value) {
  return typeof value === "number" ? value.toLocaleString("fr-FR") : null;
}
