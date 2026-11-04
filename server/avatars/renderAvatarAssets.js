import { AVATAR_ASSET_RENDER_VERSION, AVATAR_ASSET_VARIANTS, avatarAssetSignature } from "../../shared/avatarRenderAssets.js";
import { getAvatarPartIds } from "../../shared/avatarSelections.js";

// Runs in the existing isolated renderer worker. Labels and medals remain live.
export async function renderAvatarAssets(avatar, { renderer, createCanvas, catalog }) {
  const accessories = getAvatarPartIds(avatar, "accessories");
  const appearance = { ...avatar, accessories: accessories.filter(id => !["participant_tag", "tiger_plush"].includes(id)) };
  const selectedFile = id => accessories.includes(id)
    ? catalog.families.accessories.find(part => part.id === id)?.file : undefined;
  const manifest = { signature: avatarAssetSignature(avatar), frames: {},
    tag: selectedFile("participant_tag"), companion: selectedFile("tiger_plush") };
  const images = {};
  for (const [kind, options] of Object.entries(AVATAR_ASSET_VARIANTS)) {
    const prepared = await renderer.prepare(appearance, options);
    const canvas = createCanvas(options.size, options.size);
    prepared.draw(canvas, options.view);
    manifest.frames[kind] = { size: options.size, viewport: canvas.gobbleViewport };
    images[kind] = await canvas.encode("png");
  }
  return { version: AVATAR_ASSET_RENDER_VERSION, manifest, images };
}
