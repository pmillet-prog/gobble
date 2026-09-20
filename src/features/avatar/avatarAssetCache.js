// Older service workers may have cached the HTML fallback as an image.
// Remove only the affected avatar resource, leaving other game caches intact.
export async function evictAvatarResource(url) {
  if (typeof window === "undefined" || !window.caches) return;
  const path = new URL(url, window.location.href).pathname;
  if (!path.startsWith("/avatars/")) return;
  try {
    for (const name of await window.caches.keys()) {
      if (!name.startsWith("gobble-cache")) continue;
      const cache = await window.caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname === path) await cache.delete(request);
      }
    }
  } catch { /* CacheStorage may be unavailable in private browsing. */ }
}

export async function loadAvatarImage(url) {
  const image = new Image();
  image.src = url;
  try { await image.decode(); return image; }
  catch {
    await evictAvatarResource(url);
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok || !/^image\//i.test(response.headers.get("content-type") || "")) throw new Error(`Avatar image unavailable: ${url}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    try {
      const recovered = new Image();
      recovered.src = blobUrl;
      await recovered.decode();
      return recovered;
    } finally { URL.revokeObjectURL(blobUrl); }
  }
}
