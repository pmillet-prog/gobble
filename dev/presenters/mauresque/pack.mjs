// Asset packing only: retain ImageGen's original alpha, with no background removal.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../../server/package.json', import.meta.url));
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const output = new URL('../../../public/bots/presenters/mauresque/', import.meta.url);
await mkdir(output, { recursive: true });

function pixels(image) {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

function bounds(image, data, start = 0, end = image.width) {
  let left = end, right = start, top = image.height, bottom = 0;
  for (let y = 0; y < image.height; y++) for (let x = start; x < end; x++) {
    // Do not let imperceptible alpha=1 pixels set the layout bounds.
    // Alpha values themselves are never modified.
    if (data[(y * image.width + x) * 4 + 3] <= 1) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  assert.ok(right > left && bottom > top, 'Visible portrait');
  assert.ok(top > 0 && bottom < image.height - 1, 'Transparent vertical margins');
  left = Math.max(start, left - 2); right = Math.min(end - 1, right + 2);
  top = Math.max(0, top - 2); bottom = Math.min(image.height - 1, bottom + 2);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function place(context, image, box, x, y, scale) {
  context.drawImage(image, box.left, box.top, box.width, box.height,
    x, y, box.width * scale, box.height * scale);
}

const head = await loadImage(fileURLToPath(new URL('./head-source-v2.png', import.meta.url)));
const headBox = bounds(head, pixels(head));
const button = createCanvas(250, 300);
const headScale = Math.min(160 / headBox.width, 190 / headBox.height);
place(button.getContext('2d'), head, headBox, (250 - headBox.width * headScale) / 2, 25, headScale);
await writeFile(new URL('button-v2.webp', output), await button.encode('webp', 94));

const source = await loadImage(fileURLToPath(new URL('./sprites-source-v2.png', import.meta.url)));
const data = pixels(source);
// ImageGen's five poses are not at exact 1/5 intervals. Split in the actual
// transparent gaps so that a neighboring shoulder cannot bleed into a frame.
assert.equal(source.width, 1959);
const cuts = [0, 391, 778, 1165, 1553, 1959];
const boxes = Array.from({ length: 5 }, (_, i) => bounds(source, data, cuts[i], cuts[i + 1]));
const scale = Math.min(440 / Math.max(...boxes.map(box => box.width)),
  540 / Math.max(...boxes.map(box => box.height)));
const sheet = createCanvas(2500, 600);
const context = sheet.getContext('2d');
// One common vertical origin and scale keep the eyes steady through speech.
const top = Math.min(...boxes.map(box => box.top));
for (const [i, box] of boxes.entries()) {
  place(context, source, box, i * 500 + (500 - box.width * scale) / 2,
    30 + (box.top - top) * scale, scale);
}
await writeFile(new URL('frames-v2.webp', output), await sheet.encode('webp', 94));

// Check the encoded assets, including gaps separating every animation frame.
for (const [name, cells] of [['button-v2.webp', 1], ['frames-v2.webp', 5]]) {
  const image = await loadImage(fileURLToPath(new URL(name, output)));
  const rgba = pixels(image);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const localX = x % (image.width / cells);
    if (localX < 3 || localX >= image.width / cells - 3 || y < 3 || y >= image.height - 3) {
      assert.equal(rgba[(y * image.width + x) * 4 + 3], 0, `${name}: transparent edges`);
    }
  }
  console.log(`${name}: ${image.width}x${image.height}, alpha margins checked`);
}

// Small visual review on both UI background colors; this is not a runtime asset.
const review = createCanvas(1100, 660);
const view = review.getContext('2d');
const neighbors = await Promise.all(['pivot', 'bafouille'].map(name =>
  loadImage(fileURLToPath(new URL(`../../../public/bots/presenters/${name}/button.webp`, import.meta.url)))));
for (const [row, background] of [[0, '#f8f4e9'], [1, '#152a38']]) {
  const y = row * 330;
  view.fillStyle = background; view.fillRect(0, y, 1100, 330);
  for (const [i, image] of [...neighbors, button].entries()) {
    // Same contain + scale(1.4) translateY(15%) as the neighboring button.
    view.drawImage(image, 38 + i * 105, y + 60, 98, 117.6);
  }
  for (let i = 0; i < 5; i++) view.drawImage(sheet, i * 500, 0, 500, 600,
    375 + i * 140, y + 55, 140, 168);
}
await writeFile(new URL('./preview-v2.png', import.meta.url), await review.encode('png'));
