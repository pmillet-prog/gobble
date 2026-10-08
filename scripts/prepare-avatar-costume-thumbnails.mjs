import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createCanvas, loadImage, avatarAssetRoot } from "../server/scripts/helpers/avatarCanvasHarness.js";
import { AVATAR_COSTUMES } from "../shared/avatarCostumes.js";

// Display-size exports keep the costume shelf from decoding 22 full-size PNGs.
// Source artwork and its alpha are kept intact; only thumbnails are resampled.
const partial = process.argv.includes("--available");
let bytes = 0, count = 0;
for (const part of AVATAR_COSTUMES) {
  const source = new URL(part.file, avatarAssetRoot);
  try { await access(source); } catch (error) { if (partial) continue; throw error; }
  const image = await loadImage(await readFile(source));
  const canvas = createCanvas(320, 320), ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  const scale = Math.min(320 / image.width, 320 / image.height);
  ctx.drawImage(image, (320 - image.width * scale) / 2, (320 - image.height * scale) / 2, image.width * scale, image.height * scale);
  const thumbnail = await canvas.encode("webp", 85);
  const target = new URL(part.thumbnail, avatarAssetRoot);
  await mkdir(new URL(".", target), { recursive: true });
  await writeFile(target, thumbnail);
  bytes += thumbnail.length; count++;
}
console.log(`${count} costume thumbnails: ${(bytes / 1024).toFixed(0)} KiB total`);
