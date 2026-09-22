// Saved avatars used a single accessory id before multiple selection was added.
export function getAvatarPartIds(avatar, family) {
  const value = avatar?.[family];
  return family === "accessories" && Array.isArray(value) ? value : value ? [value] : [];
}

export function selectAvatarPart(avatar, family, id, { toggle = true } = {}) {
  if (family !== "accessories") return { ...avatar, [family]: id };
  const ids = getAvatarPartIds(avatar, family);
  const accessories = !id ? [] : ids.includes(id)
    ? toggle ? ids.filter(value => value !== id) : ids
    : [...ids, id];
  return { ...avatar, accessories };
}

export function removeAvatarParts(avatar, parts) {
  return parts.reduce((next, { family, id }) => family === "accessories"
    ? { ...next, accessories: getAvatarPartIds(next, family).filter(value => value !== id) }
    : { ...next, [family]: "" }, avatar);
}
