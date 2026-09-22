import { uppercaseChalkboardText } from "./chalkboardFonts.js";
import { getChalkboardTextLines } from "../../../shared/chalkboardText.js";
import { reflowChalkboardText } from "./chalkboardTextLayout.js";
import { worldToTextLocal } from "./chalkboardModel.js";

export function normalizeChalkboardMessage(rawText) {
  const paragraphs = uppercaseChalkboardText(rawText).split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const paragraphBreaks = [];
  let text = "";
  for (const paragraph of paragraphs) {
    if (text) { text += " "; paragraphBreaks.push(text.length); }
    text += paragraph;
  }
  return { text, paragraphBreaks };
}

export function getChalkboardEditableText(element) {
  return getChalkboardTextLines({ ...element, lineBreaks: element.paragraphBreaks || [] }).join("\n");
}

export function resizeChalkboardTextWidth(original, point, measureWidth) {
  const local = worldToTextLocal(original, point.x, point.y);
  return reflowChalkboardText(original, 2 * (local.x - 14), measureWidth);
}
