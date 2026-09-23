import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage, avatarCatalog, avatarAssetRoot } from "./helpers/avatarCanvasHarness.js";
import { createAvatarRenderer } from "../../src/features/avatar/avatarRenderer.js";
import { normalizeAvatar, createBlankAvatar } from "../../shared/avatarConfiguration.js";
import { AVATAR_SKINS } from "../../shared/avatarSkins.js";
import { createAvatarThumbnailRenderer } from "../avatars/avatarThumbnailRenderer.js";

test("variants replace the complete head PNG, retain their own outline and tint without the old mask", async () => {
  const loaded = [];
  const renderer = await createAvatarRenderer({ catalog: avatarCatalog, makeCanvas: createCanvas,
    loadImage: async url => { loaded.push(url); return loadImage(await readFile(new URL(url.slice("/avatars/v1/".length), avatarAssetRoot))); } });
  const draw = async (value, view = "portrait", size = 1024) => {
    const rendered = await renderer.prepare(value, { transparent: true });
    const canvas = createCanvas(size, size); rendered.draw(canvas, view);
    return canvas;
  };
  for (const base of ["homme", "femme"]) {
    const bare = createBlankAvatar(base);
    const original = await draw(bare);
    const bust = await loadImage(await readFile(new URL(avatarCatalog.bases.find(part => part.id === `bust_${base}`).file, avatarAssetRoot)));
    for (const skin of AVATAR_SKINS.slice(1)) {
      const canvas = await draw({ ...bare, skinStyle: skin.id });
      // Independent reference composition: original bust + the complete source
      // PNG, never the generic head or its clipping/recoloring masks.
      const reference = createCanvas(1024, 1024), ctx = reference.getContext("2d");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      const { crop, ratio, ox, oy } = original.gobbleViewport;
      ctx.translate(ox, oy); ctx.scale(ratio, ratio); ctx.translate(-crop[0], -crop[1]);
      ctx.drawImage(bust, 0, 0);
      const source = await loadImage(await readFile(new URL(`skins/2026-09-23/${base}_${skin.id}.png`, avatarAssetRoot)));
      const replacement = createCanvas(1024, 1024), head = replacement.getContext("2d");
      head.imageSmoothingEnabled = true; head.imageSmoothingQuality = "high";
      head.drawImage(source, 0, skin.id === "defined" ? 6 : 0, 1024, 1024);
      ctx.drawImage(replacement, 0, 0);
      assert.ok(Buffer.from(canvas.getContext("2d").getImageData(0, 0, 1024, 1024).data).equals(
        Buffer.from(reference.getContext("2d").getImageData(0, 0, 1024, 1024).data)), `${base}/${skin.id}: entire replacement silhouette`);
      assert.deepEqual((await draw(bare)).toBuffer("image/png"), original.toBuffer("image/png"), "classic is visually unchanged");
      const light = { ...bare, skinStyle: skin.id, tone: "custom", customColor: "#ffdbc0" };
      const first = (await draw(light, "face", 128)).toBuffer("image/png");
      const dark = (await draw({ ...light, customColor: "#503427" }, "face", 128)).toBuffer("image/png");
      assert.notDeepEqual(first, dark);
      assert.deepEqual((await draw(light, "face", 128)).toBuffer("image/png"), first);
    }
  }
  assert.equal(new Set(loaded.filter(url => url.includes("/skins/"))).size, 6);
});

test("stored 64px PNGs include every skin style and preserve independently fitted features", async t => {
  const worker = createAvatarThumbnailRenderer();
  t.after(() => worker.dispose());
  for (const base of ["homme", "femme"]) {
    const value = normalizeAvatar({ base, hair: "", tone: "custom", customColor: "#ba8159", nose: "witch_nose", accessories: ["earrings_hoops"] });
    const outputs = [];
    for (const skin of AVATAR_SKINS) {
      const result = await worker.render({ ...value, skinStyle: skin.id });
      const image = await loadImage(result.png);
      assert.equal(image.width, 64); assert.equal(image.height, 64);
      assert.ok(result.png.length < 20000);
      for (const previous of outputs) assert.notDeepEqual(result.png, previous);
      outputs.push(result.png);
    }
  }
});
