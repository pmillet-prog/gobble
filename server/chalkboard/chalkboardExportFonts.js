import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';
import { chalkboardFontCatalog } from './chalkboardFontCatalog.js';
import { chalkboardFontFamily } from '../../src/features/chalkboard/chalkboardFonts.js';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
export const CHALKBOARD_EXPORT_FONT_FALLBACK = '"GobbleCaveat", "GobbleChalkEmoji", sans-serif';

export function prepareChalkboardExportFonts() {
  const faces = chalkboardFontCatalog.getFonts().map(font => ({
    family: chalkboardFontFamily(font.id).split('"')[1],
    filename: path.join(PUBLIC_DIR, decodeURIComponent(font.src)),
  }));
  faces.push(
    { family: 'GobbleCaveat', filename: path.join(PUBLIC_DIR, 'fonts/caveat/Caveat-VariableFont_wght.ttf') },
    { family: 'GobbleChalkEmoji', filename: fileURLToPath(new URL('./fonts/NotoEmoji.ttf', import.meta.url)) },
  );
  for (const { family, filename } of faces) {
    if (!GlobalFonts.has(family) && !GlobalFonts.registerFromPath(filename, family)) {
      throw new Error('chalkboard_export_font_failed');
    }
  }
}
