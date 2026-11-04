import { savedAvatarVariant } from "../../../shared/avatarRenderAssets.js";
import { savedAvatarImages } from "./savedAvatarImages.js";
import { drawAvatarAccessories, drawAvatarCompanion, loadAvatarMarkerFont } from "./avatarAccessories.js";
import { drawAvatarMedals } from "./avatarMedals.js";

export async function prepareSavedAvatar(avatar, options = {}, { images = savedAvatarImages } = {}) {
  const frame = savedAvatarVariant(avatar, options);
  if (!frame) return null; // Drafts and avatars predating server generation.
  const portrait = options.view === "portrait";
  const [image, tag, companion] = await Promise.all([
    images.load(frame.url),
    portrait && frame.tag ? images.load(`/avatars/v1/${frame.tag}`) : null,
    portrait && frame.companion ? images.load(`/avatars/v1/${frame.companion}`) : null,
    portrait && frame.tag ? loadAvatarMarkerFont() : null,
  ]);
  return { draw(canvas, view = options.view, medals, nickname = options.nickname) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = canvas.width !== image.width || canvas.height !== image.height;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    const scale = canvas.width / frame.size;
    const viewport = frame.viewport && { ...frame.viewport, crop: [...frame.viewport.crop],
      ratio: frame.viewport.ratio * scale, ox: frame.viewport.ox * scale, oy: frame.viewport.oy * scale };
    canvas.gobbleViewport = viewport;
    if (view === "portrait") {
      drawAvatarMedals(ctx, viewport, medals);
      drawAvatarAccessories(ctx, viewport, tag, nickname);
      drawAvatarCompanion(ctx, viewport, companion);
    }
  } };
}
