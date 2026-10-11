import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../../public/sw.js", import.meta.url), "utf8");
const origin = "https://gobble.test";
const mediaCache = "gobble-cache-media-v6";
const uiCache = "gobble-cache-ui-v6";
const image = () => new Response("trophy-image", { headers: { "content-type": "image/webp" } });
const html = () => new Response("<html>SPA fallback</html>", { headers: { "content-type": "text/html" } });

function setup(network) {
  const stores = new Map(), handlers = new Map();
  vm.runInNewContext(source, { URL, Response, fetch: network,
    self: { location: { origin }, addEventListener: (key, fn) => handlers.set(key, fn) },
    caches: { open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return { match: async key => entries.get(key)?.clone(), put: async (key, value) => entries.set(key, value),
        delete: async key => entries.delete(key), keys: async () => [...entries.keys()] };
    } },
  });
  return { stores, request: (path, cache = "default") => {
    let result;
    handlers.get("fetch")({ request: new Request(`${origin}${path}`, { cache }), respondWith: value => { result = value; } });
    return result;
  } };
}

test("new trophies recover from HTML cached before their images existed", async () => {
  const ids = ["marathon_10000", "total_score_10000000", "double_gobbles_1000", "targets_1000", "medals_5000", "words_100000"];
  const { stores, request } = setup(async () => image());
  const media = new Map(ids.map(id => [`${origin}/trophies/v1/${id}.webp`, html()]));
  media.set(`${origin}/other.webp`, image());
  stores.set(mediaCache, media);
  stores.set(uiCache, new Map([[`${origin}/trophies/v1/marathon_10000.webp`, html()]]));
  for (const id of ids) {
    const path = `/trophies/v1/${id}.webp`;
    assert.equal((await request(path)).headers.get("content-type"), "image/webp", id);
    assert.equal(media.get(`${origin}${path}`).headers.get("content-type"), "image/webp");
  }
  assert.equal(stores.get(uiCache).size, 0);
  assert.ok(media.has(`${origin}/other.webp`));
});

test("a missing trophy image never becomes a permanent cached HTML response", async () => {
  let available = false;
  const { stores, request } = setup(async () => available ? image() : html());
  const path = "/trophies/v1/marathon_10000.webp";
  assert.equal((await request(path)).status, 503);
  assert.equal(stores.get(mediaCache).size, 0);
  available = true;
  assert.equal((await request(path)).headers.get("content-type"), "image/webp");
});

test("valid trophy images remain cached and available when offline", async () => {
  const { stores, request } = setup(async () => { throw new Error("offline"); });
  const path = "/trophies/v1/gobbles_10000-v2.webp";
  stores.set(mediaCache, new Map([[`${origin}${path}`, image()]]));
  assert.equal(await (await request(path)).text(), "trophy-image");
  assert.equal(await (await request(path, "reload")).text(), "trophy-image");
});
