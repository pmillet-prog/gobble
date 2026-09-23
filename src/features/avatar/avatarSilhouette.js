// Stretch the assembled character around its shared centre, leaving its height
// and background intact. Attachments use this same transform through the camera.
export function applyAvatarSilhouette(ctx, width = 1) {
  if (width === 1) return;
  ctx.translate(512, 0);
  ctx.scale(width, 1);
  ctx.translate(-512, 0);
}

export function applyAvatarViewport(ctx, viewport) {
  const { crop, ratio, ox, oy, silhouetteWidth = 1 } = viewport;
  ctx.translate(ox, oy);
  ctx.scale(ratio, ratio);
  ctx.translate(-crop[0], -crop[1]);
  applyAvatarSilhouette(ctx, silhouetteWidth);
}
