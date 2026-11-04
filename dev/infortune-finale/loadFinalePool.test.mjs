import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { clearCachedFinalePool } from "./loadFinalePool.js";

test("an old cached 12-entry pool is removed without clearing other game or browser caches", async () => {
  const url = "http://localhost:3000/data/infortune-finale-bank.json";
  const caches = new Map([
    ["gobble-cache-media-v6", new Map([[url, { puzzles: Array(12).fill({}) }], ["http://localhost:3000/image.webp", "image"]])],
    ["gobble-cache-ui-v6", new Map([[url, "stale pool"]])],
    ["other-app", new Map([[url, "unrelated"]])],
  ]);
  const storage = { keys: async () => [...caches.keys()], open: async name => ({ delete: async key => caches.get(name).delete(key) }) };
  await clearCachedFinalePool(storage, `${url}?t=123&import`);
  assert.equal(caches.get("gobble-cache-media-v6").has(url), false);
  assert.equal(caches.get("gobble-cache-ui-v6").has(url), false);
  assert.equal(caches.get("gobble-cache-media-v6").get("http://localhost:3000/image.webp"), "image");
  assert.equal(caches.get("other-app").get(url), "unrelated");
  await clearCachedFinalePool(storage, url);
  await clearCachedFinalePool(undefined, url);
});

test("JSON script imports bypass the service worker's media cache", async () => {
  const events = new Map();
  const context = vm.createContext({ URL,
    self: { location: { origin: "http://localhost:3000" }, addEventListener: (name, callback) => events.set(name, callback) },
    caches: { open() { assert.fail("A script must not read or populate the media cache"); } },
  });
  vm.runInContext(await readFile(new URL("../../public/sw.js", import.meta.url), "utf8"), context);
  events.get("fetch")({ request: { method: "GET", url: "http://localhost:3000/data/infortune-finale-bank.json?t=456&import",
    destination: "script", headers: new Headers(), mode: "cors" },
    respondWith() { assert.fail("Leave module loading to the browser"); },
  });
  assert.equal(vm.runInContext('isMediaPath("/data/infortune-finale-bank.json")', context), true);
  assert.equal(vm.runInContext('isMediaPath("/sound/intro.mp3")', context), true);
});
