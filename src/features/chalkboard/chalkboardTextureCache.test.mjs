import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");
const url = "https://gobble.test/chalkboard/surface/patinee-v2.webp";
function setup(network) {
  const caches = new Map();
  const handlers = new Map();
  vm.runInNewContext(source, { URL, Response, fetch: network,
    self: { location: { origin: "https://gobble.test" }, addEventListener: (name, fn) => handlers.set(name, fn) },
    caches: { open: async name => {
      if (!caches.has(name)) caches.set(name, new Map());
      const entries = caches.get(name);
      return { match: async key => entries.get(key)?.clone(), put: async (key, value) => entries.set(key, value), delete: async key => entries.delete(key), keys: async () => [...entries.keys()] };
    } },
  });
  return { caches, request: (cache = "reload") => {
    let result;
    handlers.get("fetch")({ request: new Request(url, { cache }), respondWith: promise => { result = promise; } });
    return result;
  } };
}

test("the texture route repairs poisoned media cache entries without clearing other assets", async () => {
  const { caches, request } = setup(async () => new Response("image-bytes", { headers: { "content-type": "image/webp" } }));
  const media = new Map([[url, new Response("<html>fallback</html>", { headers: { "content-type": "text/html" } })], ["other", new Response("keep")]]);
  caches.set("gobble-cache-media-v6", media);
  const result = await request();
  assert.equal(result.headers.get("content-type"), "image/webp");
  assert.equal(media.get(url).headers.get("content-type"), "image/webp");
  assert.ok(media.has("other"));
});

test("HTML from the network is not stored as a texture and a valid image remains available offline", async () => {
  const bad = setup(async () => new Response("<html>fallback</html>", { headers: { "content-type": "text/html" } }));
  assert.equal((await bad.request()).status, 503);
  assert.equal(bad.caches.get("gobble-cache-media-v6").has(url), false);
  const offline = setup(async () => { throw new Error("offline"); });
  offline.caches.set("gobble-cache-media-v6", new Map([[url, new Response("cached-image", { headers: { "content-type": "image/webp" } })]]));
  assert.equal(await (await offline.request()).text(), "cached-image");
});
