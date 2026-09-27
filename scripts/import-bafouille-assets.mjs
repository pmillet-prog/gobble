import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { createCanvas, loadImage } = createRequire(new URL("../server/package.json", import.meta.url))("@napi-rs/canvas");
const root = fileURLToPath(new URL("../", import.meta.url));
const input = path.resolve(process.argv[2] || path.join(root, ".tmp/bafouille"));
const output = path.join(root, "public/bots/presenters/bafouille");
const review = path.join(root, ".tmp/bafouille-review");
await fs.mkdir(output, { recursive: true });
await fs.mkdir(review, { recursive: true });

async function readImage(file) {
  const image = await loadImage(file), canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
  return { canvas, context, pixels: context.getImageData(0, 0, image.width, image.height) };
}

// The supplied poses have overlapping bounding boxes, but transparent corridors
// separate their actual pixels. Connected components preserve those contours;
// uniform rectangular slices would include pieces of the neighbouring bust.
function components({ data, width, height }) {
  const labels = new Int32Array(width * height), queue = new Int32Array(labels.length), regions = [];
  for (let p = 0; p < labels.length; p++) {
    if (labels[p] || data[p * 4 + 3] <= 8) continue;
    const id = regions.length + 1;
    let head = 0, count = 1, left = width, top = height, right = 0, bottom = 0;
    labels[p] = id; queue[0] = p;
    while (head < count) {
      const q = queue[head++], x = q % width, y = Math.floor(q / width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        const n = q + dy * width + dx;
        if (!labels[n] && data[n * 4 + 3] > 8) { labels[n] = id; queue[count++] = n; }
      }
    }
    regions.push({ id, count, left, top, right, bottom });
  }
  return { labels, regions };
}

const source = await readImage(path.join(input, "bafouille sprites.png"));
const { width, height, data } = source.pixels;
const { labels, regions } = components(source.pixels);
const figures = regions.filter(region => region.count > 50000).sort((a, b) => a.left - b.left);
assert.equal(figures.length, 7, "Expected seven separated poses; inspect the new source before importing.");
// Pose 7 repeats the neutral expression and is clipped by the source's right
// edge. The six complete poses supply neutral, four mouth poses, and a wink.
const complete = figures.slice(0, 6);
const assignments = new Map(regions.map(region => {
  const center = (region.left + region.right) / 2;
  const nearest = figures.reduce((best, figure) =>
    Math.abs(center - (figure.left + figure.right) / 2) < Math.abs(center - (best.left + best.right) / 2) ? figure : best);
  return [region.id, nearest.id];
}));
const top = Math.min(...complete.map(figure => figure.top)), bottom = Math.max(...complete.map(figure => figure.bottom));
const scale = 508 / (bottom - top); // Pinot's visible bust height in a 500x600 cell.
const frames = [];
for (const [index, figure] of complete.entries()) {
  const isolated = createCanvas(width, height), ctx = isolated.getContext("2d");
  const image = ctx.createImageData(width, height);
  for (let p = 0; p < labels.length; p++) {
    let owner = assignments.get(labels[p]);
    // Near-transparent antialiasing can join adjacent poses. Restore only the
    // fringe touching an identified contour, without joining their masks.
    if (!owner && data[p * 4 + 3]) {
      const x = p % width, y = Math.floor(p / width);
      outer: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        owner = assignments.get(labels[p + dy * width + dx]);
        if (owner) break outer;
      }
    }
    if (owner === figure.id) image.data.set(data.subarray(p * 4, p * 4 + 4), p * 4);
  }
  ctx.putImageData(image, 0, 0);
  const frame = createCanvas(500, 600), frameCtx = frame.getContext("2d");
  frameCtx.drawImage(isolated, 250 - (figure.left + figure.right) / 2 * scale, 55 - top * scale, width * scale, height * scale);
  frames.push(frame);
  await fs.writeFile(path.join(output, `frame-${index + 1}.webp`), await frame.encode("webp", 92));
}
const atlas = createCanvas(500 * frames.length, 600), atlasCtx = atlas.getContext("2d");
frames.forEach((frame, index) => atlasCtx.drawImage(frame, index * 500, 0));
await fs.writeFile(path.join(output, "frames.webp"), await atlas.encode("webp", 92));

// A head-only button, aligned to the existing 250x300 portraits. The mask follows
// the jaw of the neutral source; the other frames retain the entire supplied bust.
const button = createCanvas(250, 300), buttonCtx = button.getContext("2d");
const head = createCanvas(500, 600), headCtx = head.getContext("2d");
headCtx.beginPath(); headCtx.moveTo(40, 0); headCtx.lineTo(450, 0); headCtx.lineTo(450, 326);
headCtx.lineTo(354, 326); headCtx.bezierCurveTo(350, 385, 313, 430, 275, 449);
headCtx.bezierCurveTo(255, 460, 220, 462, 200, 458);
headCtx.bezierCurveTo(162, 448, 131, 393, 101, 325);
headCtx.lineTo(40, 325); headCtx.closePath(); headCtx.clip(); headCtx.drawImage(frames[0], 0, 0);
const headScale = 190 / 407;
buttonCtx.drawImage(head, 125 - 236 * headScale, 21 - 55 * headScale, 500 * headScale, 600 * headScale);
await fs.writeFile(path.join(output, "button.webp"), await button.encode("webp", 92));

const reactions = [];
for (const [file, name] of [["bafouille coup 1.png", "hit-1"], ["bafouille coup 2.png", "hit-2"], ["bafouille etoiles.png", "stars"]]) {
  const reaction = await readImage(path.join(input, file));
  const parts = components(reaction.pixels).regions.filter(region => region.count > 100);
  const left = Math.min(...parts.map(p => p.left)), right = Math.max(...parts.map(p => p.right));
  const upper = Math.min(...parts.map(p => p.top)), lower = Math.max(...parts.map(p => p.bottom));
  const ratio = Math.min(480 / (right - left), 570 / (lower - upper));
  const canvas = createCanvas(500, 600), ctx = canvas.getContext("2d");
  ctx.drawImage(reaction.canvas, 250 - (left + right) / 2 * ratio, 580 - lower * ratio,
    reaction.canvas.width * ratio, reaction.canvas.height * ratio);
  reactions.push(canvas);
  await fs.writeFile(path.join(output, `${name}.webp`), await canvas.encode("webp", 92));
}
const contact = createCanvas(1300, 570), ctx = contact.getContext("2d");
ctx.fillStyle = "#d5dfda"; ctx.fillRect(0, 0, contact.width, contact.height);
ctx.fillStyle = "#213831"; ctx.font = "18px Arial";
ctx.fillText("Six poses isolées — échelle de l’animation", 20, 26);
frames.forEach((frame, i) => { ctx.drawImage(frame, 20 + i * 205, 40, 158, 190); ctx.fillText(String(i + 1), 90 + i * 205, 251); });
ctx.fillText("Boutons à la même échelle / Pinot — Bafouille", 20, 300);
ctx.drawImage(await loadImage(path.join(root, "public/bots/presenters/pivot/button.webp")), 40, 320, 140, 168);
ctx.drawImage(button, 220, 320, 140, 168);
reactions.forEach((frame, i) => ctx.drawImage(frame, 470 + i * 240, 310, 190, 228));
await fs.writeFile(path.join(review, "contact.png"), await contact.encode("png"));
console.log(JSON.stringify({ source: { width, height }, figures, frameSize: [500, 600], frameCount: frames.length,
  buttonSize: [250, 300], output }, null, 2));
