import { AVATAR_COSMETIC_IMAGES } from "./avatarCosmeticImages.js";
import { AVATAR_ADDITION_IMAGES } from "./avatarAdditionImages.js";

const folder = "candidates/accessories/lot_013/2026-09-20-cosmetics";
const cosmetic = (id, label, price, options) => ({
  id, label, price, file: `${folder}/${id}_v01.png`, layers: {}, masks: {},
  ...AVATAR_COSMETIC_IMAGES[id], ...AVATAR_ADDITION_IMAGES[id], ...options,
});

// One catalogue defines the shop price and the anatomical placement on both bases.
// Placements are in the common 1024px avatar coordinates, before portrait framing.
export const AVATAR_COSMETICS = Object.freeze([
  cosmetic("pirate_eyepatch", "Bandeau pirate", 1000, {
    layer: "face", clipToHead: true, attachment: "left_eye", rotation: -23,
    placement: { femme: [276, 313, 483], homme: [276, 313, 483] },
  }),
  cosmetic("freckles", "Taches de rousseur", 500, {
    layer: "face", clipToHead: true,
    placement: { femme: [359, 435, 306], homme: [359, 435, 306] },
  }),
  cosmetic("nose_piercing", "Piercing de nez", 500, {
    layer: "face", attachment: "nose",
    placement: { femme: [528, 447, 20], homme: [528, 447, 20] },
  }),
  cosmetic("ear_piercing", "Piercing d’oreille", 500, {
    layer: "face",
    placement: { femme: [308, 478, 32], homme: [305, 463, 32] },
  }),
  cosmetic("earrings_hoops", "Grandes créoles dorées", 500, {
    layer: "face", pair: true,
    placement: { femme: [295, 478, 58], homme: [292, 463, 58] },
  }),
  cosmetic("earrings_pearls", "Perles pendantes", 500, {
    layer: "face", pair: true,
    placement: { femme: [308, 478, 32], homme: [305, 463, 32] },
  }),
  cosmetic("earrings_stars", "Étoiles pendantes", 500, {
    layer: "face", pair: true,
    placement: { femme: [302, 478, 44], homme: [299, 463, 44] },
  }),
  cosmetic("earrings_gems", "Pendantes émeraude", 500, {
    layer: "face", pair: true,
    placement: { femme: [305, 478, 38], homme: [302, 463, 38] },
  }),
  cosmetic("scar", "Balafre", 500, {
    layer: "face", clipToHead: true, repositionable: true,
    placement: { femme: [615, 420, 32], homme: [615, 420, 32] },
  }),
  cosmetic("diamond_necklace", "Collier de diamants", 2000, {
    layer: "neck",
    placement: { femme: [408, 605, 210], homme: [421, 604, 184] },
  }),
]);

export const AVATAR_COSMETIC_PRICES = Object.freeze(Object.fromEntries(
  AVATAR_COSMETICS.map(part => [part.id, part.price])
));
export const SCAR_ADJUSTMENT_RANGES = Object.freeze({ scarDx: [-270, 50], scarDy: [-230, 110], scarRotation: [-90, 90] });
