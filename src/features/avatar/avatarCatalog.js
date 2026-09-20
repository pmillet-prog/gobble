import { evictAvatarResource } from "./avatarAssetCache.js";
import { withAvatarAccessories } from "../../../shared/avatarObjectives.js";
let catalogPromise;

export function loadAvatarCatalog() {
  if (!catalogPromise) catalogPromise = evictAvatarResource("/avatars/v1/catalog.json").then(() => fetch("/avatars/v1/catalog.json", { cache: "reload" })).then(response => {
    if (!response.ok) throw Error("Les pièces de l’avatar sont indisponibles.");
    return response.json();
  }).then(withAvatarAccessories).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}
