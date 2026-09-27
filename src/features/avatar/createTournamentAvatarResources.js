// One bounded cache for the active mini-tournament. No polling or round refresh.
export function createTournamentAvatarResources({
  fetchImpl = (...args) => fetch(...args),
  createObjectURL = blob => URL.createObjectURL(blob),
  revokeObjectURL = url => URL.revokeObjectURL(url),
  decodeImage = async url => { const image = new Image(); image.src = url; await image.decode(); },
  loadPodium = () => import("../celebration/prepareTournamentPodium.js"),
} = {}) {
  let current = null;
  const listeners = new Map();
  const notify = id => listeners.get(id)?.forEach(listener => listener());

  function releasePodium(key) {
    const entry = current?.podium;
    if (!entry || entry.key !== key || entry.released) return;
    entry.released = true;
    entry.controller.abort();
    entry.value?.release();
    entry.value = null;
    entry.promise = null;
    entry.openingPromise = null;
  }

  function configure(key) {
    key = String(key || "");
    if ((current?.key || "") === key) return;
    if (current) {
      current.controller.abort();
      releasePodium(current.podium?.key);
      for (const entry of current.thumbnails.values()) if (entry.url) revokeObjectURL(entry.url);
    }
    current = key ? { key, controller: new AbortController(), thumbnails: new Map(), podium: null,
      pending: Object.freeze({ status: "loading", url: "", key }) } : null;
    for (const id of listeners.keys()) notify(id);
  }

  function ensureThumbnail(userId, source) {
    const scope = current;
    if (!scope || !source || !userId || scope.thumbnails.has(userId)) return;
    scope.thumbnails.set(userId, scope.pending);
    let objectUrl = "";
    // Revalidate once at the next tournament, even if a versioned HTTP response
    // is still fresh in the browser cache. Subsequent rounds use only the blob.
    void fetchImpl(source, { credentials: "include", cache: "no-cache", signal: scope.controller.signal }).then(async response => {
      if (response.status === 204) return "";
      if (!response.ok || !/^image\//i.test(response.headers.get("content-type") || "")) throw new Error("avatar_thumbnail_unavailable");
      const blob = await response.blob();
      scope.controller.signal.throwIfAborted();
      objectUrl = createObjectURL(blob);
      await decodeImage(objectUrl);
      return objectUrl;
    }).then(url => {
      if (current !== scope || scope.controller.signal.aborted) {
        if (objectUrl) revokeObjectURL(objectUrl);
        return;
      }
      scope.thumbnails.set(userId, Object.freeze({ status: url ? "ready" : "missing", url }));
      notify(userId);
    }).catch(() => {
      if (objectUrl) revokeObjectURL(objectUrl);
      if (current !== scope || scope.controller.signal.aborted) return;
      scope.thumbnails.set(userId, Object.freeze({ status: "failed", url: "" }));
      notify(userId);
    });
  }

  function preparePodium(key, entrants, { retry = false } = {}) {
    const scope = current;
    if (!scope || !key) return null;
    if (scope.podium?.key === key && (scope.podium.released || !retry || scope.podium.status !== "failed")) return scope.podium;
    releasePodium(scope.podium?.key);
    const entry = { key, controller: new AbortController(), value: null, released: false,
      status: "loading", promise: null, openingPromise: null };
    scope.podium = entry;
    entry.promise = loadPodium().then(module => {
      entry.controller.signal.throwIfAborted();
      return module.prepareTournamentPodium(entrants, { signal: entry.controller.signal });
    }).then(value => {
      if (entry.released || current !== scope) { value.release(); return null; }
      entry.value = value;
      entry.status = "ready";
      return value;
    }).catch(error => {
      entry.status = "failed";
      throw error;
    });
    // Warming is optional; opening the podium retries a failure once.
    void entry.promise.catch(() => {});
    return entry;
  }

  function openPodium(key, entrants, { retry = false } = {}) {
    const scope = current;
    const entry = preparePodium(key, entrants, { retry });
    if (!entry || entry.released) return Promise.resolve(null);
    if (!entry.openingPromise) {
      // Share both pending work and the single automatic recovery across mounts.
      // A manual retry makes one further attempt, without restarting ready work.
      entry.openingPromise = retry ? entry.promise : entry.promise.catch(error => {
        if (current !== scope || scope.podium !== entry || entry.released) return null;
        const next = preparePodium(key, entrants, { retry: true });
        if (next === entry) throw error;
        next.openingPromise = next.promise;
        return next.promise;
      });
    }
    return entry.openingPromise;
  }

  return Object.freeze({
    configure, preparePodium, openPodium, releasePodium, ensureThumbnail,
    dispose: () => configure(""),
    thumbnail: userId => current && userId ? current.thumbnails.get(userId) || current.pending : null,
    subscribeThumbnail(userId, listener) {
      if (!listeners.has(userId)) listeners.set(userId, new Set());
      listeners.get(userId).add(listener);
      return () => { const set = listeners.get(userId); set?.delete(listener); if (!set?.size) listeners.delete(userId); };
    },
  });
}
