import assert from "node:assert/strict";
import test from "node:test";
import { computeHostedInterventionLayout, computeHostedInterventionPlacement, observeInterventionPlacement } from "./spriteInterventionPlacement.js";

test("desktop placement keeps readable, unscaled content inside the viewport, including near its edges", () => {
  const surface = { width: 509, height: 240 };
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 960, height: 540 },
    { width: 768, height: 432 },
  ]) {
    for (const width of [180, 280, 520, 650]) {
      for (const height of [70, 190, 400]) {
        const rect = { left: viewport.width * 0.55, top: 180, width, height };
        const placement = computeHostedInterventionPlacement(rect, viewport, surface);
        const bottom = viewport.height - placement.anchorBottom;
        assert.equal(placement.scale, 1);
        assert.ok(placement.anchorX - surface.width / 2 >= 8 - 1e-8);
        assert.ok(placement.anchorX + surface.width / 2 <= viewport.width - 8 + 1e-8);
        assert.ok(bottom - surface.height >= 8 - 1e-8);
        assert.ok(bottom <= viewport.height - 8 + 1e-8);
        if (rect.top + height - 6 >= surface.height + 8) {
          assert.ok(bottom <= rect.top + height - 6 + 1e-8, "leave the controls below the host accessible");
        }
      }
    }
  }
});

test("narrow columns give the bubble priority and reduce only the character", () => {
  const viewport = { width: 1920, height: 1080 };
  const config = { characterHeightPx: 190, frameAspectRatio: 5 / 6, bubbleMaxWidthPx: 340 };
  const rect = { left: 800, top: 220, width: 640, height: 500 };
  const wide = computeHostedInterventionLayout(rect, viewport, config);
  assert.equal(wide.stacked, false);
  assert.equal(wide.characterHeight, 190);
  assert.equal(wide.bubbleWidth, 340);
  const narrow = computeHostedInterventionLayout({ ...rect, width: 260 }, viewport, config);
  assert.equal(narrow.stacked, true);
  assert.equal(narrow.bubbleWidth, 248);
  assert.equal(narrow.characterHeight, 100);
  assert.equal(computeHostedInterventionLayout({ ...rect, width: 180 }, viewport, config).bubbleWidth, 240);
  assert.deepEqual(computeHostedInterventionLayout(rect, viewport, config), wide);
  const compact = computeHostedInterventionLayout(rect, viewport, config, wide.width, 100);
  assert.equal(compact.characterHeight, 100);
  assert.ok(compact.bubbleWidth > wide.bubbleWidth, "long messages can borrow width from the portrait");
});

test("zoomed and panned visual viewports bound expansion without changing text scale", () => {
  const viewport = { width: 480, height: 300, left: 120, top: 60, layoutHeight: 600 };
  const rect = { left: 700, top: 150, width: 260, height: 350 };
  const layout = computeHostedInterventionLayout(rect, viewport, {}, 1000);
  assert.equal(layout.width, 464);
  const surface = { width: layout.width, height: 240 };
  const placement = computeHostedInterventionPlacement(rect, viewport, surface);
  assert.equal(placement.scale, 1);
  assert.equal(placement.anchorX - surface.width / 2, 128);
  const bottom = viewport.layoutHeight - placement.anchorBottom;
  assert.ok(bottom <= 352);
  assert.ok(bottom - surface.height >= 68);
});

test("active placement batches resize/zoom events and releases every observer and queued frame", () => {
  const windowEvents = new Map();
  const visualEvents = new Map();
  const frames = new Map();
  const observed = new Set();
  let updates = 0;
  let resize;
  const viewport = {
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe(element) { observed.add(element); }
      disconnect() { observed.clear(); }
    },
    addEventListener: (name, callback) => windowEvents.set(name, callback),
    removeEventListener: (name) => windowEvents.delete(name),
    requestAnimationFrame: (callback) => { frames.set(1, callback); return 1; },
    cancelAnimationFrame: (id) => frames.delete(id),
    visualViewport: {
      addEventListener: (name, callback) => visualEvents.set(name, callback),
      removeEventListener: (name) => visualEvents.delete(name),
    },
  };
  const dispose = observeInterventionPlacement({ host: {}, surface: {}, update: () => updates++, viewport });
  assert.equal(observed.size, 2);
  resize();
  windowEvents.get("resize")();
  visualEvents.get("resize")();
  assert.equal(frames.size, 1);
  const frame = frames.get(1);
  frames.clear();
  frame();
  assert.equal(updates, 1);
  windowEvents.get("scroll")();
  dispose();
  assert.equal(frames.size, 0);
  assert.equal(windowEvents.size, 0);
  assert.equal(visualEvents.size, 0);
  assert.equal(observed.size, 0);
});
