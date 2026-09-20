import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getAvatarChoices, getAvatarSliders } from "./avatarControls.js";
import headwearFitting from "./renderer/headwear-fitting.js";
import { DEFAULT_AVATAR } from "./avatarState.js";
import { withAvatarAccessories } from "../../../shared/avatarObjectives.js";

const assetRoot = new URL("../../../public/avatars/v1/", import.meta.url);
const catalog = withAvatarAccessories(JSON.parse(fs.readFileSync(new URL("catalog.json", assetRoot))));

test("mouth choices contain only the ten bases; animation variants stay in the library", () => {
  const choices = getAvatarChoices(catalog, "mouths", "homme");
  assert.equal(choices.length, 10);
  assert.ok(choices.every(part => part.expression === "neutral"));
  assert.equal(catalog.families.mouths.length, 40);
});
test("outfits match each base and all four auras are available for local preview", () => {
  for (const base of ["femme", "homme"]) {
    const choices = getAvatarChoices(catalog, "clothes", base);
    assert.ok(choices.length > 0);
    assert.ok(choices.every(part => part.base === base && part.masks.skin && part.mask));
  }
  assert.equal(catalog.families.auras.length, 4);
  assert.ok(catalog.families.auras.every(part => part.unlock));
});
test("every imported hat has the placement required by the renderer, including the kepi", () => {
  assert.ok(catalog.families.headwear.length >= 13);
  assert.equal(catalog.families.headwear.length, 30);
  const gavroche = catalog.families.headwear.find(part => part.id === "newsboy");
  assert.ok(gavroche?.fitting?.strokes.length > 0, "Paul explicitly keeps Gavroche with its saved fitting");
  for (const part of catalog.families.headwear) {
    const placement = headwearFitting.placement(part, DEFAULT_AVATAR);
    assert.ok([placement.x, placement.y, placement.scale, placement.anchor.x, placement.anchor.y].every(Number.isFinite), part.id);
  }
});
test("glasses and the remaining current workshop pieces are selectable", () => {
  assert.equal(catalog.families.glasses.length, 10);
  assert.ok(catalog.families.glasses.every(part => part.mask && part.anchor));
  assert.ok(catalog.families.hair.some(part => part.id === "longstraight"));
  assert.ok(catalog.families.hair.some(part => part.id === "longwaves"));
  assert.ok(catalog.families.facialhair.some(part => part.id === "rouflaquettes"));
  assert.equal(catalog.families.lashes.length, 2);
  assert.ok(catalog.families.lashes.every(part => part.lash_strips.length === 2 && part.lash_height > 0 && part.mask));
  assert.deepEqual(getAvatarSliders("hair"), []);
  assert.deepEqual(getAvatarSliders("headwear"), []);
  assert.equal(getAvatarSliders("glasses").length, 3);
});
test("hat, brow and glasses thumbnails use centered 6:5 framing independent of attachment", () => {
  for (const part of [...catalog.families.headwear, ...catalog.families.glasses, ...catalog.families.brows]) {
    const { width, height, viewBox } = part.preview;
    assert.equal(width, 1024);
    assert.equal(height, 1024);
    assert.ok(viewBox.every(Number.isFinite), part.id);
    assert.ok(viewBox[2] > 0 && viewBox[3] > 0, part.id);
    assert.ok(Math.abs(viewBox[2] / viewBox[3] - 1.2) < .000001, part.id);
  }
});
test("every image and coloration mask referenced by the runtime pack exists", () => {
  const files = catalog.bases.flatMap(part => [part.file, part.mask]);
  for (const parts of Object.values(catalog.families)) for (const part of parts) files.push(part.file, part.mask, ...Object.values(part.layers), ...Object.values(part.masks));
  for (const file of files.filter(Boolean)) assert.ok(fs.existsSync(new URL(file, assetRoot)), file);
});

test("the retained supplied hairstyles are selectable with brown previews; the rejected bun is excluded", () => {
  const imported = catalog.families.hair.filter(part => part.id.startsWith("gobble_"));
  assert.equal(imported.length, 19);
  assert.equal(catalog.families.hair.length, 41);
  assert.ok(!catalog.families.hair.some(part => part.id === "gobble_f01"));
  const order = catalog.families.hair.map(part => part.id);
  assert.equal(order[0], "stubble");
  assert.ok(order.indexOf("gobble_f05") < order.indexOf("gobble_f03"), "Pixie before bob");
  assert.ok(order.indexOf("gobble_f03") < order.indexOf("gobble_f09"), "Bob before long waves");
  assert.ok(order.indexOf("gobble_f09") < order.indexOf("gobble_f04"), "Long tied hair grouped last");
  for (const base of ["femme", "homme"]) {
    const ids = new Set(getAvatarChoices(catalog, "hair", base).map(part => part.id));
    for (const part of imported) {
      assert.ok(ids.has(part.id));
      assert.equal(part.coloration.method, "multiply");
      assert.equal(part.previewTone, "brown");
      assert.ok(part.layers.front && part.layers.back && part.mask);
    }
  }
});
