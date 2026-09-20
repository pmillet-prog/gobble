export const WEEKLY_AVATAR_AURAS = Object.freeze([
  { id: "weekly_gold", rank: 1, label: "Aura de la course hebdo · Or", place: "1re" },
  { id: "weekly_silver", rank: 2, label: "Aura de la course hebdo · Argent", place: "2e" },
  { id: "weekly_bronze", rank: 3, label: "Aura de la course hebdo · Bronze", place: "3e" },
]);
export const getWeeklyAvatarAura = id => WEEKLY_AVATAR_AURAS.find(aura => aura.id === id);

export function applyWeeklyAuraAppearance(avatar, inventory, now = Date.now()) {
  if (!avatar || !getWeeklyAvatarAura(avatar.auras)) return avatar;
  const expiresAt = inventory?.temporary?.[`auras:${avatar.auras}`] || 0;
  return expiresAt > now
    ? { ...avatar, weeklyAura: { userId: inventory.userId, id: avatar.auras, expiresAt } }
    : { ...avatar, auras: "", weeklyAura: undefined };
}

// Keep a visible portrait in sync at midnight, including an idle/offline tab.
// A fresh broadcast can extend the same medal, but never changes the chosen aura.
export function getWeeklyAuraDeadline(avatar, snapshot) {
  const lease = avatar?.weeklyAura;
  if (!lease || lease.id !== avatar.auras) return 0; // Unrestricted atelier preview.
  if (snapshot && snapshot.expiresAt > lease.expiresAt) {
    return snapshot.grants?.[lease.userId] === lease.id ? snapshot.expiresAt : 1;
  }
  return lease.expiresAt;
}
