import { defaultAvatarConfig } from "./avatarPresets.js";

export const avatarOptions = {
  genderPresentation: ["masculine", "feminine"],
  bodyShape: ["blob", "round", "square"],
  eyeStyle: ["round", "sleepy", "wide"],
  pupilStyle: ["normal"],
  mouthStyle: ["smile", "neutral", "sad", "open"],
  hair: ["short", "bob", "curly", "none"],
  horns: ["none", "small", "curved"],
  pattern: ["none", "spots", "stripes"],
  accessory: ["none", "glasses", "crown"],
  mood: ["idle", "happy", "annoyed", "win", "lose"],
};

export const optionLabels = {
  masculine: "Masculin",
  feminine: "Féminin",
  blob: "Blob",
  round: "Rond",
  square: "Carre",
  sleepy: "Endormi",
  wide: "Grand",
  normal: "Normal",
  smile: "Sourire",
  neutral: "Neutre",
  sad: "Triste",
  open: "Ouverte",
  none: "Aucun",
  short: "Court",
  bob: "Carre",
  curly: "Boucle",
  small: "Petites",
  curved: "Courbees",
  spots: "Pois",
  stripes: "Rayures",
  glasses: "Lunettes",
  crown: "Couronne",
  idle: "Idle",
  happy: "Happy",
  annoyed: "Annoyed",
  win: "Win",
  lose: "Lose",
};

function pickOption(value, key) {
  const values = avatarOptions[key] || [];
  return values.includes(value) ? value : values[0];
}

function normalizeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

export function normalizeAvatarConfig(config = {}) {
  const source = Object.assign({}, defaultAvatarConfig, config || {});
  return {
    bodyShape: pickOption(source.bodyShape, "bodyShape"),
    genderPresentation: pickOption(source.genderPresentation, "genderPresentation"),
    bodyColor: normalizeColor(source.bodyColor, defaultAvatarConfig.bodyColor),
    secondaryColor: normalizeColor(source.secondaryColor, defaultAvatarConfig.secondaryColor),
    skinColor: normalizeColor(source.skinColor, defaultAvatarConfig.skinColor),
    hairColor: normalizeColor(source.hairColor, defaultAvatarConfig.hairColor),
    eyeStyle: pickOption(source.eyeStyle, "eyeStyle"),
    pupilStyle: pickOption(source.pupilStyle, "pupilStyle"),
    mouthStyle: pickOption(source.mouthStyle, "mouthStyle"),
    accessory: pickOption(source.accessory, "accessory"),
    hair: pickOption(source.hair, "hair"),
    horns: pickOption(source.horns, "horns"),
    pattern: pickOption(source.pattern, "pattern"),
  };
}

export function normalizeMood(mood) {
  return avatarOptions.mood.includes(mood) ? mood : "idle";
}

export function getReadableLabel(value) {
  return optionLabels[value] || value;
}
