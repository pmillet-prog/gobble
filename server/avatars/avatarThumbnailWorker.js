import { parentPort } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createAvatarRenderer } from "../../src/features/avatar/avatarRenderer.js";
import { loadCatalog } from "./avatarValidation.js";
import { getWeeklyAvatarAura } from "../../shared/avatarWeeklyAuras.js";
import { getAvatarPartIds } from "../../shared/avatarSelections.js";

const root = new URL("../../public/avatars/v1/", import.meta.url);
parentPort.on("message", async ({ avatar }) => {
  try {
    const renderer = await createAvatarRenderer({
      catalog: await loadCatalog(), makeCanvas: createCanvas,
      loadImage: url => loadImage(fileURLToPath(new URL(url.slice("/avatars/v1/".length), root))),
    });
    // Keep time-limited decorations out of the immutable chat PNG, like medals.
    const result = await renderer.prepare({ ...avatar,
      accessories: getAvatarPartIds(avatar, "accessories").filter(id => !["participant_tag", "tiger_plush"].includes(id)),
      auras: getWeeklyAvatarAura(avatar.auras) ? "" : avatar.auras,
    });
    const canvas = createCanvas(64, 64);
    result.draw(canvas, "face", null);
    const png = await canvas.encode("png");
    parentPort.postMessage({ png });
  } catch (error) {
    parentPort.postMessage({ error: error?.message || "thumbnail_failed" });
  }
});
