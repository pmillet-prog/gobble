function normalizeRect(rect) {
  const left = Number(rect?.left);
  const top = Number(rect?.top);
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !(width > 0) ||
    !(height > 0)
  ) {
    return null;
  }
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

export function getScoreFlightOrigin({ tileRect, gridRect }) {
  const tile = normalizeRect(tileRect);
  const grid = normalizeRect(gridRect);
  const fallback = tile || grid;
  if (!fallback) return null;
  if (!tile || !grid) {
    return { x: fallback.centerX, y: fallback.centerY };
  }

  const corners = [
    { x: tile.left, y: tile.top },
    { x: tile.right, y: tile.top },
    { x: tile.left, y: tile.bottom },
    { x: tile.right, y: tile.bottom },
  ];
  const closest = corners.reduce((current, corner) => {
    const distance =
      (corner.x - grid.centerX) ** 2 + (corner.y - grid.centerY) ** 2;
    return distance < current.distance ? { ...corner, distance } : current;
  }, { ...corners[0], distance: Number.POSITIVE_INFINITY });
  return { x: closest.x, y: closest.y };
}
