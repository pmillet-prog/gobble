// The compositor calls these stages in avatar coordinates: necklace under the
// head, facial accessories over features but under front hair and glasses.
export function createAvatarCosmeticsRenderer(makeCanvas) {
  const layers = new Map();
  let scratch = null;

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
    if (part.pair) ctx.drawImage(image, 1024 - x - width - sx * scale, y - sy * scale, image.width * scale, image.height * scale);
    ctx.restore();
  }

  return {
    draw(ctx, assets, state, parts, layer) {
      const selected = parts.filter(part => part.placement && part.layer === layer && assets["accessories_" + part.id]);
      if (!selected.length) { layers.delete(layer); return; }
      // Rasterize once at avatar resolution so very small rings survive the
      // final reduction to chat size. Bound the cache to the two drawing stages,
      // regardless of how many accessories are selected or tried on.
      const key = JSON.stringify([selected.map(part => part.id), state.base, state.dx, state.dy, state.spacing,
        state.noseDx, state.noseDy, state.noseScale, state.scarDx, state.scarDy, state.scarRotation]);
      let cached = layers.get(layer);
      if (key !== cached?.key) {
        const canvas = cached?.canvas || makeCanvas(1024, 1024);
        const target = canvas.getContext("2d");
        target.clearRect(0, 0, 1024, 1024); target.globalCompositeOperation = "source-over";
        target.imageSmoothingEnabled = true; target.imageSmoothingQuality = "high";
        for (const part of selected) {
          const image = assets["accessories_" + part.id];
          if (!part.clipToHead) { drawImage(target, image, part, state); continue; }
          // Clip this piece only: freckles must not erase an earring or necklace.
          if (!scratch) scratch = makeCanvas(1024, 1024);
          const clipped = scratch.getContext("2d");
          clipped.clearRect(0, 0, 1024, 1024);
          drawImage(clipped, image, part, state);
          clipped.globalCompositeOperation = "destination-in";
          clipped.drawImage(assets["head_" + (state.base || "homme")], 0, 0);
          clipped.globalCompositeOperation = "source-over";
          target.drawImage(scratch, 0, 0);
        }
        cached = { key, canvas }; layers.set(layer, cached);
      }
      ctx.drawImage(cached.canvas, 0, 0);
    },
  };
}
