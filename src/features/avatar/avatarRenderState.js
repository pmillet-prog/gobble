import { normalizeAvatar } from "./avatarState.js";
import { hasAvatarEyelids } from "../../../shared/avatarEyes.js";

// Expressions belong to a scene, never to the saved appearance of the player.
export function getAvatarRenderState(value, catalog, { expression = "neutral", blink = false, transparent = false } = {}) {
  const state = normalizeAvatar(value, catalog);
  if (["happy", "sad", "surprised"].includes(expression)) {
    const mouth = catalog.families.mouths.find(part => part.id === state.mouths);
    const variant = catalog.families.mouths.find(part => part.model_id === mouth?.model_id && part.expression === expression);
    if (variant) state.mouths = variant.id;
  }
  if (blink) state.openness = .3;
  if (!hasAvatarEyelids(state.eyes)) { state.openness = 1; state.lashes = ""; }
  if (transparent) state.backdrops = "";
  return state;
}
