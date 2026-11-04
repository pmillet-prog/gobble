import { prepareSavedAvatar } from "../avatar/prepareSavedAvatar.js";
import { savedAvatarImages } from "../avatar/savedAvatarImages.js";
import { getPresenterPodiumAvatar } from "../celebration/presenterPodiumAvatars.js";

export async function prepareInfortuneContestant(player, { makeCanvas, loadRenderer, isDisposed = () => false } = {}) {
  const presenter = getPresenterPodiumAvatar(player);
  const canvas = makeCanvas();
  try {
    if (presenter) {
      // Only the existing neutral portrait: no reaction frames or sprite sheet.
      const image = await savedAvatarImages.load(presenter.poses.neutral);
      if (isDisposed()) return null;
      const [x, y, width, height] = presenter.bounds;
      const scale = Math.min(560 / width, 580 / height);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, (600 - width * scale) / 2 - x * scale, 600 - height * scale - y * scale,
        image.width * scale, image.height * scale);
    } else if (player.avatar) {
      const options = { view: "portrait", transparent: true, expression: "happy", portraitOffsetY: 0, nickname: player.nick };
      let prepared = await prepareSavedAvatar(player.avatar, options);
      if (isDisposed()) return null;
      if (!prepared) prepared = await (await loadRenderer()).prepare(player.avatar, options);
      if (isDisposed()) return null;
      prepared.draw(canvas, "portrait");
    } else {
      await drawDefault();
    }
  } catch {
    if (!isDisposed()) await drawDefault();
  }
  return isDisposed() ? null : canvas;

  async function drawDefault() {
    const image = await savedAvatarImages.load("/avatars/default.png");
    if (isDisposed()) return;
    const ctx = canvas.getContext("2d"), scale = Math.min(540 / image.width, 540 / image.height);
    ctx.clearRect(0, 0, 600, 600);
    ctx.drawImage(image, (600 - image.width * scale) / 2, 600 - image.height * scale, image.width * scale, image.height * scale);
  }
}
