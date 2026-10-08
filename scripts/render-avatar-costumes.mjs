import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createNativeAvatarRenderer, createCanvas, loadImage, GlobalFonts, avatarCatalog, avatarAssetRoot } from "../server/scripts/helpers/avatarCanvasHarness.js";
import { normalizeAvatar } from "../shared/avatarConfiguration.js";
import { AVATAR_COSTUMES } from "../shared/avatarCostumes.js";

// Render with the production compositor; this needs neither a browser nor the
// game backend. --available allows inspecting a batch while images are arriving.
const partial = process.argv.includes("--available");
if (process.platform === "win32") GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "AvatarReview");
const out = new URL("../.Tmp/avatar-costumes/", import.meta.url);
await mkdir(out, { recursive: true });
const parts = [];
for (const part of AVATAR_COSTUMES) {
  try { await access(new URL(part.file, avatarAssetRoot)); parts.push(part); }
  catch (error) { if (!partial) throw error; }
}
assert.ok(parts.length, "At least one costume image is required");
const { renderer, restore } = await createNativeAvatarRenderer();
let rendered = 0;
try {
  for (const base of ["homme", "femme"]) {
    const sheet = createCanvas(1500, Math.ceil(parts.length / 5) * 346);
    const ctx = sheet.getContext("2d");
    ctx.fillStyle = "#102332"; ctx.fillRect(0, 0, sheet.width, sheet.height);
    for (const [index, part] of parts.entries()) {
      const avatar = normalizeAvatar({ base, costumes: part.id, hair: "longwaves", headwear: "tophat",
        glasses: base === "femme" ? "vue_ronde" : "", accessories: ["earrings_hoops"],
        tone: base === "femme" ? "custom" : "native", customColor: "#ad7658",
        backgroundColor: "#24445c" }, avatarCatalog);
      const result = await renderer.prepare(avatar, { portraitOffsetY: 0 });
      assert.equal(result.state.hair, avatar.hair, `${part.id}: preserve saved hair`);
      assert.equal(result.state.headwear, avatar.headwear, `${part.id}: preserve saved hat`);
      const portrait = createCanvas(290, 290); result.draw(portrait, "portrait");
      const x = index % 5 * 300 + 5, y = Math.floor(index / 5) * 346 + 10;
      ctx.drawImage(portrait, x, y);
      ctx.textAlign = "center"; ctx.fillStyle = "#f4e5c2"; ctx.font = "20px AvatarReview, AvatarMarker";
      ctx.fillText(part.label, x + 145, y + 317);
      if (base === "homme") {
        // A transparent face center is essential to preserve player identity.
        const image = await loadImage(await readFile(new URL(part.file, avatarAssetRoot)));
        const check = createCanvas(1024, 1024), c = check.getContext("2d");
        c.drawImage(image, 0, 0, 1024, 1024);
        assert.equal(c.getImageData(512, 420, 1, 1).data[3], 0, `${part.id}: transparent face opening`);
      }
      rendered++;
    }
    await writeFile(new URL(`${base}.png`, out), sheet.toBuffer("image/png"));
  }
  console.log(`${rendered} costume/base combinations rendered: ${out.pathname}`);
} finally { restore(); }
