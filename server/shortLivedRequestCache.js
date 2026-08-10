export function createShortLivedRequestCache({ ttlMs = 1000, maxEntries = 32 } = {}) {
  const safeTtlMs = Math.max(0, Math.round(Number(ttlMs) || 0));
  const safeMaxEntries = Math.max(1, Math.round(Number(maxEntries) || 1));
  const entries = new Map();

  function prune(now = Date.now()) {
    for (const [key, entry] of entries.entries()) {
      if (!entry?.promise && (!entry?.hasValue || entry.expiresAt <= now)) {
        entries.delete(key);
      }
    }
    if (entries.size <= safeMaxEntries) return;
    for (const [key, entry] of entries.entries()) {
      if (entries.size <= safeMaxEntries) break;
      if (!entry?.promise) entries.delete(key);
    }
  }

  async function getOrLoad(rawKey, load) {
    const key = String(rawKey ?? "");
    const now = Date.now();
    const current = entries.get(key);
    if (current?.hasValue && current.expiresAt > now) {
      return current.value;
    }
    if (current?.promise) {
      return await current.promise;
    }

    const entry = {
      hasValue: false,
      value: undefined,
      expiresAt: 0,
      promise: null,
    };
    const promise = Promise.resolve()
      .then(load)
      .then((value) => {
        entry.hasValue = true;
        entry.value = value;
        entry.expiresAt = Date.now() + safeTtlMs;
        entry.promise = null;
        entries.delete(key);
        entries.set(key, entry);
        prune();
        return value;
      })
      .catch((err) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw err;
      });

    entry.promise = promise;
    entries.set(key, entry);
    prune(now);
    return await promise;
  }

  function clear() {
    entries.clear();
  }

  return { getOrLoad, clear };
}
