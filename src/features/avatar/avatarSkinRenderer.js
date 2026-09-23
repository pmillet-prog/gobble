import skinRenderer from "./renderer/lot_001_renderer.js";

// The entire PNG replaces the head, including its own silhouette. All generated
// heads use the same square authoring frame; fitting their alpha bounds back to
// the old head would erase the new cheek/jaw proportions.
export function createAvatarSkinRenderer(makeCanvas) {
  let cached = null;
  return {
    prepare(assets, state) {
      if (!assets.skin_relief) return null;
      const signature = JSON.stringify([state.base, state.skinStyle, state.tone, state.customColor]);
      if (cached?.signature === signature) return cached.canvas;
      const canvas = makeCanvas(1024, 1024), ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      const offsetY = state.skinStyle === "defined" ? 6 : 0;
      ctx.drawImage(assets.skin_relief, 0, offsetY, 1024, 1024);
      if (state.tone === "custom") {
        const pixels = ctx.getImageData(0, 0, 1024, 1024);
        // Tint the whole new head, including cheeks outside the former mask.
        // Transparency continues to come exclusively from the source PNG.
        skinRenderer.recolorPixels(pixels.data, new Uint8ClampedArray(pixels.data.length).fill(255), state.customColor);
        ctx.putImageData(pixels, 0, 0);
      }
      cached = { signature, canvas };
      return canvas;
    },
  };
}
