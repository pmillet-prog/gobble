// Skin relief is included with the chosen face; it is not a separate purchase.
export const AVATAR_SKINS = Object.freeze([
  { id: "classic", label: "Classique", description: "Le visage d’origine." },
  { id: "chubby", label: "Joufflu", description: "Joues rondes et volumes doux." },
  { id: "slim", label: "Fin", description: "Un visage mince aux joues plus fines." },
  { id: "defined", label: "Traits marqués", description: "Pommettes saillantes et joues creusées." },
  { id: "crows_feet", label: "Pattes-d’oie", description: "Quelques rides légères au coin des yeux." },
  { id: "wrinkled", label: "Ridé", description: "Rides du front, plis et reliefs de la peau." },
]);

export const isAvatarSkin = id => AVATAR_SKINS.some(skin => skin.id === id);
export function avatarSkinFile(base, skinStyle) {
  if (!["homme", "femme"].includes(base) || !isAvatarSkin(skinStyle) || skinStyle === "classic") return null;
  return ["slim", "crows_feet"].includes(skinStyle)
    ? `candidates/skins/lot_014/2026-10-06-visages/${base}_${skinStyle}_v01.png`
    : `skins/2026-09-23/${base}_${skinStyle}.png`;
}
