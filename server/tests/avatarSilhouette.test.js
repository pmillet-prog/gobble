import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage, avatarCatalog, avatarAssetRoot } from "./helpers/avatarCanvasHarness.js";
import { createAvatarRenderer } from "../../src/features/avatar/avatarRenderer.js";
import { normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { drawAvatarMedals } from "../../src/features/avatar/avatarMedals.js";
import { drawAvatarAccessories, drawAvatarCompanion } from "../../src/features/avatar/avatarAccessories.js";
import { createAvatarThumbnailRenderer } from "../avatars/avatarThumbnailRenderer.js";

const renderer = await createAvatarRenderer({ catalog: avatarCatalog, makeCanvas: createCanvas,
  loadImage: async url => loadImage(await readFile(new URL(url.slice("/avatars/v1/".length), avatarAssetRoot))) });
async function draw(value, view = "portrait") {
  const prepared = await renderer.prepare(normalizeAvatar(value), { transparent: true });
  const canvas = createCanvas(512, 512); prepared.draw(canvas, view);
  return canvas;
}
function bounds(canvas) {
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] < 20) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom };
}
function assertStretched(before, after, width, label) {
  // Face thumbnails deliberately crop the shoulders; the existing crop stays fixed.
  assert.ok(Math.abs(after.left - Math.max(0, 256 + (before.left - 256) * width)) <= 2, `${label}: left anchor`);
  assert.ok(Math.abs(after.right - Math.min(511, 256 + (before.right - 256) * width)) <= 2, `${label}: right anchor`);
  assert.ok(Math.abs(after.top - before.top) <= 1, `${label}: top unchanged`);
  assert.ok(Math.abs(after.bottom - before.bottom) <= 1, `${label}: bottom unchanged`);
}

test("the assembled avatar stretches only horizontally and remains framed at both slider extremes", async () => {
  for (const base of ["homme", "femme"]) for (const view of ["portrait", "face"]) {
    for (const parts of [{ hair: "" }, { hair: "bob", headwear: "newsboy", glasses: "vue_ronde", nose: "witch_nose", accessories: ["earrings_hoops", "scar"] }]) {
      const value = { base, skinStyle: "chubby", tone: "custom", customColor: "#955f40", ...parts };
      const original = await draw(value, view), originalBounds = bounds(original);
      assert.deepEqual((await draw({ ...value, silhouetteWidth: 1 }, view)).toBuffer("image/png"), original.toBuffer("image/png"));
      for (const silhouetteWidth of [.8, 1.15]) {
        const changed = await draw({ ...value, silhouetteWidth }, view), changedBounds = bounds(changed);
        assertStretched(originalBounds, changedBounds, silhouetteWidth, `${base}/${view}/${silhouetteWidth}`);
        if (view === "portrait") assert.ok(changedBounds.left > 0 && changedBounds.right < 511, "portrait has no horizontal clipping");
        assert.equal(changed.gobbleViewport.silhouetteWidth, silhouetteWidth);
      }
    }
  }
});

test("chest medals, name tags and companions follow the same stretched character camera", async () => {
  const accessory = async id => loadImage(await readFile(new URL(avatarCatalog.families.accessories.find(part => part.id === id).file, avatarAssetRoot)));
  const tag = await accessory("participant_tag"), plush = await accessory("tiger_plush");
  for (const [label, paint] of [
    ["medals", (ctx, viewport) => drawAvatarMedals(ctx, viewport, { gold: 2, silver: 1 })],
    ["name tag", (ctx, viewport) => drawAvatarAccessories(ctx, viewport, tag, "Tigre")],
    ["companion", (ctx, viewport) => drawAvatarCompanion(ctx, viewport, plush)],
  ]) {
    let original;
    for (const silhouetteWidth of [1, .8, 1.15]) {
      const character = await draw({ silhouetteWidth, headwear: "newsboy" });
      const overlay = createCanvas(512, 512); paint(overlay.getContext("2d"), character.gobbleViewport);
      const framed = bounds(overlay);
      if (silhouetteWidth === 1) original = framed;
      else assertStretched(original, framed, silhouetteWidth, label);
    }
  }
});

test("decorations stay unchanged and saved 64px PNGs include the chosen silhouette", async t => {
  const value = { skinStyle: "defined", accessories: ["earrings_hoops"], backdrops: avatarCatalog.families.backdrops[0].id, auras: avatarCatalog.families.auras[0].id };
  for (const view of ["backdrops", "auras"]) {
    assert.deepEqual((await draw({ ...value, silhouetteWidth: .8 }, view)).toBuffer("image/png"),
      (await draw({ ...value, silhouetteWidth: 1.15 }, view)).toBuffer("image/png"));
  }
  const worker = createAvatarThumbnailRenderer(); t.after(() => worker.dispose());
  const thin = await worker.render(normalizeAvatar({ ...value, silhouetteWidth: .8 }));
  const broad = await worker.render(normalizeAvatar({ ...value, silhouetteWidth: 1.15 }));
  assert.notDeepEqual(thin.png, broad.png);
  assert.equal((await loadImage(broad.png)).width, 64);
});
