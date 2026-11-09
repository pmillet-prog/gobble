import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { prepareChalkboardExportFonts, CHALKBOARD_EXPORT_FONT_FALLBACK } from './chalkboardExportFonts.js';
import { drawChalkElement } from "../../src/features/chalkboard/chalkboardPaint.js";
import { boundsIntersect, getElementBounds, CHALKBOARD_WORLD, CHALKBOARD_TILE_SIZE } from "../../src/features/chalkboard/chalkboardModel.js";

const PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));

export async function renderChalkboardPng(snapshot, filename) {
  prepareChalkboardExportFonts();
  const board = createCanvas(CHALKBOARD_WORLD.width, CHALKBOARD_WORLD.height);
  const context = board.getContext("2d");
  context.fillStyle = "#263c2c";
  context.fillRect(0, 0, board.width, board.height);
  const surface = await loadImage(path.join(PUBLIC_DIR, "chalkboard/surface/patinee-v2.webp"));
  const panelWidth = surface.width * board.height / surface.height;
  for (let x = 0; x < board.width; x += panelWidth) context.drawImage(surface, x, 0, panelWidth, board.height);
  const tile = createCanvas(CHALKBOARD_TILE_SIZE, CHALKBOARD_TILE_SIZE);
  const ink = tile.getContext("2d");
  const groups = snapshot.interventions.map(entry => ({ ...entry, items: entry.elements.map(element => ({ element, bounds: getElementBounds(element) })) }));
  // Isolate masks per contribution, and rasterize in bounded tiles. This code
  // runs in an export worker, never on the game's event loop.
  for (let y = 0; y < board.height; y += CHALKBOARD_TILE_SIZE) {
    for (let x = 0; x < board.width; x += CHALKBOARD_TILE_SIZE) {
      const bounds = { minX: x, minY: y, maxX: x + CHALKBOARD_TILE_SIZE, maxY: y + CHALKBOARD_TILE_SIZE };
      for (const group of groups) {
        if (!boundsIntersect(group.bounds, bounds)) continue;
        ink.clearRect(0, 0, tile.width, tile.height);
        for (const item of group.items) if (boundsIntersect(item.bounds, bounds)) drawChalkElement(ink, item.element, x, y, bounds, 1, CHALKBOARD_EXPORT_FONT_FALLBACK);
        context.drawImage(tile, x, y);
      }
    }
  }
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(`${filename}.tmp`, await board.encode("png"));
  await rename(`${filename}.tmp`, filename);
  return { filename, width: board.width, height: board.height };
}
