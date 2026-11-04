import { validateInfortuneFinaleBank } from "../../shared/infortuneFinaleCatalog.js";

const POOL_PATH = "/data/infortune-finale-bank.json";

// Older service workers cached Vite's JSON module as media under its bare URL,
// dropping ?import and ?t=. Remove only that entry before requesting the module.
// This also repairs tabs still controlled by the previous service worker.
export async function clearCachedFinalePool(cacheStorage, resourceURL) {
  if (!cacheStorage) return;
  const key = new URL(resourceURL);
  key.search = "";
  key.hash = "";
  const names = await cacheStorage.keys();
  await Promise.all(names.filter(name => name.startsWith("gobble-cache-")).map(async name => {
    const cache = await cacheStorage.open(name);
    await cache.delete(key.href);
  }));
}

export async function loadFinalePool() {
  if (import.meta.env?.DEV) await clearCachedFinalePool(globalThis.caches, new URL(POOL_PATH, globalThis.location.href));
  // Keep this dynamic: a static import is evaluated before the cache migration.
  const { default: bank } = await import("../../data/infortune-finale-bank.json");
  return validateInfortuneFinaleBank(bank);
}
