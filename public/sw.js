const SW_VERSION = "v2";
const CACHE_PREFIX = "gobble-cache";
const MEDIA_CACHE = `${CACHE_PREFIX}-media-${SW_VERSION}`;
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${SW_VERSION}`;
const CACHE_NAMES = new Set([MEDIA_CACHE, SHELL_CACHE]);

const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/favicon.png", "/icon.svg"];

function isGetRequest(request) {
  return request && request.method === "GET";
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiRequest(pathname) {
  return pathname.startsWith("/api/") || pathname.startsWith("/socket.io/");
}

function isMediaPath(pathname) {
  return (
    pathname.startsWith("/sound/") ||
    pathname.startsWith("/bigwords/") ||
    pathname.startsWith("/vocab-ranks/") ||
    pathname === "/g.png" ||
    pathname === "/dico.txt" ||
    pathname.endsWith(".mp3") ||
    pathname.endsWith(".m4a") ||
    pathname.endsWith(".wav") ||
    pathname.endsWith(".ogg") ||
    pathname.endsWith(".webm") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".txt") ||
    pathname.endsWith(".json")
  );
}

function shouldHandleAsMedia(request, url) {
  if (isApiRequest(url.pathname)) return false;
  if (isMediaPath(url.pathname)) return true;
  return request.destination === "audio" || request.destination === "image";
}

function makeCacheKey(url, stripSearch = false) {
  const keyUrl = new URL(url.toString());
  keyUrl.hash = "";
  if (stripSearch) keyUrl.search = "";
  return keyUrl.toString();
}

async function putInCache(cacheName, key, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(cacheName);
  await cache.put(key, response.clone());
}

async function mediaCacheFirst(request, url) {
  const cache = await caches.open(MEDIA_CACHE);
  const key = makeCacheKey(url, true);
  const cached = await cache.match(key);
  if (cached) return cached;
  try {
    const network = await fetch(request);
    await putInCache(MEDIA_CACHE, key, network);
    return network;
  } catch (_) {
    if (cached) return cached;
    throw _;
  }
}

async function navigationNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const network = await fetch(request);
    await putInCache(SHELL_CACHE, "/index.html", network);
    return network;
  } catch (_) {
    const cached = await cache.match("/index.html");
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name.startsWith(CACHE_PREFIX) && !CACHE_NAMES.has(name)) {
            return caches.delete(name);
          }
          return Promise.resolve(false);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!isGetRequest(request)) return;
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;
  if (isApiRequest(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (shouldHandleAsMedia(request, url)) {
    event.respondWith(mediaCacheFirst(request, url));
  }
});
