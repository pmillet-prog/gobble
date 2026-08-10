import assert from "node:assert/strict";
import test from "node:test";

import { createShortLivedRequestCache } from "../shortLivedRequestCache.js";

test("mutualise les chargements simultanés d'une même clé", async () => {
  const cache = createShortLivedRequestCache({ ttlMs: 100, maxEntries: 4 });
  let resolveLoad;
  let loadCount = 0;
  const load = () => {
    loadCount += 1;
    return new Promise((resolve) => {
      resolveLoad = resolve;
    });
  };

  const first = cache.getOrLoad("weekly:50", load);
  const second = cache.getOrLoad("weekly:50", load);
  await Promise.resolve();

  assert.equal(loadCount, 1);
  resolveLoad({ ok: true });
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(await second, { ok: true });
});

test("réutilise brièvement la valeur puis la recalcule après expiration", async () => {
  const cache = createShortLivedRequestCache({ ttlMs: 15, maxEntries: 4 });
  let loadCount = 0;
  const load = async () => ({ version: ++loadCount });

  assert.deepEqual(await cache.getOrLoad("weekly:50", load), { version: 1 });
  assert.deepEqual(await cache.getOrLoad("weekly:50", load), { version: 1 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(await cache.getOrLoad("weekly:50", load), { version: 2 });
});

test("ne conserve pas un chargement en échec", async () => {
  const cache = createShortLivedRequestCache({ ttlMs: 100, maxEntries: 4 });
  let loadCount = 0;
  const load = async () => {
    loadCount += 1;
    if (loadCount === 1) throw new Error("boom");
    return "ok";
  };

  await assert.rejects(cache.getOrLoad("weekly:50", load), /boom/);
  assert.equal(await cache.getOrLoad("weekly:50", load), "ok");
  assert.equal(loadCount, 2);
});
