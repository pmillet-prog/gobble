import { chalkboardCanvasFont } from "./chalkboardFonts.js";
import { isChalkboardFontId } from "../../../shared/chalkboardRules.js";
import { getChalkboardLineHeight, getChalkboardTextLines } from "../../../shared/chalkboardText.js";

export function paintChalkboardTextLines(context, element, method = "fillText", dx = 0, dy = 0) {
  const lines = getChalkboardTextLines(element);
  const lineHeight = getChalkboardLineHeight(element);
  lines.forEach((line, index) => {
    const y = (index - (lines.length - 1) / 2) * lineHeight + dy;
    if (!Array.isArray(element.lineBreaks) && isChalkboardFontId(element.font)) {
      // Preserve the geometry of messages published before multiline support.
      context[method](line, dx, y, Math.max(1, element.width - element.fontSize * .24));
    } else {
      context[method](line, dx, y);
    }
  });
}

function createRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const value = Number.parseInt(String(hex || "#f4f0df").slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function isSegmentVisible(start, end, size, clipBounds) {
  if (!clipBounds) return true;
  const margin = size * 2;
  return !(
    Math.max(start.x, end.x) + margin < clipBounds.minX ||
    Math.min(start.x, end.x) - margin > clipBounds.maxX ||
    Math.max(start.y, end.y) + margin < clipBounds.minY ||
    Math.min(start.y, end.y) - margin > clipBounds.maxY
  );
}

export function drawChalkStroke(context, element, offsetX = 0, offsetY = 0, clipBounds = null, startPoint = 1) {
  const points = Array.isArray(element.points) ? element.points : [];
  if (points.length < 2) return;
  const rgb = hexToRgb(element.color);
  context.save();
  context.translate(-offsetX, -offsetY);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (let index = Math.max(1, startPoint); index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!isSegmentVisible(start, end, element.size, clipBounds)) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (!length) continue;
    const random = createRandom((element.seed + index * 2654435761) >>> 0);
    const normalX = -dy / length;
    const normalY = dx / length;
    const tangentX = dx / length;
    const tangentY = dy / length;

    context.globalAlpha = 1;
    context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.30)`;
    context.lineWidth = element.size * 0.72;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();

    const steps = Math.max(1, Math.ceil(length / 1.8));
    const particles = Math.max(14, Math.round(element.size * 2.6));
    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      const x = start.x + dx * progress;
      const y = start.y + dy * progress;
      for (let particle = 0; particle < particles; particle += 1) {
        const spread = (random() - 0.5) * element.size * 1.85;
        const along = (random() - 0.5) * 3.2;
        const particleX = x + normalX * spread + tangentX * along;
        const particleY = y + normalY * spread + tangentY * along;
        const radius = random() * 1.25 + 0.18;
        const alpha = 0.06 + random() * 0.24;
        context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
        context.beginPath();
        context.arc(particleX, particleY, radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    const outerDust = Math.max(4, Math.round(length / 3.5));
    for (let dust = 0; dust < outerDust; dust += 1) {
      const progress = random();
      const x = start.x + dx * progress;
      const y = start.y + dy * progress;
      const side = random() < 0.5 ? -1 : 1;
      const dustOffset = side * (element.size * 0.45 + random() * element.size * 1.1);
      context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.025 + random() * 0.09})`;
      context.beginPath();
      context.arc(
        x + normalX * dustOffset + (random() - 0.5) * 4,
        y + normalY * dustOffset + (random() - 0.5) * 4,
        random() * 0.9 + 0.12,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }
  context.restore();
}

function drawChalkText(context, element, offsetX = 0, offsetY = 0) {
  const random = createRandom(element.seed);
  context.save();
  context.translate(element.cx - offsetX, element.cy - offsetY);
  context.rotate(element.angle);
  context.scale(element.scale, element.scale);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = chalkboardCanvasFont(element.font, element.fontSize);
  context.fillStyle = "#f5f2e8";
  if (isChalkboardFontId(element.font)) {
    // These faces contain their own chalk grain. Keep natural glyph proportions.
    context.globalAlpha = .94;
    paintChalkboardTextLines(context, element);
    context.restore();
    return;
  }
  context.globalAlpha = 0.76;
  paintChalkboardTextLines(context, element);
  for (let pass = 0; pass < 4; pass += 1) {
    context.globalAlpha = 0.07 + random() * 0.08;
    const jitterX = (random() - 0.5) * 2.8;
    const jitterY = (random() - 0.5) * 2.2;
    paintChalkboardTextLines(context, element, "fillText", jitterX, jitterY);
  }
  context.restore();
}

export function drawChalkElement(context, element, offsetX = 0, offsetY = 0, clipBounds = null, startPoint = 1) {
  if (element?.type === "erase") {
    const points = element.points;
    if (!points?.length) return;
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.globalAlpha = 1;
    context.lineWidth = element.size;
    context.lineCap = context.lineJoin = "round";
    context.strokeStyle = context.fillStyle = "#000";
    const first = points[Math.max(0, startPoint - 1)];
    context.beginPath();
    if (points.length === 1) {
      context.arc(first.x - offsetX, first.y - offsetY, element.size / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(first.x - offsetX, first.y - offsetY);
      for (let index = Math.max(1, startPoint); index < points.length; index++) context.lineTo(points[index].x - offsetX, points[index].y - offsetY);
      context.stroke();
    }
    context.restore();
  }
  if (element?.type === "stroke") drawChalkStroke(context, element, offsetX, offsetY, clipBounds, startPoint);
  if (element?.type === "text") drawChalkText(context, element, offsetX, offsetY);
}
