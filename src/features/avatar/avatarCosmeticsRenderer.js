// The compositor calls these stages in avatar coordinates: necklace under the
// head, facial accessories over features but under front hair and glasses.
export function createAvatarCosmeticsRenderer(makeCanvas) {
  let cachedKey = null, cachedCanvas = null;

  function drawImage(ctx, image, part, state) {
    const [x, y, width] = part.placement[state.base || "homme"];
    const [sx, sy, sw, sh] = part.sourceBounds;
    const scale = width / sw;
    ctx.save();
    if (part.attachment === "left_eye") {
      ctx.translate((state.dx || 0) - (state.spacing || 0), state.dy || 0);
      ctx.translate(430, 390); ctx.rotate((part.rotation || 0) * Math.PI / 180); ctx.translate(-430, -390);
    }
    if (part.attachment === "nose") {
      ctx.translate(512 + (state.noseDx || 0), 470 + (state.noseDy || 0));
      ctx.scale(state.noseScale ?? 1, state.noseScale ?? 1); ctx.translate(-512, -470);
    }
    if (part.repositionable) {
      const cx = x + width / 2, cy = y + sh * scale / 2;
      ctx.translate(cx + (state.scarDx || 0), cy + (state.scarDy || 0));
      ctx.rotate((state.scarRotation || 0) * Math.PI / 180); ctx.translate(-cx, -cy);
    }
    // Keep the entire native canvas and alpha. Bounds only set its scale/anchor.
    ctx.drawImage(image, x - sx * scale, y - sy * scale, image.width * scale, image.height * scale);
    ctx.restore();
  }

  return {
    draw(ctx, assets, state, part, layer) {
      if (!part?.placement || part.layer !== layer) return;
      const image = assets["accessories_" + part.id];
      if (!image) return;
      // Rasterize once at avatar resolution so very small rings survive the
      // final reduction to chat size. Keep just one reusable surface per avatar.
      const key = JSON.stringify([part.id, state.base, state.dx, state.dy, state.spacing,
        state.noseDx, state.noseDy, state.noseScale, state.scarDx, state.scarDy, state.scarRotation]);
      if (key !== cachedKey) {
        if (!cachedCanvas) cachedCanvas = makeCanvas(1024, 1024);
        const target = cachedCanvas.getContext("2d");
        target.clearRect(0, 0, 1024, 1024); target.globalCompositeOperation = "source-over";
        target.imageSmoothingEnabled = true; target.imageSmoothingQuality = "high";
        drawImage(target, image, part, state);
        if (part.clipToHead) {
          target.globalCompositeOperation = "destination-in";
          target.drawImage(assets["head_" + (state.base || "homme")], 0, 0);
        }
        target.globalCompositeOperation = "source-over"; cachedKey = key;
      }
      ctx.drawImage(cachedCanvas, 0, 0);
    },
  };
}
