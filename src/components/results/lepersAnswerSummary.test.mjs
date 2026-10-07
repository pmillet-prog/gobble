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
      export { default as LepersAnswerSummary } from "./LepersAnswerSummary.jsx";
      export { default as DefinitionOverlays } from "../definition/DefinitionOverlays.jsx";
    `,
    resolveDir: dirname(fileURLToPath(import.meta.url)),
  },
  bundle: true,
  format: "cjs",
  packages: "external",
  preserveSymlinks: true,
  platform: "node",
  write: false,
});
const bundledModule = { exports: {} };
const portalRequire = (name) => name === "react-dom"
  ? { ...require(name), createPortal: (children) => children }
  : require(name);
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  portalRequire,
  bundledModule,
  bundledModule.exports,
);
const { LepersAnswerSummary, DefinitionOverlays } = bundledModule.exports;

function renderDefinition(t, overrides = {}) {
  const previousDocument = globalThis.document;
  globalThis.document = { body: {} };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  return renderToStaticMarkup(React.createElement(DefinitionOverlays, {
    runtime: {
      definitionModal: {
        open: true,
        word: "BANC",
        definition: "Un siège.",
        definitions: ["Un siège.", "Un groupe de poissons."],
        highlightedDefinition: "Un groupe de poissons.",
        ok: true,
        preferLongDefinition: true,
        source: "wiktionary",
        url: "https://fr.wiktionary.org/wiki/banc",
        ...overrides,
      },
      wordInfoModal: { open: false },
      isAccountAuthenticated: true,
      isWordInVault: () => false,
      GUIDED_RESULTS_STEPS: {},
    },
  }));
}

test("the QPUC answer opens the usual complete definition with the selected question", () => {
  const calls = [];
  const result = { word: "banc", definition: "Un groupe de poissons." };
  const summary = LepersAnswerSummary({ result, openDefinition: (...args) => calls.push(args) });
  let stopped = false;
  summary.props.children.props.onClick({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
  assert.deepEqual(calls, [["banc", {
    preferLongDefinition: true,
    highlightedDefinition: "Un groupe de poissons.",
  }]]);
  const markup = renderToStaticMarkup(summary);
  assert.match(markup, /alt="QPUC"/);
  assert.match(markup, />BANC<\/span>/);
  assert.equal(LepersAnswerSummary({ result: null }), null);
});

test("the question meaning is highlighted and regular definition actions remain available", (t) => {
  const markup = renderDefinition(t);
  assert.equal((markup.match(/<mark /g) || []).length, 1);
  assert.match(markup, /Question de Julien<\/span>Un groupe de poissons\.<\/mark>/);
  assert.match(markup, /<li>Un siège\.<\/li>/);
  assert.match(markup, /aria-label="Ajouter au coffre fort"/);
  assert.match(markup, /href="https:\/\/fr.wiktionary.org\/wiki\/banc"/);
  assert.match(markup, />Fermer<\/button>/);
});

test("an ordinary definition has no leftover question highlight", (t) => {
  assert.doesNotMatch(renderDefinition(t, { highlightedDefinition: "" }), /<mark|Question de Julien/);
});

test("the known question survives a failed definition lookup with its usual vault action", (t) => {
  const markup = renderDefinition(t, { ok: false, definition: "", definitions: [] });
  assert.match(markup, /Un groupe de poissons\./);
  assert.doesNotMatch(markup, /Définition non disponible/);
  assert.match(markup, /aria-label="Ajouter au coffre fort"/);
});
