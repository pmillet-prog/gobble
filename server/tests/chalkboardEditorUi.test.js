import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";
import { createCanvas } from "@napi-rs/canvas";

test("live text composition preserves native input, previews, transforms and one-step undo", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const previousDocument = globalThis.document;
  try {
    const [{ default: useTextEntry }, { default: Composer }] = await Promise.all([
      vite.ssrLoadModule("/src/features/chalkboard/useChalkboardTextEntry.js"),
      vite.ssrLoadModule("/src/features/chalkboard/ChalkboardTextComposer.jsx"),
    ]);
    const fonts = [{ id: "chalk" }, { id: "white-chalk" }];
    const markup = renderToString(React.createElement(Composer, { text: "Bonjour à tous\nÀ bientôt", font: "white-chalk", color: "#81d4fa", fonts, fontsReady: true }));
    assert.match(markup, /<textarea/);
    assert.match(markup, /spellcheck="true"/);
    assert.match(markup, /autoCorrect="on"/);
    assert.match(markup, /lang="fr"/);
    assert.match(markup, /Bonjour à tous\nÀ bientôt/);
    assert.doesNotMatch(markup, /<dialog|<input[^>]*type="text"/);
    assert.match(markup, /aria-label="Couleur du texte"[^>]*value="#81d4fa"/);
    assert.match(markup, /<option[^>]*value="white-chalk"[^>]*selected/);
    globalThis.document = { createElement: () => createCanvas(1, 1) };
    const existing = { id: "existing", type: "stroke", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    const initial = [existing], elementsRef = { current: initial }, history = [];
    let editor, selected;
    function Harness() {
      editor = useTextEntry({ fontCatalog: { ready: true, fonts }, elementsRef,
        setLimitReached: () => assert.fail("unexpected limit"), setSelectedTextId: id => { selected = id; },
        replaceElements: (next, { remember = true } = {}) => { if (remember) history.push(elementsRef.current); elementsRef.current = next; },
      });
      return null;
    }
    renderToString(React.createElement(Harness));
    const viewport = { width: 360, height: 260, scale: .26 };
    editor.begin({ worldX: 700, worldY: 60, viewport });
    editor.updateStyle({ font: "chalk", color: "#81D4FA" });
    editor.update("Bonjour à tous", viewport);
    const first = elementsRef.current.at(-1);
    assert.equal(first.text, "BONJOUR A TOUS");
    assert.equal(first.color, "#81d4fa");
    assert.equal(first.font, "chalk");
    assert.equal(selected, first.id, "handles are selected as soon as the preview appears");
    editor.update("Bonjour à tous", { width: 360, height: 90, scale: .09 });
    const withKeyboard = elementsRef.current.at(-1);
    for (const key of ["cx", "cy", "width", "scale"]) assert.equal(withKeyboard[key], first[key], `keyboard preserves draft ${key}`);
    editor.update("Bonjour à tous\nÀ bientôt", viewport);
    assert.equal(elementsRef.current.length, 2, "typing changes the same preview instead of appending messages");
    assert.equal(elementsRef.current.at(-1).seed, first.seed);
    assert.ok(elementsRef.current.at(-1).paragraphBreaks.length);
    assert.equal(history.length, 0, "typing does not fill the gesture undo history");
    assert.equal(editor.entryRef.current.rawText, "Bonjour à tous\nÀ bientôt");
    // The board's gesture commit replaces the immutable element; further typing
    // must keep that placement and size instead of recreating the original one.
    elementsRef.current = [existing, { ...elementsRef.current.at(-1), cx: 800, angle: .5, scale: .6, width: 1200 }];
    editor.entryRef.current.adjusted = true;
    editor.updateStyle({ font: "white-chalk", color: "#f28b82" });
    assert.equal(editor.entryRef.current.rawText, "Bonjour à tous\nÀ bientôt");
    assert.equal(elementsRef.current.at(-1).cx, 800);
    assert.equal(elementsRef.current.at(-1).angle, .5);
    assert.equal(elementsRef.current.at(-1).scale, .6);
    assert.equal(history.length, 0, "style changes are part of the cancellable composition");
    editor.update("Bonjour à tous\nÀ très bientôt", viewport);
    const adjusted = elementsRef.current.at(-1);
    assert.equal(adjusted.cx, 800); assert.equal(adjusted.angle, .5); assert.equal(adjusted.scale, .6); assert.equal(adjusted.width, 1200);
    assert.equal(adjusted.color, "#f28b82"); assert.equal(adjusted.font, "white-chalk");
    assert.equal(adjusted.seed, first.seed, "changing style keeps the same chalk grain seed");
    editor.finish();
    assert.equal(editor.entryRef.current, null);
    assert.equal(history.length, 1); assert.equal(history[0], initial);
    const confirmed = elementsRef.current;
    editor.begin({ element: adjusted, viewport, worldX: 800, worldY: adjusted.cy });
    assert.equal(editor.entryRef.current.color, adjusted.color);
    assert.equal(editor.entryRef.current.font, adjusted.font);
    editor.updateStyle({ font: "unavailable-font" });
    assert.equal(elementsRef.current.at(-1).font, adjusted.font);
    editor.updateStyle({ font: "chalk", color: "#a5d6a7" });
    editor.update("Un remplacement provisoire", viewport);
    editor.cancel();
    assert.equal(elementsRef.current, confirmed, "cancel restores the exact draft before reopening its text");
    assert.equal(history.length, 1);
    assert.equal(elementsRef.current[0], existing);
    editor.begin({ viewport, worldX: 1000, worldY: 500 });
    editor.update("Encore un message", viewport);
    assert.equal(elementsRef.current.at(-1).font, "chalk", "new messages reuse the last chosen typeface");
    assert.equal(elementsRef.current.at(-1).color, "#a5d6a7");
    editor.cancel();
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    await vite.close();
  }
});
