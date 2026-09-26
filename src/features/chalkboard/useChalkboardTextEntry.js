import React from "react";
import { CHALKBOARD_LIMITS } from "../../../shared/chalkboardLimits.js";
import { CHALKBOARD_WORLD, createElementId, createRandomSeed, getTextHeight } from "./chalkboardModel.js";
import { findChalkboardTextPlacement } from "./chalkboardTextPlacement.js";
import { pickChalkboardFont } from "./chalkboardFonts.js";
import { getChalkboardTextPlacementLimits, getChalkboardTextViewport, reflowChalkboardText } from "./chalkboardTextLayout.js";
import { getChalkboardEditableText, normalizeChalkboardMessage } from "./chalkboardTextDraft.js";
import { normalizeChalkboardTextColor } from "../../../shared/chalkboardText.js";

// Typing and handle gestures form one cancellable edit, not one undo per key.
export default function useChalkboardTextEntry({ fontCatalog, elementsRef, replaceElements, setSelectedTextId, setLimitReached }) {
  const [entry, setEntry] = React.useState(null);
  const entryRef = React.useRef(null);
  const preferredStyle = React.useRef({ font: "", color: normalizeChalkboardTextColor() });
  const publishEntry = value => { entryRef.current = value; setEntry(value); };
  const clear = React.useCallback(() => { entryRef.current = null; setEntry(null); }, []);
  const begin = React.useCallback(position => {
    if (!fontCatalog.ready) return;
    const original = position.element;
    if (!original && elementsRef.current.length >= CHALKBOARD_LIMITS.maxElements) { setLimitReached(true); return; }
    const preferredFont = fontCatalog.fonts.some(font => font.id === preferredStyle.current.font) ? preferredStyle.current.font : "";
    const next = { ...position, id: original?.id || createElementId("text"), seed: original?.seed ?? createRandomSeed(),
      font: original?.font || preferredFont || pickChalkboardFont(fontCatalog.fonts),
      color: normalizeChalkboardTextColor(original ? original.color : preferredStyle.current.color), before: elementsRef.current,
      rawText: original ? getChalkboardEditableText(original) : "", adjusted: !!original };
    publishEntry(next);
    setSelectedTextId(next.id);
  }, [elementsRef, fontCatalog.ready, fontCatalog.fonts, setLimitReached, setSelectedTextId]);
  const update = React.useCallback((rawText, viewport) => {
    const current = entryRef.current;
    if (!current) return;
    const message = normalizeChalkboardMessage(rawText);
    const previous = elementsRef.current.find(element => element.id === current.id);
    const next = { ...current, rawText };
    if (!message.text) {
      replaceElements(elementsRef.current.filter(element => element.id !== current.id), { remember: false });
      publishEntry(next);
      return;
    }
    // A keyboard changes the space available for editing, not the dimensions
    // of the draft. Keep the board viewport captured before focusing the field.
    const placementViewport = current.viewport || viewport;
    const view = getChalkboardTextViewport(placementViewport);
    const width = previous?.width || Math.min(900, Math.max(160, view.width - 2 * view.margin - 28));
    let element = reflowChalkboardText({ type: "text", id: current.id, seed: current.seed,
      fontSize: 68, scale: 1, angle: 0, cx: current.worldX, cy: current.worldY, ...previous, ...message,
      font: current.font, color: current.color }, width);
    if (!current.adjusted) element.scale = Math.max(.3, Math.floor(Math.min(1,
      (view.width - 2 * view.margin) / (element.width + 28),
      (view.height - 2 * view.margin) / (getTextHeight(element) + 92)) * 1000) / 1000);
    if (!previous || !current.adjusted) {
      const limits = getChalkboardTextPlacementLimits(element, placementViewport);
      element.cx = Math.max(limits.minX, Math.min(limits.maxX, element.cx));
      element.cy = Math.max(limits.minY, Math.min(limits.maxY, element.cy));
      const placement = !previous && current.autoPlace ? findChalkboardTextPlacement(element, current.occupied, limits) : element;
      if (placement) Object.assign(element, { cx: placement.cx, cy: placement.cy });
    }
    element.cx = Math.round(Math.max(0, Math.min(CHALKBOARD_WORLD.width, element.cx)) * 10) / 10;
    element.cy = Math.round(Math.max(0, Math.min(CHALKBOARD_WORLD.height, element.cy)) * 10) / 10;
    element.width = Math.round(element.width * 10) / 10;
    replaceElements(previous ? elementsRef.current.map(value => value.id === current.id ? element : value)
      : [...elementsRef.current, element], { remember: false });
    setSelectedTextId(current.id);
    publishEntry(next);
    return element;
  }, [elementsRef, replaceElements, setSelectedTextId]);
  const updateStyle = React.useCallback(style => {
    const current = entryRef.current;
    if (!current) return;
    const font = fontCatalog.fonts.some(font => font.id === style.font) ? style.font : current.font;
    const color = normalizeChalkboardTextColor(style.color ?? current.color);
    const previous = elementsRef.current.find(element => element.id === current.id);
    if (previous) {
      const styled = { ...previous, font, color };
      // Changing typeface reflows the words within the existing width while
      // keeping the player's position, rotation and scale. Color needs no reflow.
      const element = font === previous.font ? styled : reflowChalkboardText(styled, previous.width);
      element.width = Math.round(element.width * 10) / 10;
      replaceElements(elementsRef.current.map(value => value.id === current.id ? element : value), { remember: false });
    }
    preferredStyle.current = { font, color };
    publishEntry({ ...current, font, color });
  }, [elementsRef, fontCatalog.fonts, replaceElements]);
  const finish = React.useCallback(() => {
    const current = entryRef.current;
    if (!current) return;
    const after = elementsRef.current;
    // Store the pre-composition snapshot once for the existing undo command.
    replaceElements(current.before, { remember: false });
    replaceElements(after);
    clear();
  }, [clear, elementsRef, replaceElements]);
  const cancel = React.useCallback(() => {
    const current = entryRef.current;
    if (!current) return;
    replaceElements(current.before, { remember: false });
    setSelectedTextId("");
    clear();
  }, [clear, replaceElements, setSelectedTextId]);
  return { entry, entryRef, begin, update, updateStyle, finish, cancel, clear };
}
