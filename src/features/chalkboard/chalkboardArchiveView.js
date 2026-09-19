const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function archiveZoomLimits(size) {
  return { min: Math.min(size.width / size.imageWidth, size.height / size.imageHeight), max: 3 };
}

export function constrainArchiveView(view, size) {
  const limits = archiveZoomLimits(size);
  const scale = clamp(view.scale, limits.min, Math.max(limits.max, limits.min));
  const width = size.imageWidth * scale, height = size.imageHeight * scale;
  return {
    scale,
    x: width <= size.width ? (size.width - width) / 2 : clamp(view.x, size.width - width, 0),
    y: height <= size.height ? (size.height - height) / 2 : clamp(view.y, size.height - height, 0),
  };
}

export function fitArchiveView(size, overview = false) {
  const scale = overview ? archiveZoomLimits(size).min : size.height / size.imageHeight;
  return constrainArchiveView({ scale, x: 0, y: 0 }, size);
}

export function zoomArchiveAt(view, scale, point, size) {
  const limits = archiveZoomLimits(size);
  scale = clamp(scale, limits.min, Math.max(limits.max, limits.min));
  const ratio = scale / view.scale;
  return constrainArchiveView({ scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, size);
}

export function moveArchiveGesture(view, before, after, size) {
  const midpoint = points => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
  const a = midpoint(before), b = midpoint(after);
  let scale = view.scale;
  if (before.length === 2 && after.length === 2) {
    const distance = points => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    scale *= distance(after) / Math.max(1, distance(before));
  }
  const limits = archiveZoomLimits(size);
  scale = clamp(scale, limits.min, Math.max(limits.max, limits.min));
  const ratio = scale / view.scale;
  return constrainArchiveView({ scale, x: b.x - (a.x - view.x) * ratio, y: b.y - (a.y - view.y) * ratio }, size);
}
