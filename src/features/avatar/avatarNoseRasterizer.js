// Fit generated facial features into the same coordinates and skin-mask format
// as the original noses. Native PNGs remain untouched; tinting stays shared.
export function createAvatarNoseRasterizer(makeCanvas) {
  const cache = new WeakMap();
  return (image, part) => {
    if (cache.has(image)) return cache.get(image);
    const [x, y, width] = part.placement;
    const [sx, sy, sw] = part.sourceBounds;
    const scale = width / sw;
    const art = makeCanvas(1024, 1024), ctx = art.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x - sx * scale, y - sy * scale, image.width * scale, image.height * scale);
    const mask = makeCanvas(1024, 1024), mc = mask.getContext("2d");
    mc.drawImage(art, 0, 0); mc.globalCompositeOperation = "source-in";
    mc.fillStyle = "#ffffff"; mc.fillRect(0, 0, 1024, 1024);
    const result = { art, mask };
    cache.set(image, result);
    return result;
  };
}
