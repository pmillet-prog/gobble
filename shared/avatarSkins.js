// Skin relief is included with the chosen face; it is not a separate purchase.
export const AVATAR_SKINS = Object.freeze([
  { id: "classic", label: "Classique", description: "Le visage d’origine." },
  { id: "chubby", label: "Joufflu", description: "Joues rondes et volumes doux." },
  { id: "defined", label: "Traits marqués", description: "Pommettes saillantes et joues creusées." },
  { id: "wrinkled", label: "Ridé", description: "Rides du front, plis et reliefs de la peau." },
]);

export const isAvatarSkin = id => AVATAR_SKINS.some(skin => skin.id === id);
export function avatarSkinFile(base, skinStyle) {
  return ["homme", "femme"].includes(base) && isAvatarSkin(skinStyle) && skinStyle !== "classic"
    ? `skins/2026-09-23/${base}_${skinStyle}.png` : null;
}
