import test from "node:test";
import assert from "node:assert/strict";
import { ChalkboardRenderer } from "./chalkboardRenderer.js";
import { ChalkboardTileCache, ChalkboardTileLayer } from "./chalkboardTileLayer.js";
import { getElementBounds } from "./chalkboardModel.js";

let arcs = 0;
let erasingCanvases = [];
function canvas() {
  const node = { width: 0, height: 0, style: {} };
  const context = new Proxy({ arc() { arcs++; } }, {
    get(target, key) { return target[key] || (() => {}); },
    set(target, key, value) {
      if (key === "globalCompositeOperation" && value === "destination-out") erasingCanvases.push(node);
      target[key] = value;
      return true;
    },
  });
  node.getContext = () => context;
  return node;
}
globalThis.document = { createElement: () => canvas() };
globalThis.window = { devicePixelRatio: 1 };
const view = { width: 800, height: 500, scale: .5, scrollLeft: 0 };
const stroke = (id, x = 40) => ({ id, type: "stroke", seed: 7, size: 11, color: "#f4f0df", points: [{ x, y: 50 }, { x: x + 12, y: 60 }] });
const group = element => ({ id: element.id, elements: [element], bounds: getElementBounds(element) });

test("repeated snapshot notifications retain the same erasure preview and cached pixels", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const source = [{ ...group(stroke("own")), canErase: true }];
  const draftElements = [{ type: "erase", id: "mask", size: 30, points: [{ x: 40, y: 50 }], targetIds: ["own"] }];
  renderer.setInterventions(source, 1, "week");
  renderer.render({ ...view, draftElements });
  const record = renderer.records.get("own").group;
  arcs = 0;
  renderer.setInterventions(source, 1, "week");
  renderer.render({ ...view, draftElements });
  assert.equal(renderer.records.get("own").group, record);
  assert.equal(arcs, 0);
  renderer.destroy();
});

test("unchanged poll responses and offscreen publications retain the visible raster", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const first = group(stroke("first"));
  renderer.setInterventions([first], 1, "free:week-1");
  renderer.render(view);
  const before = renderer.published.getTile(0, 0);
  arcs = 0;
  renderer.setInterventions([JSON.parse(JSON.stringify(first)), group(stroke("distant", 8000))], 2, "free:week-1");
  renderer.render(view);
  assert.equal(renderer.published.getTile(0, 0), before);
  assert.equal(arcs, 0);
  renderer.setInterventions([first], 3, "free:week-2");
  renderer.render(view);
  assert.notEqual(renderer.published.getTile(0, 0), before);
  assert.ok(arcs > 0);
  renderer.destroy();
  assert.equal(renderer.tileCache.entries.size, 0);
});

test("an appended draft segment paints only that segment, without copying earlier points", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const element = stroke("draft");
  renderer.render({ ...view, draftElements: [element] });
  element.points.push({ x: 64, y: 70 });
  arcs = 0;
  renderer.render({ ...view, draftElements: [element] });
  const incremental = arcs;
  arcs = 0;
  new ChalkboardRenderer(canvas()).render({ ...view, draftElements: [element] });
  assert.equal(arcs, incremental * 2);
  arcs = 0;
  renderer.render({ ...view, draftElements: [element] });
  assert.equal(arcs, 0);
  renderer.destroy();
});

test("a confirmed draft is reused, while changed server geometry is rejected", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const original = group(stroke("existing"));
  const draftElement = stroke("draft", 100);
  renderer.setInterventions([original], 1, "free:week");
  renderer.render({ ...view, draftElements: [draftElement] });
  const captured = renderer.captureDraft([draftElement]);
  const published = group(JSON.parse(JSON.stringify(draftElement)));
  published.id = "server-id";
  arcs = 0;
  assert.equal(renderer.reuseDraftForIntervention(published, captured), true);
  renderer.setInterventions([original, published], 2, "free:week");
  renderer.render(view);
  assert.equal(arcs, 0);
  published.elements[0].points[1].x++;
  assert.equal(renderer.reuseDraftForIntervention(published, captured), false);
  renderer.destroy();
});

test("moving a selected text keeps the stroke layers on both sides cached", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const label = { id: "text", type: "text", seed: 8, text: "Craie", cx: 90, cy: 80, fontSize: 68, width: 180, scale: 1, angle: 0 };
  const first = stroke("first");
  const last = stroke("last", 200);
  renderer.render({ ...view, draftElements: [first, label, last], selectedTextId: label.id });
  arcs = 0;
  renderer.render({ ...view, draftElements: [first, { ...label, cx: 130 }, last], selectedTextId: label.id });
  // The three circular selection handles are the only arcs drawn.
  assert.equal(arcs, 3);
  arcs = 0;
  renderer.render({ ...view, draftElements: [first, { ...label, cx: 130 }, last] });
  assert.equal(arcs, 0);
  renderer.destroy();
});

test("a text style change cannot reuse a bitmap rendered with another typeface or color", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const label = { id: "text", type: "text", seed: 8, text: "CRAIE", font: "chalk", cx: 300, cy: 300, fontSize: 68, width: 300, scale: 1, angle: 0 };
  renderer.render({ ...view, draftElements: [label] });
  const captured = renderer.captureDraft([label]);
  assert.equal(renderer.reuseDraftForIntervention(group(label), captured), true);
  assert.equal(renderer.reuseDraftForIntervention(group({ ...label, font: "white-chalk" }), captured), false);
  assert.equal(renderer.reuseDraftForIntervention(group({ ...label, color: "#81d4fa" }), captured), false);
  assert.equal(renderer.reuseDraftForIntervention(group({ ...label, color: "#F5F2E8" }), captured), true);
  renderer.destroy();
});

test("undo restores a completed drawing checkpoint without redrawing chalk particles", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const first = stroke("first");
  const second = stroke("second", 100);
  renderer.render({ ...view, draftElements: [first] });
  renderer.render({ ...view, draftElements: [first, second] });
  arcs = 0;
  renderer.render({ ...view, draftElements: [first] });
  assert.equal(arcs, 0);
  renderer.destroy();
});

test("publication reuses multiline chalk only when the line layout is unchanged", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const label = { id: "text", type: "text", seed: 8, text: "UN MOT SUR LE TABLEAU", lineBreaks: [11], font: "chalk", cx: 300, cy: 300, fontSize: 68, width: 500, scale: 1, angle: 0 };
  renderer.setInterventions([], 1, "free:week");
  renderer.render({ ...view, draftElements: [label], selectedTextId: label.id });
  const captured = renderer.captureDraft([label], label.id);
  assert.equal(renderer.reuseDraftForIntervention(group(structuredClone(label)), captured), true);
  assert.equal(renderer.reuseDraftForIntervention(group({ ...label, lineBreaks: [7] }), captured), false);
  renderer.destroy();
});

test("all tile layers share a bounded raster budget and deleted elements release their tiles", () => {
  const cache = new ChalkboardTileCache(3);
  const first = new ChalkboardTileLayer(cache, "one");
  const second = new ChalkboardTileLayer(cache, "two");
  first.setElements([stroke("a"), stroke("b", 600)]);
  second.setElements([stroke("c"), stroke("d", 600)]);
  first.getTile(0, 0);
  first.getTile(1, 0);
  second.getTile(0, 0);
  second.getTile(1, 0);
  assert.equal(cache.entries.size, 3);
  first.setElements([]);
  assert.equal(cache.entries.size, 2);
  second.clear();
  assert.equal(cache.entries.size, 0);
});

test("published masks erase on a separate contribution tile and undo restores the original group", () => {
  const display = canvas();
  const renderer = new ChalkboardRenderer(display);
  const mine = { ...group(stroke("mine")), canErase: true };
  const other = { ...group(stroke("other")), canErase: false };
  const mask = { id: "sponge", type: "erase", size: 60, points: [{ x: 50, y: 50 }], targetIds: [mine.id] };
  renderer.setInterventions([other, mine], 1, "free:week");
  erasingCanvases = [];
  renderer.render({ ...view, draftElements: [mask] });
  assert.ok(erasingCanvases.includes(renderer.erasureTile));
  assert.ok(!erasingCanvases.includes(display));
  assert.ok(!erasingCanvases.includes(renderer.published.getTile(0, 0)));
  assert.equal(renderer.records.get(other.id).group.items.length, 1);
  assert.equal(renderer.records.get(mine.id).group.items.length, 2);
  renderer.render(view);
  assert.equal(renderer.records.get(mine.id).group.items.length, 1);
  const scratch = renderer.erasureTile;
  renderer.destroy();
  assert.equal(scratch.width, 0);
  assert.equal(renderer.records.size, 0);
  assert.equal(renderer.tileCache.entries.size, 0);
});

test("draft erasures compose text and strokes together while retaining drawing-after-erasing order", () => {
  const renderer = new ChalkboardRenderer(canvas());
  const label = { id: "text", type: "text", seed: 8, text: "CRAIE", font: "chalk", cx: 90, cy: 80, fontSize: 68, width: 180, scale: 1, angle: 0 };
  const mask = { id: "sponge", type: "erase", size: 60, points: [{ x: 50, y: 50 }], targetIds: [] };
  renderer.render({ ...view, draftElements: [stroke("first"), label, mask, stroke("last")], selectedTextId: label.id });
  assert.deepEqual(renderer.draftBefore.index.get("0:0").map(entry => entry.element.type), ["stroke", "text", "erase", "stroke"]);
  assert.equal(renderer.draftSelected.index.size, 0);
  assert.equal(renderer.draftAfter.index.size, 0);
  renderer.destroy();
});
