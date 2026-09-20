import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createNativeAvatarRenderer, createCanvas, loadImage, GlobalFonts, avatarCatalog, avatarAssetRoot } from "../server/tests/helpers/avatarCanvasHarness.js";
import { normalizeAvatar, createBlankAvatar } from "../shared/avatarConfiguration.js";
import { drawParticipantTag } from "../src/features/avatar/avatarAccessories.js";

const out = new URL("../.Tmp/avatar-profile-review/", import.meta.url);
await mkdir(out, { recursive: true });
if (process.platform === "win32") GlobalFonts.registerFromPath("C:/Windows/Fonts/arial.ttf", "Arial");
const { renderer, restore } = await createNativeAvatarRenderer();
try {
  const cases = [
    ["Une médaille", { gold: 1 }, {}],
    ["Trois médailles en or", { gold: 3 }, { headwear: "newsboy" }],
    ["Trois médailles différentes", { gold: 1, silver: 1, bronze: 1 }, { base: "femme", hair: "bob" }],
    ["Quatre médailles en or", { gold: 4 }, {}],
    ["Une pile par couleur", { gold: 4, silver: 2, bronze: 3 }, { headwear: "kepi" }],
    ["Grand chapeau et cadrage atelier", { silver: 5, bronze: 2 }, { headwear: "tophat", clothes: "costume_cravate_homme" }],
  ];
  const sheet = createCanvas(1200, 890), ctx = sheet.getContext("2d");
  ctx.fillStyle = "#091725"; ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (let index = 0; index < cases.length; index++) {
    const [label, medals, config] = cases[index], x = index % 3 * 400, y = Math.floor(index / 3) * 445;
    const result = await renderer.prepare(normalizeAvatar(config, avatarCatalog));
    const portrait = createCanvas(370, 370);
    result.draw(portrait, "portrait", medals);
    ctx.drawImage(portrait, x + 15, y + 50);
    ctx.fillStyle = "#ffe4a5"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center";
    ctx.fillText(label, x + 200, y + 29);
  }
  await writeFile(new URL("profile-medals.png", out), sheet.toBuffer("image/png"));
  const tags = createCanvas(1200, 460), tagCtx = tags.getContext("2d");
  tagCtx.fillStyle = "#091725"; tagCtx.fillRect(0, 0, 1200, 460);
  const tagCases = [["Tigre", {}], ["Éléonore la championne", { base: "femme", hair: "bob" }], ["Test", { headwear: "tophat", clothes: "costume_cravate_homme" }]];
  for (const [index, [nickname, config]] of tagCases.entries()) {
    const result = await renderer.prepare(normalizeAvatar({ ...config, accessories: "participant_tag" }, avatarCatalog), { nickname });
    const portrait = createCanvas(390, 390);
    result.draw(portrait, "portrait", { gold: 3 });
    tagCtx.drawImage(portrait, index * 400 + 5, 50);
    tagCtx.fillStyle = "#ffe4a5"; tagCtx.font = "bold 18px Arial"; tagCtx.textAlign = "center";
    tagCtx.fillText(nickname, index * 400 + 200, 30);
  }
  await writeFile(new URL("participant-tags.png", out), tags.toBuffer("image/png"));
  const blankSheet = createCanvas(800, 450), blankCtx = blankSheet.getContext("2d");
  blankCtx.fillStyle = "#091725"; blankCtx.fillRect(0, 0, 800, 450);
  for (const [index, base] of ["femme", "homme"].entries()) {
    const result = await renderer.prepare(createBlankAvatar(base));
    const portrait = createCanvas(390, 390); result.draw(portrait, "portrait");
    blankCtx.drawImage(portrait, index * 400 + 5, 50);
    blankCtx.fillStyle = "#ffe4a5"; blankCtx.font = "bold 18px Arial"; blankCtx.textAlign = "center";
    blankCtx.fillText(`${base} · uniquement la base, 500 gobblars`, index * 400 + 200, 28);
  }
  await writeFile(new URL("blank-avatars.png", out), blankSheet.toBuffer("image/png"));
  const badge = createCanvas(640, 384), badgeCtx = badge.getContext("2d");
  badgeCtx.scale(2, 2);
  drawParticipantTag(badgeCtx, await loadImage(await readFile(new URL("rewards/participant-tag-oval.svg", avatarAssetRoot))), "Paul");
  await writeFile(new URL("participant-badge.png", out), badge.toBuffer("image/png"));
  for (const family of ["headwear", "brows"]) {
    const parts = avatarCatalog.families[family];
    const thumbs = createCanvas(700, Math.ceil(parts.length / 5) * 142 + 35), tc = thumbs.getContext("2d");
    tc.fillStyle = "#102333"; tc.fillRect(0, 0, thumbs.width, thumbs.height);
    tc.fillStyle = "#ffe4a5"; tc.font = "bold 16px Arial"; tc.fillText(family === "brows" ? "Sourcils centrés" : "Chapeaux entiers", 14, 24);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], x = i % 5 * 140 + 10, y = Math.floor(i / 5) * 142 + 45;
      const image = await loadImage(await readFile(new URL(part.file, avatarAssetRoot)));
      const { width, height, viewBox: [vx, vy, vw, vh] } = part.preview;
      tc.fillStyle = "#1c3445"; tc.fillRect(x, y, 120, 100);
      tc.save(); tc.beginPath(); tc.rect(x, y, 120, 100); tc.clip();
      tc.drawImage(image, x - vx / vw * 120, y - vy / vh * 100, width / vw * 120, height / vh * 100); tc.restore();
      tc.fillStyle = "#d6e3eb"; tc.font = "12px Arial"; tc.textAlign = "center"; tc.fillText(part.label.slice(0, 21), x + 60, y + 119);
    }
    await writeFile(new URL(`${family}-thumbnails.png`, out), thumbs.toBuffer("image/png"));
  }
  console.log("Avatar review images: .Tmp/avatar-profile-review/");
} finally { restore(); }
