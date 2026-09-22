import { getChalkboardTextLines, getChalkboardTextHeight } from "../../../shared/chalkboardText.js";
import { chalkboardCanvasFont } from "./chalkboardFonts.js";
import { CHALKBOARD_WORLD } from "./chalkboardModel.js";

function wrapText(text, limit, measure, maxWidth = 1500, paragraphBreaks = []) {
  const breaks = [];
  let start = 0;
  while (start < text.length) {
    let end = start;
    let lastSpace = -1;
    let count = 0;
    const paragraphEnd = paragraphBreaks.find(end => end > start) || text.length;
    for (const character of text.slice(start, paragraphEnd)) {
      const next = end + character.length;
      if (count && (count >= limit || measure(text.slice(start, next).trim()) > maxWidth)) break;
      if (character === " ") lastSpace = end;
      end = next;
      count++;
    }
    if (end === paragraphEnd) {
      if (end === text.length) break;
      breaks.push(end); start = end; continue;
    }
    // Prefer whole words; split only a word that cannot fit on a line itself.
    if (text[end] === " ") end++;
    else if (lastSpace > start) end = lastSpace + 1;
    else {
      // A normal word may exceed the preferred width. Keep it whole instead
      // of orphaning its last letter. Only pathological tokens hit the cap.
      const space = text.indexOf(" ", end);
      const wordEnd = space < 0 ? paragraphEnd : Math.min(space, paragraphEnd);
      if (measure(text.slice(start, wordEnd)) <= 1500) end = wordEnd < paragraphEnd ? wordEnd + 1 : wordEnd;
      else {
        for (const character of text.slice(end, wordEnd)) {
          if (measure(text.slice(start, end + character.length)) > 1500) break;
          end += character.length;
        }
        if ([...text.slice(end, wordEnd)].length === 1 && [...text.slice(start, end)].length > 2) end -= [...text.slice(start, end)].at(-1).length;
      }
    }
    if (end === text.length) break;
    breaks.push(end);
    start = end;
  }
  return breaks;
}

export function reflowChalkboardText(element, width, measureWidth) {
  if (!measureWidth) {
    const context = document.createElement("canvas").getContext("2d");
    context.font = chalkboardCanvasFont(element.font, element.fontSize);
    measureWidth = value => context.measureText(value).width;
  }
  const padding = element.fontSize * .24;
  const requestedWidth = Math.max(80, Math.min(1600, width));
  const lineBreaks = wrapText(element.text, Infinity, measureWidth, requestedWidth - padding, element.paragraphBreaks);
  const actualWidth = Math.max(requestedWidth, ...getChalkboardTextLines({ ...element, lineBreaks }).map(line => measureWidth(line) + padding));
  return { ...element, width: Math.min(1600, actualWidth), lineBreaks };
}

export function getChalkboardTextViewport(viewport) {
  const scale = viewport.scale > 0 ? viewport.scale : Math.max(1, viewport.height) / CHALKBOARD_WORLD.height;
  return {
    width: Math.max(1, viewport.width) / scale,
    height: Math.min(CHALKBOARD_WORLD.height, Math.max(1, viewport.height) / scale),
    // Include the handle radius, its outline and a comfortable edge gap.
    margin: 24 / scale,
  };
}

export function layoutChalkboardText(text, font, viewport, measureWidth) {
  const fontSize = 68;
  if (!measureWidth) {
    const context = document.createElement("canvas").getContext("2d");
    context.font = chalkboardCanvasFont(font, fontSize);
    measureWidth = value => context.measureText(value).width;
  }
  const measurements = new Map();
  const measure = value => {
    if (!measurements.has(value)) measurements.set(value, measureWidth(value));
    return measurements.get(value);
  };
  const { width: visibleWidth, height: visibleHeight, margin } = getChalkboardTextViewport(viewport);
  let best;
  // Choose a compact paragraph that fits the available aspect ratio. Keep
  // lines at most 32 characters, without making narrow screens excessively tall.
  for (let limit = 32; limit >= 8; limit--) {
    const candidate = { text, font, fontSize, lineBreaks: wrapText(text, limit, measure) };
    candidate.width = Math.max(24, ...getChalkboardTextLines(candidate).map(measure)) + fontSize * .24;
    const height = getChalkboardTextHeight(candidate);
    candidate.scale = Math.min(1,
      (visibleWidth - 2 * margin) / (candidate.width + 28),
      (visibleHeight - 2 * margin) / (height + 92));
    if (!best || candidate.scale > best.scale + .001) best = candidate;
  }
  // Very small viewports can need a smaller base size, but never distort the
  // glyphs horizontally. Keep the editor/server's existing minimum scale.
  if (best.scale < .3) {
    const ratio = Math.max(24 / fontSize, best.scale / .3);
    best.fontSize = Math.floor(fontSize * ratio * 10) / 10;
    best.width *= best.fontSize / fontSize;
    best.scale = .3;
  }
  best.scale = Math.max(.3, Math.floor(best.scale * 1000) / 1000);
  return best;
}

export function getChalkboardTextPlacementLimits(element, viewport) {
  const { margin } = getChalkboardTextViewport(viewport);
  const halfWidth = element.width * element.scale / 2;
  const halfHeight = getChalkboardTextHeight(element) * element.scale / 2;
  // Symmetric clearance also keeps the handles visible when centering the view.
  const x = halfWidth + 14 * element.scale + margin;
  const y = halfHeight + 46 * element.scale + margin;
  return { minX: x, maxX: CHALKBOARD_WORLD.width - x, minY: y, maxY: CHALKBOARD_WORLD.height - y };
}
