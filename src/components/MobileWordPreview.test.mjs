import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const bundle = buildSync({
  stdin: {
    contents: `
      export { default as MobileWordPreview } from "./MobileWordPreview.jsx";
      export { ApplicationRuntimeProvider } from "../app/react/ApplicationRuntimeProvider.jsx";
      export { TraceRuntimeProvider } from "../features/trace/TraceRuntime.jsx";
      export { createTraceFeature } from "../features/trace/createTraceFeature.js";
      export { createResourceScope } from "../app/core/createResourceScope.js";
    `,
    resolveDir: dirname(fileURLToPath(import.meta.url)),
  },
  bundle: true,
  format: "cjs",
  packages: "external",
  platform: "node",
  write: false,
});
const bundledModule = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  require,
  bundledModule,
  bundledModule.exports
);
const {
  ApplicationRuntimeProvider,
  MobileWordPreview,
  TraceRuntimeProvider,
  createResourceScope,
  createTraceFeature,
} = bundledModule.exports;

function createPreviewHarness(t, overrides = {}) {
  const scope = createResourceScope("mobile-preview-test");
  const trace = createTraceFeature({ scope });
  trace.start();
  t.after(() => scope.dispose());
  const progressState = {
    foundWordsCount: 0,
    score: 0,
    statusText: "INVALIDE",
    inputShake: false,
  };
  const progress = {
    store: {
      getState: () => progressState,
      subscribe: () => () => {},
    },
  };
  const kernel = {
    features: {
      prepare: (name) => {
        assert.ok(name === "trace" || name === "progress");
        return name === "trace" ? trace : progress;
      },
    },
  };
  const props = {
    countdownLines: [],
    liveWord: "ZQX",
    liveWordTiles: ["Z", "Q", "X"],
    phase: "playing",
    previewBlockHeight: 52,
    previewGapPx: 2,
    previewTileBaseStyle: {},
    traceBoard: [{ letter: "Z" }, { letter: "Q" }, { letter: "X" }],
    ...overrides,
  };
  const render = () => renderToStaticMarkup(
    React.createElement(
      ApplicationRuntimeProvider,
      { kernel },
      React.createElement(
        TraceRuntimeProvider,
        null,
        React.createElement(MobileWordPreview, props)
      )
    )
  );
  return { render, trace };
}

test("mobile preview clears a rejected trace even when parent word props remain stale", (t) => {
  const { render, trace } = createPreviewHarness(t);
  trace.setTraceState({ currentTiles: ["Z", "Q", "X"], highlightPath: [0, 1, 2] });
  const active = render();
  assert.equal((active.match(/class="preview-tile"/g) || []).length, 3);
  assert.match(active, />Z<\/div>/);

  trace.clearTraceState();
  const cleared = render();
  assert.doesNotMatch(cleared, /class="preview-tile"/);
  assert.match(cleared, />INVALIDE<\/span>/);
});

test("mobile preview uses keyboard tiles without a grid path and clears them after rejection", (t) => {
  const { render, trace } = createPreviewHarness(t);
  trace.setTraceState({ currentTiles: ["A", "B"], highlightPath: [] });
  const active = render();
  assert.equal((active.match(/class="preview-tile"/g) || []).length, 2);
  assert.match(active, />A<\/div>/);
  assert.match(active, />B<\/div>/);
  assert.doesNotMatch(active, />Z<\/div>/);

  trace.clearTraceState();
  assert.doesNotMatch(render(), /class="preview-tile"/);
});

test("mobile preview preserves composite labels and multiletter tiles from the live path", (t) => {
  const { render, trace } = createPreviewHarness(t, {
    traceBoard: [{ letter: "QU" }, { letter: "A", altLetter: "E" }],
    getTraceCellLabel: (cell) => cell.altLetter
      ? `${cell.letter}/${cell.altLetter}`
      : cell.letter,
  });
  trace.setTraceState({ currentTiles: ["Q", "A"], highlightPath: [0, 1] });
  const active = render();
  assert.equal((active.match(/class="preview-tile"/g) || []).length, 2);
  assert.match(active, />QU<\/div>/);
  assert.match(active, />A\/E<\/div>/);
  assert.doesNotMatch(active, />Z<\/div>/);
});
