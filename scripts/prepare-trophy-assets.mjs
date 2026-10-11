import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { TROPHY_CATALOG } from "../shared/trophyCatalog.js";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const root = new URL("../public/trophies/v1/", import.meta.url);
let sourceBytes = 0;
let outputBytes = 0;

// Preserve the imagegen PNG masters and alpha; display-size exports avoid
// decoding large originals each time a player opens the shelf.
const imageIds = TROPHY_CATALOG.map(trophy => trophy.image.split("/").at(-1).replace(/\.webp$/, ""));
for (const id of ["shelf", ...imageIds]) {
  const source = await readFile(new URL(`${id}.png`, root));
  const image = await loadImage(source);
  sourceBytes += source.length;
  // The larger variant is requested only when a trophy is opened in front of the shelf.
  const variants = id === "shelf" ? [["", 1024]] : [["", 256], ["-large", 512]];
  for (const [suffix, size] of variants) {
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size, size);
    const output = await canvas.encode("webp", 88);
    await writeFile(new URL(`${id}${suffix}.webp`, root), output);
    outputBytes += output.length;
  }
}
console.log(`Trophy display assets: ${Math.round(outputBytes / 1024)} KiB (PNG masters: ${Math.round(sourceBytes / 1024)} KiB).`);
