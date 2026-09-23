import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createAvatarRenderer } from "../src/features/avatar/avatarRenderer.js";
import { createCanvas, loadImage, GlobalFonts, avatarCatalog, avatarAssetRoot } from "../server/tests/helpers/avatarCanvasHarness.js";
import { DEFAULT_AVATAR, normalizeAvatar } from "../shared/avatarConfiguration.js";
import { AVATAR_SKINS } from "../shared/avatarSkins.js";

const out = new URL("../.Tmp/avatar-skins-review/", import.meta.url);
await mkdir(out, { recursive: true });
if (process.platform === "win32") GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "Arial");
const renderer = await createAvatarRenderer({ catalog: avatarCatalog, makeCanvas: createCanvas,
  loadImage: async url => loadImage(await readFile(new URL(url.slice("/avatars/v1/".length), avatarAssetRoot))) });
const cols = 4, tile = 280, rowHeight = 325;
for (const [name, colors] of [["natural", [null]], ["skin-tones", ["#ffdbc0", "#503427"]]]) {
  const rows = colors.flatMap(color => ["homme", "femme"].map(base => ({ base, color })));
  const sheet = createCanvas(cols * tile, rows.length * rowHeight), ctx = sheet.getContext("2d");
  ctx.fillStyle = "#091725"; ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (const [row, { base, color }] of rows.entries()) for (const [col, skin] of AVATAR_SKINS.entries()) {
    const value = normalizeAvatar({ ...DEFAULT_AVATAR, base, skinStyle: skin.id, hair: "",
      ...(color ? { tone: "custom", customColor: color } : {}) });
    const result = await renderer.prepare(value);
    const canvas = createCanvas(256, 256); result.draw(canvas, "face");
    ctx.drawImage(canvas, col * tile + 12, row * rowHeight + 45);
    ctx.fillStyle = "#ffe4a5"; ctx.font = "bold 17px Arial"; ctx.textAlign = "center";
    ctx.fillText(`${base === "homme" ? "Homme" : "Femme"} · ${skin.label}`, col * tile + tile / 2, row * rowHeight + 28);
  }
  await writeFile(new URL(`${name}.png`, out), sheet.toBuffer("image/png"));
}
const fitted = createCanvas(1200, 470), fc = fitted.getContext("2d");
fc.fillStyle = "#091725"; fc.fillRect(0, 0, 1200, 470);
const examples = [
  { base: "homme", skinStyle: "wrinkled", hair: "quiff", headwear: "newsboy", glasses: "vue_ronde" },
  { base: "femme", skinStyle: "defined", hair: "bob", nose: "witch_nose", accessories: ["earrings_hoops"] },
  { base: "homme", skinStyle: "chubby", tone: "custom", customColor: "#955f40", accessories: ["freckles", "scar"] },
  { base: "femme", skinStyle: "wrinkled", hair: "bob", tone: "custom", customColor: "#d89c70" },
];
for (const [index, value] of examples.entries()) {
  const result = await renderer.prepare(normalizeAvatar(value));
  const portrait = createCanvas(300, 390); result.draw(portrait, "portrait");
  fc.drawImage(portrait, index * 300, 35);
  fc.fillStyle = "#ffe4a5"; fc.font = "bold 16px Arial"; fc.textAlign = "center";
  fc.fillText(AVATAR_SKINS.find(skin => skin.id === value.skinStyle).label, index * 300 + 150, 25);
  const chat = createCanvas(64, 64); result.draw(chat, "face");
  fc.drawImage(chat, index * 300 + 118, 400);
}
await writeFile(new URL("fitting.png", out), fitted.toBuffer("image/png"));
console.log("Avatar skin comparisons: .Tmp/avatar-skins-review/");
