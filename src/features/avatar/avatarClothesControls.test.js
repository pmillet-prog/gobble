import test from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";
import { DEFAULT_AVATAR } from "./avatarState.js";

test("multi-piece clothing exposes independent labelled colors and resets while existing clothes keep one palette", async () => {
  const vite = await createServer({ configFile: false, appType: "custom", logLevel: "silent", resolve: { preserveSymlinks: true }, server: { middlewareMode: true } });
  try {
    const { default: Controls } = await vite.ssrLoadModule("/src/features/avatar/AvatarEditorControls.jsx");
    const changes = [];
    const selectedPart = {
      colorSlots: [{ key: "clothesColor", label: "Couleur de la veste" }, { key: "clothesSecondaryColor", label: "Couleur du haut" }],
      colorDefaults: { clothesColor: "#355a8b", clothesSecondaryColor: "#ece4d4" },
    };
    const props = { category: "clothes", draft: { ...DEFAULT_AVATAR, clothes: "layered_jacket" }, selectedPart, onChange: patch => changes.push(patch) };
    const controls = Controls(props), palettes = controls.props.children[0];
    assert.equal(palettes.length, 2);
    const markup = renderToString(controls);
    assert.match(markup, /Couleur de la veste/);
    assert.match(markup, /Couleur du haut/);
    assert.equal((markup.match(/type="color"/g) || []).length, 2);
    assert.match(markup, /value="#355a8b"/);
    assert.match(markup, /value="#ece4d4"/);
    palettes[0].props.onChange("#9f3b47");
    palettes[1].props.onChange("#34323c");
    palettes[0].props.onOriginal();
    palettes[1].props.onOriginal();
    assert.deepEqual(changes, [{ clothesColor: "#9f3b47" }, { clothesSecondaryColor: "#34323c" }, { clothesColor: "" }, { clothesSecondaryColor: "" }]);
    const existing = renderToString(Controls({ ...props, selectedPart: { id: "tee_homme" } }));
    assert.equal((existing.match(/type="color"/g) || []).length, 1);
    assert.match(existing, /Couleur du vêtement/);
  } finally { await vite.close(); }
});
