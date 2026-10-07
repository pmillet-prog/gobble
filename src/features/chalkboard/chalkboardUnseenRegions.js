export function getChalkboardUnseenRegions(entries, viewport) {
  const { width, height, scrollLeft = 0, scale } = viewport || {};
  const regions = { left: false, right: false, visible: [] };
  if (!(width > 1 && height > 1 && scale > 0)) return regions;
  const left = scrollLeft / scale;
  const right = (scrollLeft + width) / scale;
  for (const entry of entries) {
    const { minX, maxX } = entry.bounds || {};
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX < minX) continue;
    // The board fills the viewport vertically. Reaching the middle of an entry
    // avoids considering a small sliver at the edge as a consulted contribution.
    const center = (minX + maxX) / 2;
    if (center < left) regions.left = true;
    else if (center > right) regions.right = true;
    else regions.visible.push(entry);
  }
  return regions;
}
