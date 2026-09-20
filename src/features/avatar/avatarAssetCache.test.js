import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");
function setup(network) {
  const stores = new Map(), handlers = new Map();
  vm.runInNewContext(source, { URL, Response, fetch: network,
    self: { location: { origin: "https://gobble.test" }, addEventListener: (key, fn) => handlers.set(key, fn) },
    caches: { open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return { match: async key => entries.get(key)?.clone(), put: async (key, value) => entries.set(key, value), delete: async key => entries.delete(key), keys: async () => [...entries.keys()] };
    } },
  });
  return { stores, request: (path, cache = "default") => {
    let promise;
    handlers.get("fetch")({ request: new Request(`https://gobble.test${path}`, { cache }), respondWith: value => { promise = value; } });
    return promise;
  } };
}
const png = text => new Response(text, { headers: { "content-type": "image/png" } });
const json = value => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const html = () => new Response("<html>SPA fallback</html>", { headers: { "content-type": "text/html" } });

test("avatar image and thumbnail requests repair poisoned HTML caches, preserving other game files", async () => {
  const { stores, request } = setup(async () => png("decoded-image"));
  const path = "/avatars/v1/hat.png", key = `https://gobble.test${path}`;
  const media = new Map([[key, html()], ["other", png("keep")]]);
  stores.set("gobble-cache-media-v6", media);
  assert.equal(await (await request(path)).text(), "decoded-image");
  assert.equal(media.get(key).headers.get("content-type"), "image/png");
  assert.ok(media.has("other"));
});

test("avatar catalog updates bypass a valid but stale catalog cache", async () => {
  const { stores, request } = setup(async () => json({ version: "current" }));
  stores.set("gobble-cache-media-v6", new Map([["https://gobble.test/avatars/v1/catalog.json", json({ version: "old" })]]));
  assert.equal((await (await request("/avatars/v1/catalog.json")).json()).version, "current");
});

test("missing assets are never cached as HTML and good images remain available offline", async () => {
  const missing = setup(async () => html());
  assert.equal((await missing.request("/avatars/v1/missing.png")).status, 503);
  assert.equal(missing.stores.get("gobble-cache-media-v6").size, 0);
  const offline = setup(async () => { throw Error("offline"); });
  offline.stores.set("gobble-cache-media-v6", new Map([["https://gobble.test/avatars/default.png", png("default")]]));
  assert.equal(await (await offline.request("/avatars/default.png", "reload")).text(), "default");
});
