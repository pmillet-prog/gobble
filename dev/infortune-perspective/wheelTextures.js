import { CanvasTexture, SRGBColorSpace } from "three";
import { sectorLetteringLayout, measureSectorGlyph, drawSectorGlyph } from "./sectorLetteringLayout.js";

function textureFrom(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

export function createSectorLettering(sector) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 640;
  const context = canvas.getContext("2d");
  context.scale(256 / 72, 640 / 178); context.textAlign = "center";
  const golden = sector.kind === "bonus" || sector.amount === 1000;
  context.fillStyle = sector.kind === "bankrupt" ? "#fff2d7" : golden ? "#342006" : "#172132";
  if (golden) { context.shadowColor = "#fff3b0"; context.shadowOffsetY = 0.5; context.shadowBlur = 0.6; }
  for (const glyph of sectorLetteringLayout(sector, measureSectorGlyph(context))) drawSectorGlyph(context, glyph);
  return textureFrom(canvas);
}

