import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createNativeAvatarRenderer, createCanvas, loadImage, GlobalFonts, avatarCatalog, avatarAssetRoot } from "../server/scripts/helpers/avatarCanvasHarness.js";
import { normalizeAvatar } from "../shared/avatarConfiguration.js";
import { AVATAR_ADDITIONAL_CLOTHES } from "../shared/avatarClothes.js";

const out = new URL("../dev/avatar-clothes/", import.meta.url);
await mkdir(out, { recursive: true });
if (process.platform === "win32") GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "AvatarReview");
const models = AVATAR_ADDITIONAL_CLOTHES.filter(part => part.base === "homme");
const { renderer, restore } = await createNativeAvatarRenderer();
let checked = 0;
async function portrait(value, size = 280) {
  const result = await renderer.prepare(normalizeAvatar(value, avatarCatalog), { portraitOffsetY: 0 });
  const image = createCanvas(size, size); result.draw(image, "portrait"); return image;
}
function sheet(columns, rows, height = 330) {
  const image = createCanvas(columns * 300, rows * height), ctx = image.getContext("2d");
  ctx.fillStyle = "#102332"; ctx.fillRect(0, 0, image.width, image.height);
  ctx.textAlign = "center"; ctx.fillStyle = "#f4e5c2"; ctx.font = "17px AvatarReview, AvatarMarker";
  return { image, ctx };
}
try {
  for (const base of ["homme", "femme"]) {
    const { image, ctx } = sheet(4, 3);
    for (const [index, model] of models.entries()) {
      const part = AVATAR_ADDITIONAL_CLOTHES.find(item => item.model_id === model.model_id && item.base === base);
      const x = index % 4 * 300, y = Math.floor(index / 4) * 330;
      ctx.drawImage(await portrait({ base, clothes: part.id, hair: base === "femme" ? "bob" : "quiff",
        glasses: base === "femme" ? "vue_ronde" : "", tone: base === "femme" ? "custom" : "native", customColor: "#ad7658" }), x + 10, y + 5);
      ctx.fillText(part.label.split(" · ")[0], x + 150, y + 311, 290);
      checked++;
    }
    await writeFile(new URL(`preview-${base}.png`, out), image.toBuffer("image/png"));
  }
  const { image, ctx } = sheet(3, 4);
  const examples = ["dungarees", "kimono", "varsity", "sweater_vest"];
  for (const [row, model] of examples.entries()) for (const [column, changes] of [
    {}, { clothesColor: "#9f3b47" }, { clothesSecondaryColor: "#35745d" },
  ].entries()) {
    ctx.drawImage(await portrait({ clothes: `${model}_homme`, ...changes }), column * 300 + 10, row * 330 + 5);
    ctx.fillText(["Couleurs d’origine", "Première pièce modifiée", "Deuxième pièce modifiée"][column], column * 300 + 150, row * 330 + 311);
  }
  await writeFile(new URL("preview-couleurs.png", out), image.toBuffer("image/png"));

  // Verify actual generated masks, not just synthetic fixtures: changing either
  // selector must preserve the unmasked fabric. Native-canvas high-quality
  // resampling can affect a two-pixel fringe around the source mask.
  for (const part of models) {
    const config = { clothes: part.id, hair: "", brows: "", eyes: "", nose: "", mouths: "" };
    const original = await portrait(config, 1024);
    const baseline = original.getContext("2d").getImageData(0, 0, 1024, 1024).data;
    for (const [field, file] of [["clothesColor", part.mask], ["clothesSecondaryColor", part.masks.secondary]]) {
      const changed = await portrait({ ...config, [field]: "#963d69" }, 1024);
      const pixels = changed.getContext("2d").getImageData(0, 0, 1024, 1024).data;
      const maskImage = await loadImage(await readFile(new URL(file, avatarAssetRoot)));
      const mask = createCanvas(1024, 1024), mc = mask.getContext("2d"); mc.drawImage(maskImage, 0, 0);
      const weights = mc.getImageData(0, 0, 1024, 1024).data;
      let differences = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const differs = Math.max(...[0, 1, 2].map(channel => Math.abs(pixels[i + channel] - baseline[i + channel]))) > 2;
        if (!differs) continue;
        let covered = weights[i] > 0;
        const x = i / 4 % 1024, y = Math.floor(i / 4 / 1024);
        for (let dy = -2; dy <= 2 && !covered; dy++) for (let dx = -2; dx <= 2 && !covered; dx++) {
          const nx = x + dx, ny = y + dy;
          covered = nx >= 0 && nx < 1024 && ny >= 0 && ny < 1024 && weights[(ny * 1024 + nx) * 4] > 0;
        }
        assert.ok(covered, `${part.model_id}/${field}: other fabric changed at pixel ${i / 4}`);
        differences++;
      }
      assert.ok(differences > 1000, `${part.model_id}/${field}: selector has no visible effect`);
    }
  }
  console.log(`${checked} clothing/base portraits and 24 independent color-mask changes verified. Previews: dev/avatar-clothes/`);
} finally { restore(); }
