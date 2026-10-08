const ROOT = "clothes/2026-10-08/";
const definitions = [
  ["dungarees", "Salopette et T-shirt", "Salopette", "T-shirt", "#3e7190", "#eee0c7"],
  ["quilted_vest", "Gilet matelassé et pull", "Gilet", "Pull", "#8b4850", "#e6dfce"],
  ["kimono", "Kimono et ceinture", "Kimono", "Ceinture et haut", "#637ca1", "#d9ae68"],
  ["poncho", "Poncho à col contrasté", "Poncho", "Col et sous-pull", "#c09362", "#56766c"],
  ["varsity", "Veste universitaire", "Corps de la veste", "Manches et bordures", "#843e4d", "#e4ddcd"],
  ["safari", "Saharienne et haut", "Saharienne", "Haut", "#789064", "#e7d6b3"],
  ["raincoat", "Ciré et pull", "Ciré", "Pull et doublure", "#dfb53a", "#3d607d"],
  ["sherpa", "Veste en velours et col fourré", "Veste", "Col et doublure", "#8e6754", "#eee3cb"],
  ["sweater_vest", "Pull sans manches et chemise", "Pull sans manches", "Chemise", "#657953", "#d8dfeb"],
  ["bow_blouse", "Blouse à lavallière", "Blouse", "Lavallière", "#a97797", "#eee0d6"],
  ["waistcoat", "Gilet ajusté et chemise", "Gilet", "Chemise", "#555369", "#d9d2bf"],
  ["track_jacket", "Veste de survêtement rétro", "Veste", "Empiècements", "#3f7168", "#e1b462"],
];

// One unisex artwork per design; stable base-specific IDs retain the existing
// clothing ownership/counterpart contract when the player changes face.
export const AVATAR_ADDITIONAL_CLOTHES = Object.freeze(definitions.flatMap(([model, label, primary, secondary, firstColor, secondColor]) =>
  ["homme", "femme"].map(base => Object.freeze({
    id: `${model}_${base}`, model_id: model, label: `${label} · ${base === "homme" ? "Homme" : "Femme"}`,
    base, counterpart: `${model}_${base === "homme" ? "femme" : "homme"}`,
    file: `${ROOT}${model}.png`, thumbnail: `${ROOT}thumbnails/${model}.webp`,
    mask: `${ROOT}masks/${model}_primary.png`, masks: { secondary: `${ROOT}masks/${model}_secondary.png` }, layers: {},
    dualColor: true,
    colorSlots: [
      { key: "clothesColor", label: `Couleur — ${primary}` },
      { key: "clothesSecondaryColor", label: `Couleur — ${secondary}` },
    ],
    colorDefaults: { clothesColor: firstColor, clothesSecondaryColor: secondColor },
  }))
));

export function withAdditionalAvatarClothes(parts = []) {
  const ids = new Set(AVATAR_ADDITIONAL_CLOTHES.map(part => part.id));
  return [...parts.filter(part => !ids.has(part.id)), ...AVATAR_ADDITIONAL_CLOTHES];
}
