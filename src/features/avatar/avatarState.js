export { DEFAULT_AVATAR, normalizeAvatar, createBlankAvatar } from "../../../shared/avatarConfiguration.js";

export function isOwnPlayerProfile(viewerUserId, profileUserId) {
  const viewer = Number(viewerUserId);
  return Number.isInteger(viewer) && viewer > 0 && viewer === Number(profileUserId);
}
