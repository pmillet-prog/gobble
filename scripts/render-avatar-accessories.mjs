// Requested placement review: render the actual game compositor on both bases.
import { mkdir, writeFile } from "node:fs/promises";
import { createCanvas, createNativeAvatarRenderer } from "../server/tests/helpers/avatarCanvasHarness.js";
import { AVATAR_COSMETICS } from "../shared/avatarCosmetics.js";
import { normalizeAvatar } from "../shared/avatarConfiguration.js";

const output = new URL("../dev/avatar-accessories/review/", import.meta.url);
await mkdir(output, { recursive: true });
const { renderer, restore } = await createNativeAvatarRenderer();
try {
  for (const part of AVATAR_COSMETICS.filter(part => process.argv.length < 3 || process.argv.slice(2).includes(part.id))) {
    // One paired image per accessory. No other candidate family is reviewed.
    const sheet = createCanvas(960, 600), ctx = sheet.getContext("2d");
    ctx.fillStyle = "#f1f3f6"; ctx.fillRect(0, 0, 960, 600);
    for (const [index, base] of ["femme", "homme"].entries()) {
      const portrait = createCanvas(480, 520);
      const prepared = await renderer.prepare(normalizeAvatar({
        base, hair: "", headwear: "", facialhair: "", glasses: "", accessories: part.id,
        customColor: "#f6bd91", eyes: "open", nose: "short", mouths: "thin_neutral",
      }));
      prepared.draw(portrait, "portrait");
      ctx.drawImage(portrait, index * 480, 42);
      ctx.fillStyle = "#1d2c40"; ctx.font = "24px AvatarMarker";
      ctx.fillText(`${part.label} — ${base === "femme" ? "Femme" : "Homme"}`, index * 480 + 18, 28);
    }
    await writeFile(new URL(`${part.id}.png`, output), await sheet.encode("png"));
  }
  if (process.argv.length < 3) {
    const examples = [
      { label: "Bandeau, coiffure et Gavroche", base: "homme", accessories: "pirate_eyepatch", hair: "quiff", headwear: "newsboy" },
      { label: "Collier et cheveux longs", base: "femme", accessories: "diamond_necklace", hair: "longstraight" },
      { label: "Balafre déplacée et inclinée", base: "femme", accessories: "scar", hair: "bob", scarDx: -175, scarDy: -30, scarRotation: 35 },
    ];
    const sheet = createCanvas(1440, 600), ctx = sheet.getContext("2d");
    ctx.fillStyle = "#f1f3f6"; ctx.fillRect(0, 0, 1440, 600);
    for (const [index, config] of examples.entries()) {
      const canvas = createCanvas(480, 520);
      const { label, ...avatar } = config;
      (await renderer.prepare(normalizeAvatar(avatar))).draw(canvas, "portrait");
      ctx.drawImage(canvas, index * 480, 42);
      ctx.fillStyle = "#1d2c40"; ctx.font = "24px AvatarMarker";
      ctx.fillText(label, index * 480 + 18, 28);
    }
    await writeFile(new URL("combinations.png", output), await sheet.encode("png"));
  }
  console.log("Paired placement previews written to dev/avatar-accessories/review/");
} finally { restore(); }
