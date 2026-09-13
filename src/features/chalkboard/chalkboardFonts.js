import { DEFAULT_CHALKBOARD_TEXT_FONT, isChalkboardFontId } from "../../../shared/chalkboardRules.js";

const loadedFonts = new Map();

function fontFaceFamily(id) {
  if (id === "chalk") return "GobbleChalk";
  if (id === "white-chalk") return "GobbleWhiteChalk";
  return `GobbleChalk_${id}`;
}

export function chalkboardFontFamily(id) {
  return isChalkboardFontId(id) ? `"${fontFaceFamily(id)}", sans-serif` : '"GobbleCaveat", "Segoe Print", cursive';
}

export function chalkboardCanvasFont(id, size) {
  return `${isChalkboardFontId(id) ? 400 : 700} ${size}px ${chalkboardFontFamily(id)}`;
}

export function pickChalkboardFont(fonts, random = Math.random) {
  if (!fonts.length) return DEFAULT_CHALKBOARD_TEXT_FONT;
  const index = Math.min(fonts.length - 1, Math.max(0, Math.floor(random() * fonts.length)));
  return fonts[index].id;
}

export function loadChalkboardFont(font) {
  if (!isChalkboardFontId(font?.id) || !/^\/chalkfont\/[^/]+$/.test(font?.src || "")) {
    return Promise.reject(new Error("invalid_chalkboard_font"));
  }
  const key = `${font.id}:${font.src}`;
  if (!loadedFonts.has(key)) {
    const face = new FontFace(fontFaceFamily(font.id), `url(${JSON.stringify(font.src)})`, { weight: "400", style: "normal" });
    const pending = face.load().then(loaded => {
      document.fonts.add(loaded);
      return font;
    }).catch(error => {
      loadedFonts.delete(key);
      throw error;
    });
    loadedFonts.set(key, pending);
  }
  return loadedFonts.get(key);
}

export function uppercaseChalkboardText(value) {
  return String(value || "").toLocaleUpperCase("fr-FR").normalize("NFD")
    .replace(/\p{M}/gu, "").replace(/Œ/g, "OE").replace(/Æ/g, "AE").slice(0, 280);
}

export function measureChalkboardText(text, fontSize, font) {
  const context = document.createElement("canvas").getContext("2d");
  context.font = chalkboardCanvasFont(font, fontSize);
  return Math.max(24, context.measureText(text).width + fontSize * .24);
}
