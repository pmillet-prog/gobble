import { createAvatarRenderer } from "../avatar/avatarRenderer.js";
import { loadAvatarImage } from "../avatar/avatarAssetCache.js";
import { getPresenterPodiumAvatar, preparePresenterPodiumAvatar } from "./presenterPodiumAvatars.js";

export function releasePodiumAvatars(actors) {
  for (const actor of actors || []) for (const canvas of new Set(Object.values(actor.frames))) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function preparePodiumAvatars(players, { signal, onProgress } = {}) {
  let renderer;
  let defaultImage;
  const actors = [];
  try {
    // Share selected images within this preparation, then release renderer caches.
    for (const player of players) {
      signal?.throwIfAborted();
      const actor = { ...player, frames: {} };
      actors.push(actor);
      const presenter = getPresenterPodiumAvatar(player);
      if (presenter) {
        await preparePresenterPodiumAvatar(actor, presenter, { signal });
        onProgress?.(actors.length);
        continue;
      }
      if (!player.avatar) {
        defaultImage ||= await loadAvatarImage("/avatars/default.png");
        signal?.throwIfAborted();
        const canvas = Object.assign(document.createElement("canvas"), { width: 600, height: 600 });
        const scale = Math.min(540 / defaultImage.width, 540 / defaultImage.height);
        canvas.getContext("2d").drawImage(defaultImage, (600 - defaultImage.width * scale) / 2, (600 - defaultImage.height * scale) / 2, defaultImage.width * scale, defaultImage.height * scale);
        actor.frames = { neutral: canvas, happy: canvas, blink: canvas };
        onProgress?.(actors.length);
        continue;
      }
      renderer ||= await createAvatarRenderer();
      for (const pose of player.previewOnly ? ["happy"] : ["neutral", "happy", "blink"]) {
        signal?.throwIfAborted();
        const frame = await renderer.prepare(player.avatar, {
          transparent: true, expression: pose === "neutral" ? "neutral" : "happy", blink: pose === "blink", nickname: player.nick,
        });
        signal?.throwIfAborted();
        const canvas = Object.assign(document.createElement("canvas"), { width: 600, height: 600 });
        actor.frames[pose] = canvas;
        frame.draw(canvas, "portrait");
        // Preparing during final-round results must still let that screen paint.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      onProgress?.(actors.length);
    }
    return actors;
  } catch (error) {
    releasePodiumAvatars(actors);
    throw error;
  }
}
