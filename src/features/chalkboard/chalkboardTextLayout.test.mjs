import test from "node:test";
import assert from "node:assert/strict";
import { getChalkboardTextLines, normalizeChalkboardLineBreaks } from "../../../shared/chalkboardText.js";
import { layoutChalkboardText, getChalkboardTextPlacementLimits, reflowChalkboardText } from "./chalkboardTextLayout.js";
import { normalizeChalkboardMessage, getChalkboardEditableText, resizeChalkboardTextWidth } from "./chalkboardTextDraft.js";
import { findChalkboardTextPlacement } from "./chalkboardTextPlacement.js";
import { getElementBounds, getTextHandles, getTextHeight, hitTestIntervention, hitTestTextHandle, localToWorld } from "./chalkboardModel.js";
import { paintChalkboardTextLines } from "./chalkboardPaint.js";
import { createChalkboardService } from "../../../server/chalkboard/chalkboardService.js";

const paragraph = "BONJOUR A TOUS ET BONNE PARTIE SUR LE GRAND TABLEAU. UN PETIT MESSAGE POUR VOUS SOUHAITER UNE BELLE JOURNEE. ".repeat(3).slice(0, 280).trim();
const measure = text => [...text].reduce((sum, letter) => sum + (letter === "W" ? 64 : letter === "I" ? 15 : 35), 0);
const makeElement = (text, viewport) => ({ type: "text", id: "paragraph", seed: 7,
  ...layoutChalkboardText(text, "chalk", viewport, measure), cx: 600, cy: 500, angle: 0 });

test("paragraphs wrap at word boundaries with measured, uncompressed line widths", () => {
  const element = makeElement(paragraph, { width: 1280, height: 650 });
  const lines = getChalkboardTextLines(element);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" "), paragraph);
  assert.ok(lines.every(line => line.length <= 32 && measure(line) < element.width));
  const calls = [];
  paintChalkboardTextLines({ fillText: (...args) => calls.push(args) }, element);
  assert.deepEqual(calls.map(args => args[0]), lines);
  assert.ok(calls.every(args => args.length === 3), "no canvas maxWidth that can squeeze glyphs");
  assert.ok(calls.at(-1)[2] > calls[0][2]);
});

test("280 characters without spaces and Unicode pairs are preserved across wrapping", () => {
  for (const text of ["W".repeat(280), "AB😀CD".repeat(40)]) {
    const element = makeElement(text, { width: 320, height: 380 });
    const lines = getChalkboardTextLines(element);
    assert.ok(lines.length > 1);
    assert.equal(lines.join(""), text);
    assert.ok(lines.every(line => measure(line) <= 1500 && [...line].length > 1 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(line)));
  }
});

test("initial placement keeps the entire paragraph and both handles in the viewport, including board edges", () => {
  for (const [width, height] of [[1280, 650], [800, 330], [320, 380], [360, 200], [568, 130], [209, 300]]) {
    const viewport = { width, height };
    const viewScale = height / 1000;
    for (const text of ["BONJOUR", paragraph, "W".repeat(280)]) {
      for (const cy of [0, 500, 1000]) {
        const element = { ...makeElement(text, viewport), cx: 0, cy };
        const limits = getChalkboardTextPlacementLimits(element, viewport);
        const position = findChalkboardTextPlacement(element, [], limits);
        assert.ok(position, JSON.stringify({ width, height, text, limits }));
        Object.assign(element, position);
        const scrollLeft = Math.max(0, element.cx * viewScale - width / 2);
        const bounds = getElementBounds(element);
        assert.ok(bounds.minY >= 0 && bounds.maxY <= 1000);
        assert.ok(bounds.minX * viewScale >= scrollLeft && bounds.maxX * viewScale <= scrollLeft + width);
        const handles = getTextHandles(element);
        const radius = Math.max(8, Math.min(13, 10 * viewScale)) + 1;
        for (const point of [handles.rotate, handles.scale, handles.width]) {
          const x = point.x * viewScale - scrollLeft, y = point.y * viewScale;
          assert.ok(x >= radius && x <= width - radius && y >= radius && y <= height - radius,
            JSON.stringify({ width, height, x, y, radius }));
        }
      }
    }
  }
});

test("ordinary long words never lose their final letter to the next line", () => {
  for (const text of ["ANTICONSTITUTIONNELLEMENT", "BONJOUR EXTRAORDINAIREMENT A TOUS", "LES JOUEURS SE RECONNECTENT"]) {
    const element = makeElement(text, { width: 320, height: 380 });
    const narrow = reflowChalkboardText(element, 180, measure);
    assert.equal(getChalkboardTextLines(element).join(" "), text);
    assert.equal(getChalkboardTextLines(narrow).join(" "), text);
  }
});

test("horizontal resizing reflows whole words in rotated local coordinates without stretching glyphs", () => {
  const original = { ...makeElement("BONJOUR A TOUS LES JOUEURS DU TABLEAU", { width: 1280, height: 650 }), angle: .7, scale: .8 };
  const wide = resizeChalkboardTextWidth(original, localToWorld(original, 764, 0), measure);
  const narrow = resizeChalkboardTextWidth(original, localToWorld(original, 214, 0), measure);
  assert.ok(getChalkboardTextLines(narrow).length > getChalkboardTextLines(wide).length);
  for (const value of [wide, narrow]) {
    for (const key of ["cx", "cy", "fontSize", "font", "scale", "angle"]) assert.equal(value[key], original[key], key);
    assert.equal(getChalkboardTextLines(value).join(" "), original.text);
  }
});

test("small-screen touch targets distinguish width, scale and rotation even when their hit areas overlap", () => {
  for (const scale of [.3, .5, 1]) for (const angle of [0, .7]) {
    const element = { ...makeElement("BONJOUR", { width: 320, height: 380 }), scale, angle };
    const handles = getTextHandles(element);
    for (const kind of ["rotate", "scale", "width"]) assert.equal(hitTestTextHandle(element, handles[kind], 24 / scale), kind);
  }
});

test("typed paragraph breaks survive resizing, publication and re-editing", () => {
  const raw = "Bonjour à tous\nÀ bientôt sur le tableau !";
  const message = normalizeChalkboardMessage(raw);
  const element = reflowChalkboardText({ ...makeElement(message.text, { width: 1280, height: 650 }), ...message }, 500, measure);
  const service = createChalkboardService();
  const stored = service.addIntervention("free", { elements: [element] }, { userId: 17 }).intervention.elements[0];
  assert.deepEqual(stored.lineBreaks, element.lineBreaks);
  assert.deepEqual(stored.paragraphBreaks, element.paragraphBreaks);
  const wider = reflowChalkboardText(stored, 1600, measure);
  assert.deepEqual(getChalkboardTextLines(wider), ["BONJOUR A TOUS", "A BIENTOT SUR LE TABLEAU !"]);
  assert.equal(getChalkboardEditableText(wider), "BONJOUR A TOUS\nA BIENTOT SUR LE TABLEAU !");
});

test("publication and deletion undo preserve all lines and their lower-line hit area", () => {
  const service = createChalkboardService();
  const moderator = { userId: 17 };
  const element = makeElement(paragraph, { width: 1280, height: 650 });
  const published = service.addIntervention("free", { elements: [element] }, moderator).intervention;
  // Compare the same caller's view before and after undo (canErase is private
  // to the owner; an anonymous snapshot deliberately has a different flag).
  const restored = JSON.parse(JSON.stringify(service.getSnapshot("free", moderator))).interventions[0];
  const stored = restored.elements[0];
  assert.equal(stored.text, paragraph);
  assert.deepEqual(stored.lineBreaks, element.lineBreaks);
  const bottomLine = stored.cy + getTextHeight(stored) * stored.scale / 2 - stored.fontSize * stored.scale / 2;
  assert.ok(bottomLine > stored.cy + stored.fontSize);
  assert.equal(hitTestIntervention(restored, stored.cx, bottomLine), true);
  const textBottom = stored.cy + getTextHeight(stored) * stored.scale / 2;
  assert.ok(restored.bounds.maxY >= Math.min(1000, textBottom));
  service.deleteIntervention(published.id, moderator);
  assert.deepEqual(service.undoLastDeletion("free", moderator).intervention, restored);
});

test("invalid line offsets cannot create empty lines, split surrogate pairs or drop text", () => {
  for (const value of [[0], [9], [3, 2], [3, 3], [2.5], ["3"], [-1], [2, 3]]) {
    assert.deepEqual(normalizeChalkboardLineBreaks("AA B C", value), []);
  }
  assert.deepEqual(normalizeChalkboardLineBreaks("A😀B", [2]), []);
  assert.deepEqual(normalizeChalkboardLineBreaks("AA BB CC", [3, 6]), [3, 6]);
});

test("legacy messages keep their original single-line height", () => {
  assert.equal(getTextHeight({ text: "OLD MESSAGE", fontSize: 68 }), 68 * 1.32);
});
