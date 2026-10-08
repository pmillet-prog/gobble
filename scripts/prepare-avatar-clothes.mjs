import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createCanvas, loadImage, avatarAssetRoot } from "../server/scripts/helpers/avatarCanvasHarness.js";
import skinRenderer from "../src/features/avatar/renderer/lot_001_renderer.js";
import { AVATAR_ADDITIONAL_CLOTHES } from "../shared/avatarClothes.js";

const sourceRoot = new URL("../dev/avatar-clothes/sources/", import.meta.url);
const partial = process.argv.includes("--available");
const report = [];
const models = AVATAR_ADDITIONAL_CLOTHES.filter(part => part.base === "homme");
const widths = { poncho: 900, kimono: 870, quilted_vest: 810, varsity: 830, raincoat: 850 };

async function save(url, bytes) {
  await mkdir(new URL(".", url), { recursive: true });
  await writeFile(url, bytes);
}

for (const part of models) {
  const source = new URL(`${part.model_id}.png`, sourceRoot);
  try { await access(source); } catch (error) { if (partial) continue; throw error; }
  const image = await loadImage(await readFile(source));
  const raw = createCanvas(image.width, image.height), rawCtx = raw.getContext("2d");
  rawCtx.drawImage(image, 0, 0);
  const pixels = rawCtx.getImageData(0, 0, image.width, image.height).data;
  let left = image.width, top = image.height, right = 0, bottom = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (pixels[(y * image.width + x) * 4 + 3] < 24) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  assert.ok(right > left && bottom > top, `${part.model_id}: empty image`);
  // Register only the textile silhouette to the existing chest. The generated
  // originals stay unchanged; exported art and both masks share this transform.
  const width = widths[part.model_id] || 810;
  const canvas = createCanvas(1024, 1024), ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, left, top, right - left + 1, bottom - top + 1, 512 - width / 2, 575, width, 420);
  await save(new URL(part.file, avatarAssetRoot), canvas.toBuffer("image/png"));
  const art = ctx.getImageData(0, 0, 1024, 1024);
  const masks = [ctx.createImageData(1024, 1024), ctx.createImageData(1024, 1024)];
  const coverage = [0, 0];
  for (let index = 0; index < art.data.length; index += 4) {
    const [r, g, b, alpha] = art.data.subarray(index, index + 4);
    // The generation palette has disjoint cool/warm fabrics. Neutral metal and
    // ink remain unmasked. Preserve soft highlights without changing alpha.
    const primary = alpha ? Math.max(0, Math.min(1, (Math.min(g, b) - r - 3) / 14)) : 0;
    const secondary = alpha ? Math.max(0, Math.min(1, (r - Math.max(g, b) - 3) / 14)) : 0;
    assert.ok(primary + secondary <= 1, `${part.model_id}: overlapping color regions`);
    for (const [slot, weight] of [primary, secondary].entries()) {
      const value = Math.round(weight * 255), data = masks[slot].data;
      data[index] = value; data[index + 1] = value; data[index + 2] = value; data[index + 3] = 255;
      coverage[slot] += weight;
    }
  }
  for (const [slot, file] of [part.mask, part.masks.secondary].entries()) {
    assert.ok(coverage[slot] > 2000, `${part.model_id}: missing color region ${slot}`);
    const mask = createCanvas(1024, 1024); mask.getContext("2d").putImageData(masks[slot], 0, 0);
    await save(new URL(file, avatarAssetRoot), mask.toBuffer("image/png"));
  }
  skinRenderer.recolorPixels(art.data, masks[0].data, part.colorDefaults.clothesColor, false, "hair");
  skinRenderer.recolorPixels(art.data, masks[1].data, part.colorDefaults.clothesSecondaryColor, false, "hair");
  ctx.putImageData(art, 0, 0);
  const thumbnail = createCanvas(320, 267), tctx = thumbnail.getContext("2d");
  tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = "high";
  tctx.drawImage(canvas, 20, 500, 984, 524, 0, 48, 320, 170);
  const webp = await thumbnail.encode("webp", 85);
  await save(new URL(part.thumbnail, avatarAssetRoot), webp);
  report.push({ model: part.model_id, sourceBounds: [left, top, right - left + 1, bottom - top + 1],
    placement: [512 - width / 2, 575, width, 420], colorPixels: coverage.map(Math.round), thumbnailBytes: webp.length });
}
await save(new URL("../dev/avatar-clothes/preparation.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(`${report.length} clothing designs prepared with two separate masks; ${(report.reduce((n, r) => n + r.thumbnailBytes, 0) / 1024).toFixed(0)} KiB of thumbnails`);
