import eyes from "./renderer/lot_002_renderer.js";
import decorations from "./renderer/lot_003_004_renderer.js";
import hair from "./renderer/lot_005_renderer.js";
import mouths from "./renderer/lot_006_renderer.js";
import facialhair from "./renderer/lot_010_renderer.js";
import clothes from "./renderer/lot_009_renderer.js";
import headwear from "./renderer/lot_007_renderer.js";
import glasses from "./renderer/lot_008_renderer.js";
import { getAvatarRenderState } from "./avatarRenderState.js";
import { loadAvatarCatalog } from "./avatarCatalog.js";
import { drawAvatarMedals } from "./avatarMedals.js";
import { loadAvatarImage } from "./avatarAssetCache.js";
import { drawAvatarAccessories, drawAvatarCompanion, loadAvatarMarkerFont } from "./avatarAccessories.js";
import { createAvatarCosmeticsRenderer } from "./avatarCosmeticsRenderer.js";
import { createAvatarNoseRasterizer } from "./avatarNoseRasterizer.js";
import { getAvatarPartIds } from "../../../shared/avatarSelections.js";
export { loadAvatarCatalog } from "./avatarCatalog.js";

const ROOT = "/avatars/v1/";

// One renderer belongs to one mounted portrait; its images and tint caches are
// released on unmount. Only selected parts are decoded, never the whole library.
export async function createAvatarRenderer(dependencies = {}) {
  const catalog = dependencies.catalog || await loadAvatarCatalog();
  const makeCanvas = dependencies.makeCanvas || ((width = 1024, height = width) =>
    Object.assign(document.createElement("canvas"), { width, height }));
  const loadImage = dependencies.loadImage || loadAvatarImage;
  const manifest = family => ({ parts: catalog.families[family] });
  const engine = eyes.create(makeCanvas, manifest("eyes"));
  const cosmetics = createAvatarCosmeticsRenderer(makeCanvas);
  const rasterizeNose = createAvatarNoseRasterizer(makeCanvas);
  engine.setDecorations(decorations.create(makeCanvas, { brows: manifest("brows"), lashes: manifest("lashes") }));
  engine.setHair(hair.create(makeCanvas, manifest("hair")));
  engine.setMouths(mouths.create(makeCanvas, manifest("mouths")));
  engine.setFacialHair(facialhair.create(makeCanvas, manifest("facialhair")));
  engine.setClothes(clothes.create(makeCanvas, manifest("clothes")));
  engine.setHeadwear(headwear.create(makeCanvas, manifest("headwear")));
  engine.setGlasses(glasses.create(makeCanvas, manifest("glasses")));
  const images = new Map();
  async function load(file) {
    if (!images.has(file)) {
      images.set(file, loadImage(ROOT + file).catch(error => { images.delete(file); throw error; }));
      if (images.size > 32) images.delete(images.keys().next().value);
    }
    return images.get(file);
  }
  return {
    async prepare(value, options = {}) {
      const state = getAvatarRenderState(value, catalog, options);
      const assets = {};
      const loads = [];
      const add = (key, file) => { if (file) loads.push(load(file).then(image => { assets[key] = image; })); };
      for (const base of catalog.bases) { add(base.id, base.file); if (state.tone === "custom") add(base.id + "_mask", base.mask); }
      for (const family of Object.keys(catalog.families)) {
        const selected = getAvatarPartIds(state, family);
        for (const part of catalog.families[family].filter(item => selected.includes(item.id))) {
          const key = (family === "eyes" ? "eye" : family) + "_" + part.id;
          add(key, part.file);
          add(key + (family === "eyes" ? "_skin" : "_mask"), part.mask);
          for (const [name, file] of Object.entries(part.layers)) add(key + "_" + name, file);
          for (const [name, file] of Object.entries(part.masks)) add(key + "_" + name, file);
        }
      }
      await Promise.all(loads);
      const nose = catalog.families.nose?.find(part => part.id === state.nose);
      if (nose?.sourceBounds && nose.placement) {
        const { art, mask } = rasterizeNose(assets["nose_" + nose.id], nose);
        assets["nose_" + nose.id] = art; assets["nose_" + nose.id + "_mask"] = mask;
      }
      if (state.accessories.includes("participant_tag")) await loadAvatarMarkerFont();
      const resolved = engine.resolve(state, assets);
      const selectedCosmetics = catalog.families.accessories?.filter(part => state.accessories.includes(part.id)) || [];
      return { ...resolved, draw(canvas, view, medals, nickname = options.nickname) {
        const ctx = canvas.getContext("2d");
        engine.draw(canvas, assets, resolved.state, {
          view, background: "transparent",
          drawAccessories: (ctx, layer) => cosmetics.draw(ctx, assets, resolved.state, selectedCosmetics, layer),
        });
        if (view === "portrait") drawAvatarMedals(ctx, canvas.gobbleViewport, medals);
        if (view === "portrait") drawAvatarAccessories(ctx, canvas.gobbleViewport, assets.accessories_participant_tag, nickname);
        if (view === "portrait") drawAvatarCompanion(ctx, canvas.gobbleViewport, assets.accessories_tiger_plush);
        if (options.transparent) return;
        ctx.globalCompositeOperation = "destination-over";
        const gradient = ctx.createRadialGradient(canvas.width * .4, canvas.height * .3, 0, canvas.width / 2, canvas.height / 2, canvas.width * .75);
        gradient.addColorStop(0, state.backgroundColor); gradient.addColorStop(1, "#0b1724");
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
      } };
    },
  };
}
