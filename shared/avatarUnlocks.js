import { AVATAR_OBJECTIVES, getAvatarObjectiveProgress } from "./avatarObjectives.js";
import { DONOR_AVATAR_REWARD } from "./supportDonors.js";
import { hasAvatarEyelids } from "./avatarEyes.js";
import { getWeeklyAvatarAura } from "./avatarWeeklyAuras.js";
import { AVATAR_COSMETIC_PRICES } from "./avatarCosmetics.js";
import { getAvatarPartIds } from "./avatarSelections.js";
const EXPENSIVE_HATS = new Set(["cowboy", "trilby", "fedora", "boater", "bowler", "panama"]);
const PRICES = { eyes: 1000, hair: 1000, brows: 500, nose: 500, mouths: 500, facialhair: 500, clothes: 5000, backdrops: 5000 };
export const CROWN_WINS_REQUIRED = 100;
export const avatarUnlockKey = (family, id) => `${family}:${id}`;
export const hasUnlockedAvatarEyes = inventory => Object.entries(inventory?.owned || {}).some(([key, owned]) => owned && key.startsWith("eyes:"));

export function getAvatarUnlockRule(family, id, part) {
  if (!id || (family === "base" && ["homme", "femme"].includes(id))) return { type: "free" };
  if (family === "lashes") return { type: "prerequisite", label: "Les cils sont offerts après le déblocage d’une paire d’yeux. Choisis des yeux avec paupières pour les porter." };
  if (family === "accessories" && id === "tiger_plush") return { type: "gobblars", price: 1000000 };
  if (family === "accessories" && Object.hasOwn(AVATAR_COSMETIC_PRICES, id)) return { type: "gobblars", price: AVATAR_COSMETIC_PRICES[id] };
  const weekly = family === "auras" && getWeeklyAvatarAura(id);
  if (weekly) return { type: "objective", objective: "weekly_race", rank: weekly.rank, label: `Termine à la ${weekly.place} place de la course hebdomadaire. Cette aura est disponible la semaine suivante, jusqu’au lundi à 00 h (heure de Paris). Elle est renouvelée si tu conserves ce rang.` };
  if (family === DONOR_AVATAR_REWARD.family && id === DONOR_AVATAR_REWARD.id) {
    return { type: "objective", objective: "donor", label: DONOR_AVATAR_REWARD.description };
  }
  const objective = Object.entries(AVATAR_OBJECTIVES).find(([, reward]) => reward.family === family && reward.id === id);
  if (objective) return { type: "objective", objective: objective[0], required: objective[1].target, label: objective[1].description };
  if (family === "headwear") return { type: "gobblars", price: EXPENSIVE_HATS.has(id) ? 2000 : 1000 };
  if (family === "glasses") return { type: "gobblars", price: id.startsWith("soleil_") ? 2000 : 1000 };
  if (family === "auras") return { type: "objective", objective: part?.unlock?.type || "future", label: part?.unlock?.label || "Objectif à venir", pending: true };
  if (PRICES[family]) return { type: "gobblars", price: PRICES[family] };
  return { type: "objective", label: "Indisponible pour le moment", pending: true };
}

export function isAvatarPartUnlocked(inventory, family, id, part) {
  if (family === "auras" && getWeeklyAvatarAura(id)) return (inventory?.temporary?.[avatarUnlockKey(family, id)] || 0) > Date.now();
  if (family === "lashes" && id) return hasUnlockedAvatarEyes(inventory);
  const rule = getAvatarUnlockRule(family, id, part);
  return rule.type === "free" || !!inventory?.owned?.[avatarUnlockKey(family, id)]
    || (!!AVATAR_OBJECTIVES[rule.objective] && getAvatarObjectiveProgress(inventory, rule.objective) >= rule.required);
}

export function getLockedAvatarParts(avatar, catalog, inventory) {
  if (!avatar) return [];
  return ["base", ...Object.keys(catalog.families)].flatMap(family => [...new Set(getAvatarPartIds(avatar, family))].flatMap(id => {
    const part = family === "base" ? { id, label: id === "femme" ? "Visage femme" : "Visage homme" }
      : catalog.families[family]?.find(item => item.id === id);
    if (family === "lashes" && !hasAvatarEyelids(avatar.eyes)) return [{ family, id, type: "prerequisite", label: "Cils : choisis des yeux avec paupières" }];
    if (!part || isAvatarPartUnlocked(inventory, family, id, part)) return [];
    const rule = getAvatarUnlockRule(family, id, part);
    return [{ ...rule, family, id, label: part.label, description: rule.label }];
  }));
}
