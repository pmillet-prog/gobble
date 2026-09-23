import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");
function setup(fetchImpl, { storageFails = false, optionalAssetsFail = false } = {}) {
  const handlers = new Map(), stores = new Map(), timers = new Map();
  let nextTimer = 1, skipped = false;
  const offlinePage = "<html>Gobble offline — Réessayer</html>";
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async key => stores.delete(key),
    open: async name => {
      if (storageFails) throw new Error("quota");
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match: async key => entries.get(key)?.clone(),
        put: async (key, value) => entries.set(key, value.clone()),
        addAll: async urls => {
          if (optionalAssetsFail && !urls.includes("/offline.html")) throw new Error("missing image");
          for (const url of urls) entries.set(url, new Response(url.endsWith(".js") ? "// retry" : offlinePage,
            { headers: { "content-type": url.endsWith(".js") ? "application/javascript" : "text/html" } }));
        },
        keys: async () => [...entries.keys()],
        delete: async key => entries.delete(key),
      };
    },
  };
  vm.runInNewContext(source, {
    URL, Response, AbortController, Promise, fetch: fetchImpl, caches,
    setTimeout(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    self: {
      location: { origin: "https://gobble.test" },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => {} },
    },
  });
  return {
    stores, timers, skipped: () => skipped, offlinePage,
    install: () => { let promise; handlers.get("install")({ waitUntil: p => { promise = p; } }); return promise; },
    request: (path = "/", mode = "navigate") => {
      let response;
      handlers.get("fetch")({
        request: { url: "https://gobble.test" + path, method: "GET", mode, headers: new Headers() },
        respondWith: p => { response = p; },
      });
      return response;
    },
  };
}
test("offline startup returns a self-contained page, not an incomplete cached app", async () => {
  const h = setup(async () => { throw Error("offline"); });
  await h.install();
  h.stores.set("gobble-cache-shell-v6", new Map([["/index.html", new Response("<script src='/missing.js'></script>")]]));
  assert.equal(await (await h.request("/?view=daily")).text(), h.offlinePage);
  assert.equal(h.timers.size, 0);
  assert.equal(await (await h.request("/offline-retry.js", "cors")).text(), "// retry");
});
test("offline fallback works despite failed optional image preloads", async () => {
  const h = setup(async () => { throw Error("offline"); }, { optionalAssetsFail: true });
  await h.install();
  assert.equal(h.skipped(), true);
  assert.equal(await (await h.request()).text(), h.offlinePage);
});
test("slow startup is bounded and aborts the stalled request", async () => {
  let signal;
  const h = setup(async (_request, options) => { signal = options.signal; return new Promise(() => {}); });
  await h.install();
  const response = h.request();
  for (const callback of h.timers.values()) callback();
  assert.equal(await (await response).text(), h.offlinePage);
  assert.equal(signal.aborted, true);
  assert.equal(h.timers.size, 0);
});
test("working network still loads the game when cache storage is unavailable", async () => {
  const h = setup(async () => new Response("<html>live</html>", { headers: { "content-type": "text/html" } }), { storageFails: true });
  assert.equal(await (await h.request()).text(), "<html>live</html>");
  assert.equal(h.timers.size, 0);
});
test("without network or cache, a readable last resort is still returned", async () => {
  const h = setup(async () => { throw Error("offline"); }, { storageFails: true });
  const response = await h.request();
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Connexion indisponible/);
});
test("server errors get the fallback; auth errors and API requests stay untouched", async () => {
  const h = setup(async () => new Response("maintenance", { status: 503 }));
  await h.install();
  assert.equal(await (await h.request()).text(), h.offlinePage);
  assert.equal(h.request("/api/me"), undefined);
  assert.equal(h.request("/socket.io/"), undefined);
  const forbidden = setup(async () => new Response("denied", { status: 403 }));
  assert.equal((await forbidden.request()).status, 403);
});
