import { CAMERA_SEQUENCES } from "../../../dev/infortune-perspective/cameraTimeline.js";

export function infortuneStageReady({ flat, cameraLoaded, stageReady, soundReady, renderError }) {
  return stageReady && !renderError && (flat || cameraLoaded && soundReady);
}

export function startInfortuneIntro(player, flat) {
  if (!player) return;
  // Applying the final intro frame also unlocks input and installs exchange
  // overlays. In 2D there is no camera movement or intro soundtrack to await.
  if (flat) player.seek("intro", CAMERA_SEQUENCES.intro.duration);
  else player.play("intro", { from: 0 });
}
