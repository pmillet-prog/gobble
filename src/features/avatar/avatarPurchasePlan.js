import { getLockedAvatarParts, isAvatarPartUnlocked } from "../../../shared/avatarUnlocks.js";
import { normalizeAvatar } from "../../../shared/avatarConfiguration.js";
import { removeAvatarParts } from "../../../shared/avatarSelections.js";

export function getAvatarPurchasePlan(avatar, catalog, inventory) {
  const locked = catalog && inventory ? getLockedAvatarParts(avatar, catalog, inventory) : [];
  const purchasable = locked.filter(item => item.type === "gobblars");
  const unavailable = locked.filter(item => item.type !== "gobblars");
  const total = purchasable.reduce((sum, item) => sum + item.price, 0);
  return { purchasable, unavailable, total, missing: Math.max(0, total - (inventory?.balance || 0)) };
}

// Wearing one purchase must never equip or buy other unpaid trials implicitly.
export function getOwnedAvatarAppearance(draft, saved, catalog, inventory) {
  if (!isAvatarPartUnlocked(inventory, "base", draft.base)) return null;
  const locked = getLockedAvatarParts(draft, catalog, inventory);
  const next = { ...removeAvatarParts(draft, locked.filter(item => item.family === "accessories")) };
  for (const item of locked.filter(item => item.family !== "accessories")) {
    const previous = saved?.[item.family];
    next[item.family] = previous && isAvatarPartUnlocked(inventory, item.family, previous) ? previous : "";
  }
  const normalized = normalizeAvatar(next, catalog);
  // A change of base may select a clothing counterpart that is still locked.
  return normalizeAvatar(removeAvatarParts(normalized, getLockedAvatarParts(normalized, catalog, inventory)), catalog);
}
