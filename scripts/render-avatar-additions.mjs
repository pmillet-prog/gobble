import { mkdir, writeFile } from "node:fs/promises";
import { createCanvas, createNativeAvatarRenderer } from "../server/tests/helpers/avatarCanvasHarness.js";
import { AVATAR_ADDITIONAL_NOSES } from "../shared/avatarNoses.js";
import { normalizeAvatar } from "../shared/avatarConfiguration.js";

const output = new URL("../dev/avatar-additions/review/", import.meta.url);
await mkdir(output, { recursive: true });
const { renderer, restore } = await createNativeAvatarRenderer();
async function sheet(name, examples) {
  const canvas = createCanvas(examples.length * 400, 500), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f1f3f6"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, { label, ...config }] of examples.entries()) {
    const portrait = createCanvas(400, 440);
    (await renderer.prepare(normalizeAvatar({ hair: "", ...config }))).draw(portrait, "portrait");
    ctx.drawImage(portrait, index * 400, 44);
    ctx.fillStyle = "#1d2c40"; ctx.font = "23px AvatarMarker";
    ctx.fillText(label, index * 400 + 14, 29);
  }
  await writeFile(new URL(`${name}.png`, output), await canvas.encode("png"));
}
try {
  for (const nose of AVATAR_ADDITIONAL_NOSES) {
    await sheet(nose.id, ["femme", "homme"].map(base => ({ label: `${nose.label} · ${base}`, base, nose: nose.id })));
  }
  await sheet("skin-tones", AVATAR_ADDITIONAL_NOSES.map((nose, index) => ({
    label: nose.label, base: index % 2 ? "homme" : "femme", nose: nose.id,
    tone: "custom", customColor: ["#ffdbc0", "#75482f", "#88b266"][index],
  })));
  await sheet("combinations", [
    { label: "Créoles, collier et taches de rousseur", base: "femme", hair: "bob", accessories: ["earrings_hoops", "diamond_necklace", "freckles"] },
    { label: "Émeraudes, perles et balafre", base: "homme", hair: "quiff", accessories: ["earrings_gems", "earrings_pearls", "scar"], scarDx: -50, scarRotation: 25 },
    { label: "Sorcière, étoiles et piercing", base: "femme", nose: "witch_nose", hair: "longstraight", accessories: ["earrings_stars", "nose_piercing"] },
  ]);
  console.log("Placement reviews: dev/avatar-additions/review/");
} finally { restore(); }
