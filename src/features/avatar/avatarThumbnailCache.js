// Decoded blobs survive list remounts and tournament changes. Actual avatar
// revisions (or reconnect refreshes) select a new entry; no periodic polling.
export function createAvatarThumbnailCache({ fetchImpl = (...args) => fetch(...args),
  createURL = blob => URL.createObjectURL(blob), revokeURL = url => URL.revokeObjectURL(url),
  decode = async url => { const image = new Image(); image.src = url; await image.decode(); },
  now = Date.now, limit = 128 } = {}) {
  const entries = new Map(), queue = [];
  let running = 0;
  const initial = Object.freeze({ status: "loading", url: "" });
  const notify = entry => entry.listeners.forEach(fn => fn());
  function trim() {
    for (const [key, entry] of entries) {
      if (entries.size <= limit) break;
      if (entry.listeners.size || entry.pending) continue;
      if (entry.value.url) revokeURL(entry.value.url);
      entries.delete(key);
    }
  }
  function pump() {
    while (running < 4 && queue.length) {
      const entry = queue.shift();
      running++;
      let url = "";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      Promise.resolve().then(() => fetchImpl(entry.source, { credentials: "include", cache: "default", signal: controller.signal })).then(async response => {
        if (response.status === 204) return;
        if (!response.ok || !/^image\//i.test(response.headers.get("content-type") || "")) throw new Error("avatar_thumbnail_unavailable");
        url = createURL(await response.blob());
        await decode(url);
      }).then(() => {
        entry.value = Object.freeze({ status: url ? "ready" : "missing", url });
      }).catch(() => {
        if (url) revokeURL(url);
        entry.value = Object.freeze({ status: "failed", url: "" });
      }).finally(() => {
        clearTimeout(timeout);
        entry.pending = false;
        entry.at = now();
        running--;
        notify(entry); trim(); pump();
      });
    }
  }
  function entryFor(source) {
    let entry = entries.get(source);
    if (entry) { entries.delete(source); entries.set(source, entry); return entry; }
    entry = { source, value: initial, listeners: new Set(), pending: false, at: 0 };
    entries.set(source, entry);
    return entry;
  }
  return {
    snapshot(source) { return source ? entries.get(source)?.value || initial : null; },
    subscribe(source, listener) {
      if (!source) return () => {};
      const entry = entryFor(source);
      const wasIdle = !entry.listeners.size;
      entry.listeners.add(listener);
      // A round outlasts the old two-minute TTL. Keep successful decoded images
      // across results remounts; avatar edits/reconnects change their source URL.
      const lifetime = entry.value.status === "ready" ? Infinity
        : entry.value.status === "failed" ? 15000 : 120000;
      if (!entry.pending && (entry.value === initial || (wasIdle && now() - entry.at > lifetime))) {
        if (entry.value.url) revokeURL(entry.value.url);
        entry.value = initial;
        entry.pending = true;
        queue.push(entry); pump(); notify(entry);
      }
      return () => { entry.listeners.delete(listener); trim(); };
    },
  };
}

export const avatarThumbnailCache = createAvatarThumbnailCache();
