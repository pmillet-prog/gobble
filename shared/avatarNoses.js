import { AVATAR_ADDITION_IMAGES } from "./avatarAdditionImages.js";

const nose = (id, label, placement) => ({
  id, label, layers: {}, masks: {}, anchor: { x: 512, y: 470 },
  ...AVATAR_ADDITION_IMAGES[id], placement,
});

export const AVATAR_ADDITIONAL_NOSES = Object.freeze([
  nose("button_nose", "Petit nez en bouton", [475, 397, 74]),
  nose("crooked_nose", "Nez de boxeur", [463, 366, 98]),
  nose("witch_nose", "Nez de sorcière", [469, 360, 86]),
]);
