// Keep the existing URL usable while exposing one shared board.
export const CHALKBOARD_BOARD = "free";
export const CHALKBOARD_TEXT_FONTS = Object.freeze(["chalk", "white-chalk"]);
export const DEFAULT_CHALKBOARD_TEXT_FONT = "chalk";

export function normalizeChalkboardFont(value, available = CHALKBOARD_TEXT_FONTS) {
  return available.includes(value) ? value : DEFAULT_CHALKBOARD_TEXT_FONT;
}

export function chalkboardFontIdFromFilename(filename) {
  if (typeof filename !== "string" || /[/\\\0]/.test(filename)) return "";
  const match = filename.match(/^(.+)\.(?:otf|ttf|woff2?)$/i);
  if (!match) return "";
  return match[1].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function isChalkboardFontId(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
