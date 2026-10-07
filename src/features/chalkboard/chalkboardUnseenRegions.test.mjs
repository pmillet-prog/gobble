import assert from "node:assert/strict";
import test from "node:test";
import { getChalkboardUnseenRegions } from "./chalkboardUnseenRegions.js";

const entry = (id, minX, maxX) => ({ id, bounds: { minX, maxX } });
const view = { width: 400, height: 600, scrollLeft: 600, scale: .5 };

test("unread directions use world coordinates and only acknowledge a reached entry", () => {
  const left = entry("left", 400, 600), visible = entry("visible", 1500, 1800), right = entry("right", 1900, 2300);
  assert.deepEqual(getChalkboardUnseenRegions([left, visible, right], view), { left: true, right: true, visible: [visible] });
  const reached = getChalkboardUnseenRegions([right], { ...view, scrollLeft: 900 });
  assert.deepEqual(reached, { left: false, right: false, visible: [right] });
});

test("resizing and entries larger than the viewport still have a reachable zone", () => {
  const wide = entry("wide", 0, 24000);
  assert.equal(getChalkboardUnseenRegions([wide], view).right, true);
  assert.deepEqual(getChalkboardUnseenRegions([wide], { ...view, scrollLeft: 5900 }).visible, [wide]);
  assert.deepEqual(getChalkboardUnseenRegions([wide], { ...view, width: 24000, scale: 1, scrollLeft: 0 }).visible, [wide]);
});

test("an unmeasured viewport cannot mark a contribution as viewed", () => {
  const entries = [entry("near", 0, 1)];
  for (const viewport of [{ ...view, width: 1 }, { ...view, height: 1 }, { ...view, scale: 0 }]) {
    assert.deepEqual(getChalkboardUnseenRegions(entries, viewport).visible, []);
  }
});
