import { mkdir, writeFile } from "node:fs/promises";
import { createNativeAvatarRenderer, createCanvas, GlobalFonts } from "../../server/scripts/helpers/avatarCanvasHarness.js";
import { AVATAR_COSTUMES } from "../../shared/avatarCostumes.js";

GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "AvatarReview");
const out = new URL("qa-compatibility/", import.meta.url);
await mkdir(out, { recursive: true });
const { renderer, restore } = await createNativeAvatarRenderer();
const size = 512;
const cases = [
  ...["dinosaur", "knight", "musketeer", "clown", "vampire"].map(id => [id, ["longwaves", "longstraight", "afro", "gobble_f05"]]),
  ["rabbit", ["bob", "quiff", "longwaves", "afro"]],
];
const report = { phase: "After costume hair clipping; earlier report.json and all-costumes sheets are BEFORE clipping.", cases: [] };
async function render(base, costumes, hair) {
  const prepared = await renderer.prepare({ base, costumes, hair, glasses: "vue_ronde", accessories: ["nose_piercing", "earrings_hoops"], hairColor: "#432613" }, { transparent: true, portraitOffsetY: 0 });
  const frame = createCanvas(size, size); prepared.draw(frame, "portrait");
  const { crop, ratio, ox, oy } = frame.gobbleViewport;
  const canonical = createCanvas(size, size), ctx = canonical.getContext("2d");
  ctx.scale(.5, .5); ctx.drawImage(frame, crop[0] - ox / ratio, crop[1] - oy / ratio, size / ratio, size / ratio);
  return { canvas: canonical, data: canonical.getContext("2d").getImageData(0, 0, size, size).data };
}
function clipMask(part) {
  if (!part.hairClip) return null;
  const canvas = createCanvas(size, size), ctx = canvas.getContext("2d");
  ctx.scale(.5, .5); ctx.fillStyle = "white"; ctx.beginPath();
  if (part.hairClip.ellipse) ctx.ellipse(...part.hairClip.ellipse, 0, 0, Math.PI * 2);
  if (part.hairClip.rect) ctx.rect(...part.hairClip.rect);
  ctx.fill(); return ctx.getImageData(0, 0, size, size).data;
}
try {
  const rabbitSheet = createCanvas(1140, 680), ctx = rabbitSheet.getContext("2d");
  ctx.fillStyle = "#142531"; ctx.fillRect(0, 0, 1140, 680);
  ctx.fillStyle = "#fff4d2"; ctx.font = "bold 23px AvatarReview"; ctx.fillText("Lapin · coiffures conservées dans la capuche", 12, 35);
  for (const [baseIndex, base] of ["homme", "femme"].entries()) for (const [costumeId, hairs] of cases) {
    const part = AVATAR_COSTUMES.find(part => part.id === costumeId);
    const mask = clipMask(part), bald = await render(base, costumeId, "");
    for (const [hairIndex, hair] of hairs.entries()) {
      const result = await render(base, costumeId, hair);
      let changedFace = 0, changedOutsideClip = 0, changedTotal = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const delta = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(result.data[i + channel] - bald.data[i + channel])));
        if (delta <= 12) continue;
        changedTotal++;
        if (x >= 140 && x < 375 && y >= 90 && y < 335) changedFace++;
        if (mask && mask[i + 3] === 0) changedOutsideClip++;
      }
      report.cases.push({ base, costume: costumeId, hair, changedFace, changedTotal, changedOutsideClip: mask ? changedOutsideClip : null });
      if (costumeId === "rabbit") {
        const x = 10 + hairIndex * 285, y = 54 + baseIndex * 310;
        ctx.fillStyle = "#d7e4e8"; ctx.fillRect(x, y, 275, 275); ctx.drawImage(result.canvas, x, y, 275, 275);
        ctx.fillStyle = "#fff4d2"; ctx.font = "17px AvatarReview"; ctx.fillText(`${base} · ${hair}`, x + 3, y + 298);
      }
    }
  }
  report.summary = { cases: report.cases.length,
    invisibleHair: report.cases.filter(row => row.changedFace === 0),
    outsideClip: report.cases.filter(row => row.changedOutsideClip > 0) };
  await writeFile(new URL("rabbit-hair-clipped.png", out), await rabbitSheet.encode("png"));
  await writeFile(new URL("clip-report.json", out), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary, null, 2));
} finally { restore(); }
