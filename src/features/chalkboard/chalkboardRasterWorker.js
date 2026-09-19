import { drawChalkElement } from "./chalkboardPaint.js";
import { boundsIntersect, CHALKBOARD_TILE_SIZE } from "./chalkboardModel.js";
import { chalkboardFontFamily } from "./chalkboardFonts.js";

const loadedFonts = new Map();
let isolated = null;

self.onmessage = async ({ data }) => {
  const { id, groups, bounds, fonts, ratio } = data;
  const pixels = Math.round(CHALKBOARD_TILE_SIZE * ratio);
  try {
    const usedFonts = new Set(groups.flatMap(group => group.items
      .filter(item => item.element.type === "text").map(item => item.element.font)));
    await Promise.all(fonts.filter(font => usedFonts.has(font.id)).map(async font => {
      if (!loadedFonts.has(font.id)) {
        const family = chalkboardFontFamily(font.id).split(",")[0].replaceAll('"', "");
        const face = new FontFace(family, `url(${JSON.stringify(new URL(font.src, self.location.origin).href)})`);
        loadedFonts.set(font.id, face.load().then(loaded => self.fonts.add(loaded)).catch(error => {
          loadedFonts.delete(font.id);
          throw error;
        }));
      }
      await loadedFonts.get(font.id);
    }));
    const canvas = new OffscreenCanvas(pixels, pixels);
    const context = canvas.getContext("2d");
    for (const group of groups) {
      const erased = group.items.some(item => item.element.type === "erase");
      if (erased && isolated?.width !== pixels) isolated = new OffscreenCanvas(pixels, pixels);
      const target = erased ? isolated.getContext("2d") : context;
      target.setTransform(1, 0, 0, 1, 0, 0);
      if (erased) target.clearRect(0, 0, pixels, pixels);
      target.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (const item of group.items) {
        if (boundsIntersect(item.bounds, bounds)) drawChalkElement(target, item.element, bounds.minX, bounds.minY, bounds);
      }
      if (erased) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(isolated, 0, 0);
      }
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id, bitmap }, [bitmap]);
  } catch (_) {
    self.postMessage({ id, error: true });
  }
};
