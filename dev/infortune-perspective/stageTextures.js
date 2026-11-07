import { CanvasTexture, SRGBColorSpace } from "three";
import { createRenderCanvas } from './wheelRenderPlatform.js';

export function stageTextTexture(lines, { width = 1024, height = 256, color = "#f7e2b6", background = null } = {}) {
  const canvas = createRenderCanvas(width, height);
  const context = canvas.getContext("2d");
  if (background) { context.fillStyle = background; context.fillRect(0, 0, width, height); }
  context.fillStyle = color; context.textAlign = "center"; context.textBaseline = "middle";
  lines.forEach(({ text, size, y, family = "Georgia", weight = 700 }) => {
    context.font = `${weight} ${size}px ${family}`; context.fillText(text, width / 2, y, width * 0.9);
  });
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
