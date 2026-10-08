import { mkdir, writeFile } from "node:fs/promises";
import { createNativeAvatarRenderer, createCanvas, GlobalFonts } from "../../server/scripts/helpers/avatarCanvasHarness.js";

const out = new URL("qa-compatibility/", import.meta.url);
GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "AvatarReview");
await mkdir(out, { recursive: true });
const { renderer, restore } = await createNativeAvatarRenderer();
const costumes = ["dinosaur", "knight", "musketeer", "clown", "vampire"];
const hairs = ["longwaves", "longstraight", "afro", "gobble_f05"];
try {
  for (const base of ["homme", "femme"]) {
    const sheet = createCanvas(1160, 1640), ctx = sheet.getContext("2d");
    ctx.fillStyle = "#152834"; ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.fillStyle = "#fff4d2"; ctx.font = "bold 22px AvatarReview";
    ctx.fillText(`Coiffures longues / volumineuses · ${base}`, 14, 32);
    for (const [row, costumesId] of costumes.entries()) for (const [column, hair] of hairs.entries()) {
      const avatar = await renderer.prepare({ base, costumes: costumesId, hair,
        glasses: "vue_ronde", accessories: ["nose_piercing", "earrings_hoops"], hairColor: "#432613" },
      { transparent: true, portraitOffsetY: 0 });
      const tile = createCanvas(560, 560); avatar.draw(tile, "portrait");
      const x = 10 + column * 290, y = 50 + row * 315;
      ctx.fillStyle = "#d7e4e8"; ctx.fillRect(x, y, 280, 280);
      ctx.drawImage(tile, x, y, 280, 280);
      ctx.fillStyle = "#fff4d2"; ctx.font = "15px AvatarReview";
      ctx.fillText(`${costumesId} · ${hair}`, x + 3, y + 301);
    }
    await writeFile(new URL(`long-hair-${base}.png`, out), await sheet.encode("png"));
  }
  console.log("Two long/voluminous hair review sheets complete (40 cases).");
} finally { restore(); }
