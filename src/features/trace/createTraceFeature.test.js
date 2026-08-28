import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createTraceFeature } from "./createTraceFeature.js";

function createTileElement() {
  const classes = new Set();
  const properties = new Map();
  return {
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      removeProperty: (name) => properties.delete(name),
      setProperty: (name, value) => properties.set(name, value),
    },
  };
}

test("trace satellite owns snapshots, imperative tile styles and cleanup", () => {
  const scope = createResourceScope("trace-test");
  const feature = createTraceFeature({ scope });
  const firstTile = createTileElement();
  const secondTile = createTileElement();
  let notifications = 0;
  feature.start();
  const unregisterFirst = feature.registerTraceTile(1, firstTile);
  feature.registerTraceTile(2, secondTile);
  const unsubscribe = feature.subscribe(() => {
    notifications += 1;
  });

  feature.setTraceState({ currentTiles: ["A", "B"], highlightPath: [1, 2] });
  assert.equal(notifications, 1);
  assert.equal(firstTile.classList.contains("tile-used"), true);
  assert.equal(secondTile.style.getPropertyValue("--trace-order"), "1");
  assert.equal(feature.isTraceTileHighlighted(2), true);
  assert.deepEqual(feature.getSnapshot(), {
    currentTiles: ["A", "B"],
    highlightPath: [1, 2],
  });

  feature.setTraceState({ currentTiles: ["A", "B"], highlightPath: [1, 2] });
  assert.equal(notifications, 1);
  unregisterFirst();
  assert.equal(firstTile.classList.contains("tile-used"), false);
  feature.clearTraceState();
  assert.equal(notifications, 2);
  assert.equal(secondTile.classList.contains("tile-used"), false);

  unsubscribe();
  feature.setTraceState({ currentTiles: ["C"], highlightPath: [2] });
  assert.equal(notifications, 2);
  scope.dispose();
  assert.deepEqual(feature.getSnapshot(), { currentTiles: [], highlightPath: [] });
  assert.equal(secondTile.classList.contains("tile-used"), false);
  assert.equal(feature.setTraceState({ currentTiles: ["D"], highlightPath: [2] }), false);
});
