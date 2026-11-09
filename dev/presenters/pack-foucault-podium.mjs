// Extract the existing mini-game poses; do not regenerate or alter the artwork.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getFoucaultQuestionViewBox, getFoucaultQuestionClipPoints } from '../../src/components/targetQuiz/foucaultAnimation.js';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const root = new URL('../../public/', import.meta.url);
const output = new URL('bots/presenters/foucault/', root);
await mkdir(output, { recursive: true });
const sheet = await loadImage(fileURLToPath(new URL('bots/foucault/questions.png', root)));
for (const [index, frame] of [3, 5].entries()) {
  const [left, top, width, height] = getFoucaultQuestionViewBox(frame).split(' ').map(Number);
  const canvas = createCanvas(500, 600), context = canvas.getContext('2d');
  const scale = 540 / height;
  context.translate((500 - width * scale) / 2, 30);
  context.scale(scale, scale);
  context.translate(-left, -top);
  context.beginPath();
  for (const [i, point] of getFoucaultQuestionClipPoints(frame).split(' ').entries()) {
    const [x, y] = point.split(',').map(Number);
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath(); context.clip();
  context.drawImage(sheet, 0, 0);
  await writeFile(new URL(`frame-${index + 1}.webp`, output), await canvas.encode('webp', 92));
  const data = context.getImageData(0, 0, 500, 600).data;
  let x0 = 500, y0 = 600, x1 = 0, y1 = 0;
  for (let y = 0; y < 600; y++) for (let x = 0; x < 500; x++) if (data[(y * 500 + x) * 4 + 3] > 8) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  console.log(`frame-${index + 1}:`, [x0, y0, x1 + 1, y1 + 1]);
}
for (const name of ['hit-1', 'hit-2', 'stars']) {
  const image = await loadImage(fileURLToPath(new URL(`bots/foucault/${name}.png`, root)));
  const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let bottom = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] > 8) bottom = y + 1;
  }
  console.log(name, { width: canvas.width, height: canvas.height, bottom });
}
