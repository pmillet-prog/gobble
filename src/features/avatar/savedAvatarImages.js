import { loadAvatarImage } from "./avatarAssetCache.js";

// Shared across profiles, recaps, podiums and the wheel. Eviction drops cache
// ownership only: a mounted scene may still be using the decoded image.
export function createSavedAvatarImageCache({ loadImage = loadAvatarImage, maxBytes = 32 * 1024 * 1024 } = {}) {
  const entries = new Map();
  let bytes = 0;
  function trim() {
    for (const [key, entry] of entries) {
      if (bytes <= maxBytes) break;
      if (!entry.bytes) continue;
      bytes -= entry.bytes;
      entries.delete(key);
    }
  }
  return {
    load(url) {
      let entry = entries.get(url);
      if (entry) { entries.delete(url); entries.set(url, entry); return entry.promise; }
      entry = { bytes: 0, promise: null };
      entries.set(url, entry);
      entry.promise = Promise.resolve().then(() => loadImage(url)).then(image => {
        if (entries.get(url) === entry) {
          entry.bytes = image.width * image.height * 4;
          bytes += entry.bytes;
          trim();
        }
        return image;
      }).catch(error => { if (entries.get(url) === entry) entries.delete(url); throw error; });
      return entry.promise;
    },
    clear() { entries.clear(); bytes = 0; },
  };
}

export const savedAvatarImages = createSavedAvatarImageCache();
