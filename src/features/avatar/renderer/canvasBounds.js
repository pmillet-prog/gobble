// Bounds are measured once per decoded source, not on each animation frame.
export function createImageBounds(makeCanvas) {
  const cache = new WeakMap();
  return image => {
    if (cache.has(image)) return cache.get(image);
    const canvas = makeCanvas(image.width, image.height), ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (!data[(y * canvas.width + x) * 4 + 3]) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
    const result = right ? { left, top, right, bottom } : { left: 0, top: 0, right: 0, bottom: 0 };
    canvas.width = canvas.height = 0;
    cache.set(image, result);
    return result;
  };
}

export function transformImageBounds(bounds, transform) {
  const { x, y, anchor, scale } = transform;
  return {
    left: x + (bounds.left - anchor.x) * scale,
    top: y + (bounds.top - anchor.y) * scale,
    right: x + (bounds.right - anchor.x) * scale,
    bottom: y + (bounds.bottom - anchor.y) * scale,
  };
}

export function layerExtent(bounds) {
  // Keep the authoring frame for fixed anatomical masks, plus the transformed
  // artwork and its antialiasing fringe. World coordinates may be negative.
  const left = Math.min(0, Math.floor(bounds?.left ?? 0) - 2);
  const top = Math.min(0, Math.floor(bounds?.top ?? 0) - 2);
  return { left, top,
    width: Math.max(1024, Math.ceil(bounds?.right ?? 1024) + 2) - left,
    height: Math.max(1024, Math.ceil(bounds?.bottom ?? 1024) + 2) - top };
}

export function makeWorldCanvas(makeCanvas, extent) {
  const canvas = makeCanvas(extent.width, extent.height);
  canvas.getContext("2d").translate(-extent.left, -extent.top);
  return canvas;
}
