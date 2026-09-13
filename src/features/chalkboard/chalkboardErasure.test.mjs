import test from "node:test";
import assert from "node:assert/strict";
import { ChalkboardErasurePreview } from "./chalkboardErasurePreview.js";
import { appendEraserGesture, createEraserGesture } from "./chalkboardEraserGesture.js";
import { chalkboardInkArea, collectChalkboardErasureCleanup, isChalkboardDust } from "./chalkboardErasureCleanup.js";
import { TILE_RASTER_RATIO } from "./chalkboardTileLayer.js";
import { CHALKBOARD_ERASER } from "../../../shared/chalkboardErasure.js";
import { drawChalkElement } from "./chalkboardPaint.js";

const entry = (id, canErase, x = 0) => ({ id, canErase, elements: [], bounds: { minX: x, minY: 0, maxX: x + 100, maxY: 100 } });

test("the sponge picks only the author's intersecting contributions, including between fast pointer samples", () => {
  const own = entry("mine", true, 400), other = entry("other", false, 400);
  const gesture = createEraserGesture(0, 50, 40, [own, other, entry("distant", true, 2000)]);
  assert.deepEqual(gesture.masks[0].targetIds, []);
  appendEraserGesture(gesture, 1000, 50);
  assert.deepEqual(gesture.masks[0].targetIds, [own.id]);
  assert.deepEqual(gesture.masks[0].points, [{ x: 0, y: 50 }, { x: 1000, y: 50 }]);
});

test("long sponge gestures split without dropping the connecting segment", () => {
  const gesture = createEraserGesture(0, 50, 40, []);
  for (let index = 1; index <= CHALKBOARD_ERASER.maxPoints; index++) appendEraserGesture(gesture, index * 2, 50);
  assert.equal(gesture.masks.length, 2);
  assert.equal(gesture.masks[0].points.length, CHALKBOARD_ERASER.maxPoints);
  assert.deepEqual(gesture.masks[1].points[0], gesture.masks[0].points.at(-1));
});

test("preview preserves author isolation, caches unchanged targets and reverses completely on undo", () => {
  const original = [entry("mine", true), entry("other", false)];
  const mask = { type: "erase", id: "eraser", size: 40, targetIds: ["mine", "other"], points: [{ x: 50, y: 50 }] };
  const preview = new ChalkboardErasurePreview();
  const first = preview.apply(original, [mask]);
  assert.equal(first[0].elements.at(-1), mask);
  assert.equal(first[1], original[1]);
  assert.equal(preview.apply(original, [mask])[0], first[0]);
  mask.points.push({ x: 80, y: 50 });
  assert.notEqual(preview.apply(original, [mask])[0], first[0]);
  assert.equal(preview.apply(original, []), original);
  assert.equal(original[0].elements.length, 0);
  assert.equal(preview.records.size, 0);
});

test("dust detection tolerates scattered chalk pixels but preserves small deliberate contributions", () => {
  assert.equal(isChalkboardDust(0, 100), true);
  assert.equal(isChalkboardDust(20, 10000), true);
  assert.equal(isChalkboardDust(33, 10000), false);
  assert.equal(isChalkboardDust(20, 30), false);
  assert.equal(isChalkboardDust(0, 0), false);
  const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 128, 0, 0, 0, 0]);
  assert.equal(chalkboardInkArea(data), (255 + 128) / (255 * TILE_RASTER_RATIO ** 2));
});

test("sponge painting uses an opaque round mask, supports a single dab, and restores compositing", () => {
  const calls = [];
  const context = {
    globalCompositeOperation: "source-over", globalAlpha: .5,
    save() { this.saved = { globalCompositeOperation: this.globalCompositeOperation, globalAlpha: this.globalAlpha }; },
    restore() { Object.assign(this, this.saved); },
    beginPath() {}, arc(...args) { calls.push(["arc", ...args]); },
    fill() { calls.push(["fill", this.globalCompositeOperation, this.globalAlpha]); },
    moveTo(...args) { calls.push(["move", ...args]); }, lineTo(...args) { calls.push(["line", ...args]); },
    stroke() { calls.push(["stroke", this.globalCompositeOperation, this.lineWidth, this.lineCap]); },
  };
  const mask = { type: "erase", size: 40, points: [{ x: 550, y: 50 }] };
  drawChalkElement(context, mask, 512, 0);
  assert.deepEqual(calls[0], ["arc", 38, 50, 20, 0, Math.PI * 2]);
  assert.deepEqual(calls[1], ["fill", "destination-out", 1]);
  mask.points.push({ x: 590, y: 50 });
  drawChalkElement(context, mask, 512, 0);
  assert.deepEqual(calls.at(-1), ["stroke", "destination-out", 40, "round"]);
  assert.equal(context.globalCompositeOperation, "source-over");
  assert.equal(context.globalAlpha, .5);
});

test("cleanup measures complete contributions, preserves visible ink and unknown fonts, and releases its scratch raster", async () => {
  const oldDocument = globalThis.document, oldFrame = globalThis.requestAnimationFrame;
  const canvases = [];
  const reads = [];
  let readCount = 0;
  globalThis.requestAnimationFrame = callback => { callback(); return 1; };
  globalThis.document = { createElement: () => {
    const context = new Proxy({
      getImageData() {
        readCount++;
        const pixels = reads.shift();
        assert.ok(pixels, "every raster read must have a supplied ink measurement");
        return { data: pixels };
      },
    }, { get: (target, key) => target[key] || (() => {}) });
    const node = { width: 0, height: 0, getContext: () => context };
    canvases.push(node);
    return node;
  } };
  const drawing = { type: "stroke", id: "drawing", seed: 4, color: "#ffffff", size: 10, points: [{ x: 30, y: 30 }, { x: 40, y: 30 }] };
  const mine = { ...entry("mine", true), elements: [drawing] };
  const mask = { id: "erase", type: "erase", size: 100, points: [{ x: 30, y: 30 }], targetIds: [mine.id] };
  const ink = new Uint8ClampedArray(400).fill(255);
  try {
    reads.push(new Uint8ClampedArray(400), ink);
    const erased = await collectChalkboardErasureCleanup([mine], [mask]);
    assert.deepEqual(erased, { removeIds: [mine.id], draftEmpty: true });
    assert.equal(readCount, 2);
    reads.push(ink);
    assert.deepEqual(await collectChalkboardErasureCleanup([mine], [mask]), { removeIds: [], draftEmpty: true });
    assert.equal(readCount, 3, "visible ink stops scanning before rendering the original again");
    const unknownFont = { ...mine, elements: [{ type: "text", font: "unloaded-font" }] };
    assert.deepEqual(await collectChalkboardErasureCleanup([unknownFont], [mask]), { removeIds: [], draftEmpty: true });
    assert.equal(readCount, 3);
    assert.ok(canvases.every(node => node.width === 0 && node.height === 0));
  } finally {
    globalThis.document = oldDocument;
    globalThis.requestAnimationFrame = oldFrame;
  }
});
