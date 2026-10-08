import { writeFile, readFile } from "node:fs/promises";
import { createCanvas, loadImage, GlobalFonts } from "../../server/scripts/helpers/avatarCanvasHarness.js";
import { AVATAR_COSTUMES } from "../../shared/avatarCostumes.js";
import { AVATAR_SKINS } from "../../shared/avatarSkins.js";
GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "AvatarReview");
const out = new URL("qa-compatibility/", import.meta.url);
const report = JSON.parse(await readFile(new URL("report.json", out), "utf8"));
async function relabel(file, title, labels, { tile = 270, gap = 12, header = 62, step = tile + 57 } = {}) {
  const source = await loadImage(new URL(file, out)), canvas = createCanvas(source.width, source.height), ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0); ctx.fillStyle = "#142531"; ctx.fillRect(0, 0, canvas.width, header);
  ctx.fillStyle = "#fff4d2"; ctx.font = "bold 24px AvatarReview"; ctx.fillText(title, 14, 35);
  for (let row = 0; row < Math.ceil(labels.length / 4); row++) {
    ctx.fillStyle = "#142531"; ctx.fillRect(0, header + row * step + tile, canvas.width, step - tile);
  }
  labels.forEach(([label, sublabel], index) => {
    const x = gap + index % 4 * (tile + gap), y = header + Math.floor(index / 4) * step;
    ctx.fillStyle = "#142531"; ctx.fillRect(x, y + tile, tile, step - tile);
    ctx.fillStyle = "#fff4d2"; ctx.font = "17px AvatarReview"; ctx.fillText(label, x + 4, y + tile + 21);
    if (sublabel) { ctx.fillStyle = "#b7d0da"; ctx.font = "12px AvatarReview"; ctx.fillText(sublabel, x + 4, y + tile + 40); }
  });
  await writeFile(new URL(file, out), await canvas.encode("png"));
}
for (const base of ["homme", "femme"]) {
  for (const hair of ["bob", "quiff"]) await relabel(`all-costumes-${base}-${hair}.png`, `22 costumes · ${base} · ${hair} · lunettes + accessoires`,
    AVATAR_COSTUMES.map(costume => [costume.label, `${base} · ${hair} · cheveux Δ${report.matrix.find(row => row.base === base && row.hair === hair && row.costume === costume.id).hairDifference.changed}`]));
  await relabel(`musketeer-six-faces-${base}.png`, `Mousquetaire · ${base} · 6 visages × 2 coiffures`,
    AVATAR_SKINS.flatMap(skin => ["bob", "quiff"].map(hair => [`${skin.label} · ${hair}`, `${base} · lunettes + accessoires`])), { tile: 320 });
  await relabel(`long-hair-${base}.png`, `Coiffures longues / volumineuses · ${base}`,
    ["dinosaur", "knight", "musketeer", "clown", "vampire"].flatMap(costume => ["longwaves", "longstraight", "afro", "gobble_f05"].map(hair => [`${costume} · ${hair}`])),
    { tile: 280, gap: 10, header: 50, step: 315 });
}
console.log("QA labels repaired without rerendering avatars.");
