// Costumes share the avatar's authoring coordinates. Their transparent face
// opening keeps the player's skin and features; only the original neck remains
// below the head so the default shirt cannot leak around a narrower costume.
export function createAvatarCostumeRenderer(assets, state, part) {
  const image = part && assets["costumes_" + part.id];
  if (!image) return null;
  const placement = Array.isArray(part.placement) ? part.placement
    : part.placement?.[state.base];
  const [x, y, width, height] = placement || [0, 0, 1024, 1024];
  const draw = ctx => ctx.drawImage(image, x, y, width, height);
  return {
    top: part.top ?? Math.min(0, y),
    headClip: part.headClip,
    hairClip: part.hairClip,
    hairUnderCostume: part.hairUnderCostume !== false,
    drawBust(ctx, baseBust) {
      // Sample known skin above the original collar, already recolored by the
      // skin renderer, to fill open costume necklines without the yellow shirt.
      ctx.drawImage(baseBust, 475, 590, 74, 60, 447, 550, 130, 180);
      ctx.save();
      ctx.beginPath();
      ctx.rect(456, 550, 115, 85);
      ctx.clip();
      ctx.drawImage(baseBust, 0, 0);
      ctx.restore();
      return true;
    },
    draw,
    // A small party hat can sit over retained hair without moving the costume's
    // collar or shoulders above long hairstyles.
    drawHeadwear: Number.isFinite(part.headwearFrontBottom) ? ctx => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, Math.max(0, part.headwearFrontBottom - y));
      ctx.clip();
      draw(ctx);
      ctx.restore();
    } : undefined,
  };
}
