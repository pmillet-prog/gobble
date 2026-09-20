import { createNativeAvatarRenderer, createCanvas, avatarCatalog } from "../server/tests/helpers/avatarCanvasHarness.js";
import { normalizeAvatar } from "../shared/avatarConfiguration.js";
const { renderer, restore } = await createNativeAvatarRenderer();
let checked = 0;
try {
  const canvas = createCanvas(160, 160);
  for (const [family, parts] of Object.entries(avatarCatalog.families)) for (const part of parts) {
    if (family === "mouths" && !part.id.endsWith("_neutral")) continue;
    try {
      const result = await renderer.prepare(normalizeAvatar({ [family]: part.id, base: part.base || "homme" }, avatarCatalog));
      result.draw(canvas, "portrait");
      checked++;
    } catch (error) { console.error(family, part.id, error); process.exitCode = 1; }
  }
  console.log(`${checked} avatar parts rendered`);
} finally { restore(); }
