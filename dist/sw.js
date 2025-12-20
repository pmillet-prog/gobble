self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pas de stratégie de cache agressive : on laisse le réseau gérer.
self.addEventListener("fetch", () => {});
