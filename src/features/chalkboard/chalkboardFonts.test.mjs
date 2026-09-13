import test from "node:test";
import assert from "node:assert/strict";
import { chalkboardCanvasFont, pickChalkboardFont, loadChalkboardFont } from "./chalkboardFonts.js";

test("random choice includes newly supplied faces and leaves the catalog unchanged", () => {
  const fonts = Object.freeze(["chalk", "white-chalk", "nouvelle-craie"].map(id => Object.freeze({ id })));
  assert.equal(pickChalkboardFont(fonts, () => 0), "chalk");
  assert.equal(pickChalkboardFont(fonts, () => 0.5), "white-chalk");
  assert.equal(pickChalkboardFont(fonts, () => 0.99), "nouvelle-craie");
  assert.match(chalkboardCanvasFont("nouvelle-craie", 68), /^400 68px "GobbleChalk_nouvelle-craie"/);
  assert.match(chalkboardCanvasFont(undefined, 68), /GobbleCaveat/);
});

test("a failed font can be retried and a loaded face is shared across board visits", async () => {
  const previousFace = globalThis.FontFace;
  const previousDocument = globalThis.document;
  let attempts = 0;
  const registered = [];
  globalThis.document = { fonts: { add(face) { registered.push(face); } } };
  globalThis.FontFace = class {
    constructor(family, source) { this.family = family; this.source = source; }
    load() { return ++attempts === 1 ? Promise.reject(new Error("bad download")) : Promise.resolve(this); }
  };
  try {
    const font = { id: "test-craie", src: "/chalkfont/test-craie.woff2" };
    await assert.rejects(loadChalkboardFont(font), /bad download/);
    const pending = loadChalkboardFont(font);
    assert.strictEqual(loadChalkboardFont(font), pending);
    assert.equal(await pending, font);
    assert.equal(attempts, 2);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].family, "GobbleChalk_test-craie");
    await assert.rejects(loadChalkboardFont({ id: "remote", src: "https://example.test/remote.woff" }), /invalid_chalkboard_font/);
  } finally {
    if (previousFace === undefined) delete globalThis.FontFace; else globalThis.FontFace = previousFace;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});
