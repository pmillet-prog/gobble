import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import parser from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default || traverseModule;

const KNOWN_BROWSER_GLOBALS = new Set([
  "AbortController",
  "Array",
  "Boolean",
  "CSS",
  "Date",
  "Element",
  "Error",
  "Event",
  "HTMLElement",
  "IntersectionObserver",
  "JSON",
  "Map",
  "Math",
  "MutationObserver",
  "Number",
  "Object",
  "Promise",
  "ResizeObserver",
  "Set",
  "String",
  "URL",
  "URLSearchParams",
  "Uint8Array",
  "WeakMap",
  "cancelAnimationFrame",
  "clearInterval",
  "clearTimeout",
  "console",
  "crypto",
  "document",
  "fetch",
  "localStorage",
  "navigator",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "screen",
  "sessionStorage",
  "setInterval",
  "setTimeout",
  "structuredClone",
  "window",
]);

test("GobbleApplication has no unbound runtime identifiers", () => {
  const source = fs.readFileSync(
    new URL("../../src/GobbleApplication.jsx", import.meta.url),
    "utf8"
  );
  const ast = parser.parse(source, {
    plugins: ["jsx"],
    sourceType: "module",
  });
  const unbound = new Map();

  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (KNOWN_BROWSER_GLOBALS.has(name) || path.scope.hasBinding(name)) return;
      if (!unbound.has(name)) unbound.set(name, []);
      unbound.get(name).push(path.node.loc?.start.line || 0);
    },
  });

  assert.deepEqual(
    [...unbound]
      .map(([name, lines]) => ({
        lines: [...new Set(lines)],
        name,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    []
  );
});
