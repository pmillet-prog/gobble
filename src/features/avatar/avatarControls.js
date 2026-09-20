import { AVATAR_ADJUSTMENT_RANGES } from "../../../shared/avatarConfiguration.js";
export { AVATAR_ADJUSTMENT_DEFAULTS, normalizeAvatarAdjustments } from "../../../shared/avatarConfiguration.js";

const slider = (key, label, percent = false, range = AVATAR_ADJUSTMENT_RANGES[key]) => ({
  key, label, min: range[0], max: range[1], step: percent ? .01 : 1,
  defaultValue: percent ? 1 : 0, unit: percent ? "%" : "px", multiplier: percent ? 100 : 1,
});

export const AVATAR_SLIDERS = {
  eyes: [slider("irisScale", "Taille de l’iris", true), slider("openness", "Ouverture des yeux", true), slider("spacing", "Écartement"), slider("dx", "Position horizontale"), slider("dy", "Position verticale")],
  brows: [slider("browWidth", "Largeur", true), slider("browThickness", "Épaisseur", true), slider("browDy", "Hauteur")],
  nose: [slider("noseScale", "Taille", true), slider("noseDx", "Position horizontale"), slider("noseDy", "Position verticale")],
  mouths: [slider("mouthScale", "Taille", true), slider("mouthWidth", "Largeur", true), slider("mouthDy", "Hauteur")],
  hair: [slider("hairScale", "Taille", true), slider("hairDx", "Position horizontale"), slider("hairDy", "Position verticale")],
  headwear: [slider("headwearScale", "Taille", true), slider("headwearDx", "Position horizontale"), slider("headwearDy", "Position verticale")],
  glasses: [slider("glassesScale", "Taille", true), slider("glassesDx", "Position horizontale"), slider("glassesDy", "Position verticale")],
  backdrops: [{ key: "backdropTint", label: "Intensité de la teinte", min: 0, max: .5, step: .01, defaultValue: 0, multiplier: 100, unit: "%" }],
  scar: [slider("scarDx", "Horizontal"), slider("scarDy", "Vertical"), { ...slider("scarRotation", "Inclinaison"), unit: "°" }],
};
export const ALL_AVATAR_SLIDERS = Object.values(AVATAR_SLIDERS).flat();
// Retain saved hair/hat adjustments for compatibility without exposing sliders.
export const getAvatarSliders = (category, avatar) => category === "accessories"
  ? (avatar?.accessories === "scar" ? AVATAR_SLIDERS.scar : [])
  : ["hair", "headwear"].includes(category) ? [] : AVATAR_SLIDERS[category] || [];

export function getAvatarChoices(catalog, family, base) {
  return (catalog?.families[family] || []).filter(part =>
    (family !== "mouths" || part.expression === "neutral") &&
    (family !== "clothes" || part.base === base)
  );
}
