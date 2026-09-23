import { readFile } from "node:fs/promises";
import { DEFAULT_AVATAR, normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { withAvatarAccessories } from "../../shared/avatarObjectives.js";
import { SCAR_ADJUSTMENT_RANGES } from "../../shared/avatarCosmetics.js";

let catalogPromise;
export function loadCatalog() {
  if (!catalogPromise) catalogPromise = readFile(new URL("../../public/avatars/v1/catalog.json", import.meta.url), "utf8")
    .then(JSON.parse).then(withAvatarAccessories).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}

export async function validateAvatarConfiguration(value) {
  // Clients may echo display metadata; it never confers ownership or enters storage.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { weeklyAura, ...configuration } = value;
    value = configuration;
  }
  if (!value || Array.isArray(value) || typeof value !== "object" || value.version !== 1
    || JSON.stringify(value).length > 8192
    || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_AVATAR, key))) return null;
  const normalized = normalizeAvatar(value, await loadCatalog());
  // Reject malformed or unknown parts rather than silently saving a different face.
  if (Object.keys(DEFAULT_AVATAR).some(key => {
    // Older clients do not send the newly introduced scar controls.
    if (value[key] === undefined && Object.hasOwn(SCAR_ADJUSTMENT_RANGES, key)) return false;
    if (key === "skinStyle" && value[key] === undefined) return false; // Existing accounts/older clients keep the classic face.
    if (key === "silhouetteWidth" && value[key] === undefined) return false; // Existing silhouettes stay at 100%.
    if (key === "accessories") {
      const ids = value[key] === undefined || value[key] === "" ? []
        : typeof value[key] === "string" ? [value[key]] : value[key];
      return JSON.stringify(ids) !== JSON.stringify(normalized[key]);
    }
    return value[key] !== normalized[key];
  })) return null;
  return normalized;
}
