import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chalkboardFontIdFromFilename } from "../../shared/chalkboardRules.js";

const DEFAULT_DIRECTORY = fileURLToPath(new URL("../../public/chalkfont/", import.meta.url));
const FORMAT_PRIORITY = { woff2: 0, woff: 1, otf: 2, ttf: 3 };

export function createChalkboardFontCatalog({ directory = DEFAULT_DIRECTORY } = {}) {
  let lastChange = null;
  let fonts = [];

  function getFonts() {
    let changed;
    try { changed = statSync(directory).mtimeMs; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      lastChange = null;
      return [];
    }
    if (changed === lastChange) return fonts;
    const files = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && chalkboardFontIdFromFilename(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => FORMAT_PRIORITY[a.split(".").at(-1).toLowerCase()] - FORMAT_PRIORITY[b.split(".").at(-1).toLowerCase()] || a.localeCompare(b));
    const byId = new Map();
    for (const filename of files) {
      const id = chalkboardFontIdFromFilename(filename);
      if (!byId.has(id)) byId.set(id, Object.freeze({ id, src: `/chalkfont/${encodeURIComponent(filename)}` }));
    }
    fonts = Object.freeze([...byId.values()].sort((a, b) => a.id.localeCompare(b.id)));
    lastChange = changed;
    return fonts;
  }
  return { getFonts };
}

export const chalkboardFontCatalog = createChalkboardFontCatalog();
