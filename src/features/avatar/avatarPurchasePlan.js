import { getLockedAvatarParts, isAvatarPartUnlocked } from "../../../shared/avatarUnlocks.js";
import { normalizeAvatar } from "../../../shared/avatarConfiguration.js";

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
  const next = { ...draft };
  for (const item of getLockedAvatarParts(next, catalog, inventory)) {
    const previous = saved?.[item.family];
    next[item.family] = previous && isAvatarPartUnlocked(inventory, item.family, previous) ? previous : "";
  }
  const normalized = normalizeAvatar(next, catalog);
  // A change of base may select a clothing counterpart that is still locked.
  for (const item of getLockedAvatarParts(normalized, catalog, inventory)) normalized[item.family] = "";
  return normalizeAvatar(normalized, catalog);
}
