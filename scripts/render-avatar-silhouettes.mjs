import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createAvatarRenderer } from "../src/features/avatar/avatarRenderer.js";
import { createCanvas, loadImage, avatarCatalog, avatarAssetRoot } from "../server/tests/helpers/avatarCanvasHarness.js";
import { normalizeAvatar } from "../shared/avatarConfiguration.js";

const output = new URL("../.Tmp/avatar-silhouette-review/", import.meta.url);
await mkdir(output, { recursive: true });
const renderer = await createAvatarRenderer({ catalog: avatarCatalog, makeCanvas: createCanvas,
  loadImage: async url => loadImage(await readFile(new URL(url.slice("/avatars/v1/".length), avatarAssetRoot))) });
const examples = [
  { base: "homme", skinStyle: "chubby", headwear: "newsboy", glasses: "vue_ronde", accessories: ["participant_tag", "tiger_plush"] },
  { base: "femme", skinStyle: "defined", hair: "bob", nose: "witch_nose", accessories: ["earrings_hoops", "scar"] },
];
const sheet = createCanvas(900, 740), ctx = sheet.getContext("2d");
ctx.fillStyle = "#091725"; ctx.fillRect(0, 0, 900, 740);
for (const [row, example] of examples.entries()) for (const [col, silhouetteWidth] of [.8, 1, 1.15].entries()) {
  const result = await renderer.prepare(normalizeAvatar({ ...example, silhouetteWidth }));
  const portrait = createCanvas(288, 288); result.draw(portrait, "portrait", { gold: 2, silver: 1 }, "Tigre");
  ctx.drawImage(portrait, col * 300 + 6, row * 370 + 34);
  ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; ctx.fillStyle = "#ffe4a5";
  ctx.fillText(`${Math.round(silhouetteWidth * 100)} %`, col * 300 + 150, row * 370 + 24);
  const thumbnail = createCanvas(64, 64); result.draw(thumbnail, "face");
  ctx.drawImage(thumbnail, col * 300 + 118, row * 370 + 301);
}
await writeFile(new URL("silhouettes.png", output), sheet.toBuffer("image/png"));
console.log("Silhouette comparison: .Tmp/avatar-silhouette-review/silhouettes.png");
