import { mkdir, writeFile } from "node:fs/promises";
import { createNativeAvatarRenderer, createCanvas, loadImage, GlobalFonts, avatarAssetRoot, avatarCatalog } from "../../server/scripts/helpers/avatarCanvasHarness.js";
import { AVATAR_COSTUMES } from "../../shared/avatarCostumes.js";
import { AVATAR_SKINS } from "../../shared/avatarSkins.js";

// Production rendering only. No server, browser or product-state mutation.
const out = new URL("qa-compatibility/", import.meta.url);
GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "AvatarReview");
await mkdir(out, { recursive: true });
const size = 1024;
const hairStyles = ["bob", "quiff"];
const faceRegion = [280, 140, 470, 530];
const catalogFamily = (family, id) => avatarCatalog.families[family].some(part => part.id === id);
for (const hair of hairStyles) if (!catalogFamily("hair", hair)) throw new Error(`Missing hair ${hair}`);
const equipped = { eyes: "open", brows: "straight", nose: "short", mouths: "thin_neutral",
  hairColor: "#432613", glasses: "vue_ronde", accessories: ["freckles", "nose_piercing", "earrings_hoops", "diamond_necklace"],
  headwear: "", clothes: "", backdrops: "", auras: "", silhouetteWidth: 1 };
const { renderer, restore } = await createNativeAvatarRenderer();

function pixels(canvas) { return canvas.getContext("2d").getImageData(0, 0, size, size).data; }
async function render(config) {
  const prepared = await renderer.prepare({ ...equipped, ...config }, { transparent: true, portraitOffsetY: 0 });
  const frame = createCanvas(size, size);
  prepared.draw(frame, "portrait");
  // Undo viewport crop so hair and bald references use the same authored grid.
  const { crop, ratio, ox, oy } = frame.gobbleViewport;
  const canonical = createCanvas(size, size);
  canonical.getContext("2d").drawImage(frame, crop[0] - ox / ratio, crop[1] - oy / ratio, size / ratio, size / ratio);
  return { canvas: canonical, pixels: pixels(canonical), selected: prepared.state };
}
function difference(a, b, region = [0, 0, size, size], mask) {
  const [left, top, width, height] = region;
  let changed = 0, tested = 0, maximum = 0;
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    const i = (y * size + x) * 4;
    if (mask && mask[i + 3] < 254) continue;
    tested++;
    const delta = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(a[i + channel] - b[i + channel])));
    if (delta > 8) changed++;
    maximum = Math.max(maximum, delta);
  }
  return { changed, tested, maximum };
}
async function costumePixels(costume, base) {
  const image = await loadImage(new URL(costume.file, avatarAssetRoot));
  const canvas = createCanvas(size, size);
  const placement = Array.isArray(costume.placement) ? costume.placement : costume.placement?.[base];
  canvas.getContext("2d").drawImage(image, ...(placement || [0, 0, 1024, 1024]));
  return pixels(canvas);
}
async function saveSheet(filename, title, cases, columns = 4, tile = 270) {
  const gap = 12, labelHeight = 45, header = 62;
  const rows = Math.ceil(cases.length / columns);
  const width = columns * (tile + gap) + gap, height = header + rows * (tile + labelHeight + gap);
  const sheet = createCanvas(width, height), ctx = sheet.getContext("2d");
  ctx.fillStyle = "#142531"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff4d2"; ctx.font = "bold 24px AvatarReview"; ctx.fillText(title, 14, 35);
  cases.forEach(({ canvas, label, sublabel }, index) => {
    const x = gap + index % columns * (tile + gap), y = header + Math.floor(index / columns) * (tile + labelHeight + gap);
    ctx.fillStyle = "#d7e4e8"; ctx.fillRect(x, y, tile, tile);
    ctx.drawImage(canvas, x, y, tile, tile);
    ctx.fillStyle = "#fff4d2"; ctx.font = "18px AvatarReview"; ctx.fillText(label, x + 4, y + tile + 22);
    ctx.fillStyle = "#b7d0da"; ctx.font = "13px AvatarReview"; ctx.fillText(sublabel || "", x + 4, y + tile + 40);
  });
  await writeFile(new URL(filename, out), await sheet.encode("png"));
}

const report = { renderer: "production createNativeAvatarRenderer", matrix: [], musketeer: [], sheets: [] };
try {
  for (const base of ["homme", "femme"]) {
    const rows = Object.fromEntries(hairStyles.map(hair => [hair, []]));
    for (const costume of AVATAR_COSTUMES) {
      const config = { base, skinStyle: "classic", costumes: costume.id };
      const bald = await render({ ...config, hair: "" });
      const mask = await costumePixels(costume, base);
      for (const hair of hairStyles) {
        const result = await render({ ...config, hair });
        const hairDifference = difference(result.pixels, bald.pixels, faceRegion);
        const costumeCoverage = difference(result.pixels, bald.pixels, [0, 0, 1024, 560], mask);
        const entry = { base, costume: costume.id, hair, hairDifference, costumeCoverage };
        // One independent ablation per compatibility family and costume/base.
        if (hair === "bob") {
          const noGlasses = await render({ ...config, hair, glasses: "" });
          const noAccessories = await render({ ...config, hair, accessories: [] });
          const noFeatures = await render({ ...config, hair, eyes: "", brows: "", nose: "", mouths: "" });
          entry.glassesDifference = difference(result.pixels, noGlasses.pixels, [260, 240, 510, 330]);
          entry.accessoriesDifference = difference(result.pixels, noAccessories.pixels, [220, 200, 584, 620]);
          entry.featuresDifference = difference(result.pixels, noFeatures.pixels, [290, 250, 440, 430]);
        }
        report.matrix.push(entry);
        rows[hair].push({ canvas: result.canvas, label: costume.label, sublabel: `${base} · ${hair} · cheveux Δ${hairDifference.changed}` });
      }
    }
    for (const hair of hairStyles) {
      const filename = `all-costumes-${base}-${hair}.png`;
      await saveSheet(filename, `22 costumes · ${base} · ${hair} · lunettes + accessoires`, rows[hair]);
      report.sheets.push(filename);
    }
  }
  for (const base of ["homme", "femme"]) {
    const rows = [];
    for (const skin of AVATAR_SKINS) {
      const config = { base, skinStyle: skin.id, costumes: "musketeer" };
      const bald = await render({ ...config, hair: "" });
      for (const hair of hairStyles) {
        const result = await render({ ...config, hair });
        report.musketeer.push({ base, skinStyle: skin.id, hair, hairDifference: difference(result.pixels, bald.pixels, faceRegion) });
        rows.push({ canvas: result.canvas, label: `${skin.label} · ${hair}`, sublabel: `${base} · lunettes + accessoires` });
        if (skin.id === "classic") await writeFile(new URL(`musketeer-${base}-${hair}.png`, out), await result.canvas.encode("png"));
      }
    }
    const filename = `musketeer-six-faces-${base}.png`;
    await saveSheet(filename, `Mousquetaire · ${base} · 6 visages × 2 coiffures`, rows, 4, 320);
    report.sheets.push(filename);
  }
  report.summary = {
    matrixCases: report.matrix.length,
    musketeerCases: report.musketeer.length,
    hairInvisible: report.matrix.filter(entry => entry.hairDifference.changed === 0).map(({ base, costume, hair }) => ({ base, costume, hair })),
    costumeOpaquePixelsAffected: report.matrix.filter(entry => entry.costumeCoverage.changed > 0).map(({ base, costume, hair, costumeCoverage }) => ({ base, costume, hair, ...costumeCoverage })),
    missingGlasses: report.matrix.filter(entry => entry.glassesDifference && entry.glassesDifference.changed === 0),
    missingAccessories: report.matrix.filter(entry => entry.accessoriesDifference && entry.accessoriesDifference.changed === 0),
    missingFeatures: report.matrix.filter(entry => entry.featuresDifference && entry.featuresDifference.changed === 0),
  };
  await writeFile(new URL("report.json", out), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report.summary, sheets: report.sheets }, null, 2));
} finally { restore(); }
