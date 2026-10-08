import legacyClothes from "./renderer/lot_009_renderer.js";
import skinRenderer from "./renderer/lot_001_renderer.js";

// New garments have two disjoint fabric masks and no baked-in skin. Existing
// garments keep their original renderer, masks, fitting and coloring behavior.
export function createAvatarClothesRenderer(makeCanvas, manifest) {
  const legacy = legacyClothes.create(makeCanvas, manifest);
  const skin = skinRenderer.create(makeCanvas);
  const fabrics = new Map(), maskPixels = new WeakMap();

  function pixelsFor(mask) {
    if (!maskPixels.has(mask)) {
      const canvas = makeCanvas(1024, 1024), ctx = canvas.getContext("2d");
      ctx.drawImage(mask, 0, 0);
      maskPixels.set(mask, ctx.getImageData(0, 0, 1024, 1024).data);
    }
    return maskPixels.get(mask);
  }

  function fabric(part, assets, state) {
    const key = "clothes_" + part.id;
    const primary = state.clothesColor || part.colorDefaults.clothesColor;
    const secondary = state.clothesSecondaryColor || part.colorDefaults.clothesSecondaryColor;
    const signature = JSON.stringify([part.id, primary, secondary]);
    if (fabrics.has(signature)) return fabrics.get(signature);
    const canvas = makeCanvas(1024, 1024), ctx = canvas.getContext("2d");
    ctx.drawImage(assets[key], 0, 0);
    const pixels = ctx.getImageData(0, 0, 1024, 1024);
    skinRenderer.recolorPixels(pixels.data, pixelsFor(assets[key + "_mask"]), primary, false, "hair");
    skinRenderer.recolorPixels(pixels.data, pixelsFor(assets[key + "_secondary"]), secondary, false, "hair");
    ctx.putImageData(pixels, 0, 0);
    if (fabrics.size >= 4) fabrics.delete(fabrics.keys().next().value);
    fabrics.set(signature, canvas);
    return canvas;
  }

  function drawNeck(ctx, assets, state) {
    const key = "bust_" + (state.base || "femme");
    const bust = skin.tinted(key, assets[key], "bust", state.tone || "native", assets[key + "_mask"], state.customColor, state.showMask);
    // Extend only known skin into open collars; the source's original yellow
    // shirt and blue jacket must never appear behind the new garment.
    ctx.drawImage(bust, 475, 590, 74, 60, 447, 550, 130, 250);
    ctx.save(); ctx.beginPath(); ctx.rect(456, 550, 115, 85); ctx.clip();
    ctx.drawImage(bust, 0, 0); ctx.restore();
  }

  return {
    selected: legacy.selected,
    draw(ctx, assets, state) {
      const part = legacy.selected(state);
      if (!part?.dualColor) return legacy.draw(ctx, assets, state);
      if (!assets["clothes_" + part.id]) return false;
      const garment = fabric(part, assets, state);
      drawNeck(ctx, assets, state);
      ctx.drawImage(garment, 0, 0);
      return true;
    },
  };
}
