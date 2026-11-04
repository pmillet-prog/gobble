import { Quaternion, Vector3 } from "three";
import { SECTOR_ANGLE, TILE_BASE, TILE_BEVEL, tileExtrusion } from "./tileGeometry.js";

const clamp = value => Math.max(0, Math.min(1, value));
export const resultEase = (time, from, to) => { const t = clamp((time - from) / (to - from)); return t * t * (3 - 2 * t); };
export const RESULT_TILE_CENTER = 161;

export function resultTilePose(result, wheelAngle) {
  const angle = wheelAngle + (result.index + 0.5) * SECTOR_ANGLE;
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -angle);
  const top = TILE_BASE + tileExtrusion(result.index, result.kind === "bonus" || result.amount === 1000).depth + TILE_BEVEL + (result.kind === "exchange" ? 0.72 : 0);
  return {
    position: new Vector3(0, 0, -RESULT_TILE_CENTER).applyQuaternion(rotation).add(new Vector3(0, top + 0.045, 0)),
    quaternion: rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)),
  };
}

export function resultMotion(time) {
  return {
    ignite: resultEase(time, 0, 0.23), lift: resultEase(time, 0.32, 1.4),
    spread: resultEase(time, 1.3, 2.6), outline: 1 - resultEase(time, 1.65, 2.5),
    caption: resultEase(time, 2.25, 2.85),
  };
}

// Retain character order, equalize font sizes and reserve a small currency gap.
export function horizontalResultLayout(glyphs) {
  const sizes = glyphs.map(glyph => glyph.character === "€" ? 32 : 44);
  const widths = glyphs.map((glyph, index) => glyph.width * sizes[index] / glyph.size);
  const gaps = glyphs.map((glyph, index) => index === 0 ? 0 : glyph.character === "€" ? 12 : 3);
  const width = widths.reduce((sum, value, index) => sum + value + gaps[index], 0);
  let cursor = -width / 2;
  return { width, letters: glyphs.map((glyph, index) => {
    cursor += gaps[index]; const x = cursor + widths[index] / 2; cursor += widths[index];
    return { x, y: 0, scale: sizes[index] / glyph.size };
  }) };
}
