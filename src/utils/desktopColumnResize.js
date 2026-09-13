import { computeDesktopUiScale } from "./desktopResponsiveLayout.js";

export function computeDesktopResizeMinimums({
  widths,
  minimumWidths,
  hostWidth,
  columnHeight,
  isDailyPlay = false,
}) {
  const scale = computeDesktopUiScale({ hostWidth, columnHeight, isDailyPlay });
  const minimums = widths.map((_, index) =>
    Math.max(120, Number(minimumWidths[index]) || 120) * scale
  );
  const contentWidth = widths.reduce((sum, width) => sum + width, 0);
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0);
  const fit = Math.min(1, contentWidth / Math.max(1, minimumTotal));
  // Resizing a window can leave a saved column below its current minimum.
  // A drag must not force it wider or jump in the opposite direction.
  return minimums.map((minimum, index) => Math.min(widths[index], minimum * fit));
}

export function resizeDesktopColumns({
  widths,
  minimumWidths,
  maximumWidths = [],
  separatorIndex,
  delta,
}) {
  const next = [...widths];
  if (!Number.isFinite(delta) || delta === 0 ||
      !Number.isInteger(separatorIndex) || separatorIndex < 0 || separatorIndex >= widths.length - 1) {
    return next;
  }

  const direction = delta > 0 ? 1 : -1;
  const growingIndex = direction > 0 ? separatorIndex : separatorIndex + 1;
  const maximum = Number(maximumWidths[growingIndex]);
  const growthCapacity = Number.isFinite(maximum)
    ? Math.max(0, maximum - widths[growingIndex])
    : Infinity;
  let remaining = Math.min(Math.abs(delta), growthCapacity);

  // Push successive dividers only after the nearest neighbour reaches its limit.
  // Always use the widths captured at pointer-down so reversing a drag restores them.
  for (let index = growingIndex + direction;
    index >= 0 && index < widths.length && remaining > 0;
    index += direction) {
    const minimum = Math.max(0, Number(minimumWidths[index]) || 0);
    const available = Math.max(0, widths[index] - minimum);
    const taken = Math.min(available, remaining);
    next[index] -= taken;
    next[growingIndex] += taken;
    remaining -= taken;
  }
  return next;
}
