// Persisted configuration contract, shared by the editor and account API.
import { SCAR_ADJUSTMENT_RANGES } from "./avatarCosmetics.js";
import { getAvatarPartIds } from "./avatarSelections.js";
import { isAvatarSkin } from "./avatarSkins.js";
export const AVATAR_ADJUSTMENT_RANGES = Object.freeze({
  silhouetteWidth: [.8, 1.15],
  irisScale: [.6, 1.3], openness: [.3, 1.2], spacing: [-12, 12], dx: [-8, 8], dy: [-10, 10],
  browWidth: [.75, 1.25], browThickness: [.6, 1.5], browDy: [-12, 12],
  noseScale: [.9, 1.1], noseDx: [-8, 8], noseDy: [-8, 8],
  mouthScale: [.75, 1.25], mouthWidth: [.75, 1.3], mouthDy: [-20, 30],
  hairScale: [.95, 1.05], hairDx: [-12, 12], hairDy: [-15, 15],
  headwearScale: [.95, 1.05], headwearDx: [-12, 12], headwearDy: [-15, 15],
  glassesScale: [.9, 1.1], glassesDx: [-12, 12], glassesDy: [-20, 20], backdropTint: [0, .5],
  ...SCAR_ADJUSTMENT_RANGES,
});
export const isAvatarRatio = key => /Scale$|Width$|Thickness$|^openness$/.test(key);
export const AVATAR_ADJUSTMENT_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.keys(AVATAR_ADJUSTMENT_RANGES).map(key => [key, isAvatarRatio(key) ? 1 : 0])
));
export function normalizeAvatarAdjustments(source) {
  return Object.fromEntries(Object.entries(AVATAR_ADJUSTMENT_RANGES).map(([key, [min, max]]) => {
    const value = Number.isFinite(source[key]) ? source[key] : AVATAR_ADJUSTMENT_DEFAULTS[key];
    const unit = isAvatarRatio(key) || key === "backdropTint" ? 100 : 1;
    return [key, Number(Math.max(min, Math.min(max, Math.round(value * unit) / unit)).toFixed(2))];
  }));
}

export const DEFAULT_AVATAR = Object.freeze({
  version: 1, base: "homme", eyes: "open", brows: "straight", nose: "short", accessories: Object.freeze([]),
  mouths: "thin_neutral", hair: "quiff", headwear: "", headwearHair: "auto", glasses: "", lashes: "", facialhair: "", clothes: "", backdrops: "", auras: "",
  tone: "native", skinStyle: "classic", customColor: "#f6bd91", hairColor: "#653a23", irisColor: "#658c6c",
  backgroundColor: "#204e63", mouthColor: "", headwearColor: "", glassesColor: "", clothesColor: "", facialhairColor: "#653a23", backdropColor: "#597ea5",
  ...AVATAR_ADJUSTMENT_DEFAULTS,
});

const PART_KEYS = ["eyes", "brows", "lashes", "nose", "mouths", "hair", "headwear", "glasses", "facialhair", "clothes", "backdrops", "auras", "accessories"];
const COLOR_KEYS = ["customColor", "hairColor", "irisColor", "backgroundColor", "mouthColor", "headwearColor", "glassesColor", "clothesColor", "facialhairColor", "backdropColor"];

// A new player's canvas contains only the chosen base. Existing saved defaults
// remain unchanged; explicitly empty features must survive saving and rendering.
export function createBlankAvatar(base = "homme") {
  return normalizeAvatar({ base, ...Object.fromEntries(PART_KEYS.map(key => [key, ""])) });
}

export function normalizeAvatar(value, catalog) {
  const source = value && typeof value === "object" ? value : {};
  const next = { ...DEFAULT_AVATAR, ...normalizeAvatarAdjustments(source), base: source.base === "femme" ? "femme" : "homme" };
  next.tone = source.tone === "custom" ? "custom" : "native";
  if (isAvatarSkin(source.skinStyle)) next.skinStyle = source.skinStyle;
  if (["auto", "under", "all", "hide"].includes(source.headwearHair)) next.headwearHair = source.headwearHair;
  for (const key of COLOR_KEYS) if (/^#[\da-f]{6}$/i.test(source[key])) next[key] = source[key];
  for (const key of ["hairColor", "facialhairColor"]) if (source[key] === "") next[key] = "";
  for (const key of PART_KEYS) {
    if (key === "accessories") {
      next.accessories = [...new Set(getAvatarPartIds(source, key).filter(id =>
        typeof id === "string" && /^[a-z0-9_]{1,60}$/.test(id)
        && (!catalog || catalog.families.accessories?.some(part => part.id === id))))];
      continue;
    }
    const id = source[key];
    if (typeof id === "string" && /^[a-z0-9_]{0,60}$/.test(id)) next[key] = id;
    if (key === "mouths") next[key] = next[key].replace(/_(happy|sad|surprised)$/, "_neutral");
    if (catalog && next[key] && !catalog.families[key]?.some(part => part.id === next[key])) next[key] = DEFAULT_AVATAR[key];
  }
  if (next.base === "femme") next.facialhair = "";
  if (source.facialhairColor === undefined) next.facialhairColor = next.hairColor;
  if (catalog && next.clothes) {
    const outfit = catalog.families.clothes?.find(part => part.id === next.clothes);
    if (outfit?.base !== next.base) next.clothes = catalog.families.clothes?.find(part => part.id === outfit?.counterpart && part.base === next.base)?.id || "";
  }
  // Read-only entitlement supplied by the API, not part of the saved character.
  const lease = source.weeklyAura;
  if (lease?.id === next.auras && Number.isSafeInteger(lease.userId) && lease.userId > 0 && Number.isFinite(lease.expiresAt)) {
    next.weeklyAura = { userId: lease.userId, id: lease.id, expiresAt: lease.expiresAt };
  }
  return next;
}
