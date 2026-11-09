import test from "node:test";
import assert from "node:assert/strict";
import { createSavedAvatarImageCache } from "./savedAvatarImages.js";
import { createAvatarThumbnailCache } from "./avatarThumbnailCache.js";
import { createAccountAvatarSync } from "./createAccountAvatarSync.js";
import { normalizeAvatar } from "../../../shared/avatarConfiguration.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
test("portraits share in-flight decoding, survive scene changes and evict within their memory budget", async () => {
  let calls = 0;
  const cache = createSavedAvatarImageCache({ maxBytes: 32, loadImage: async () => { calls++; return { width: 2, height: 2 }; } });
  const one = cache.load("one");
  assert.equal(cache.load("one"), one);
  const image = await one;
  await cache.load("two"); await cache.load("three");
  assert.deepEqual(image, { width: 2, height: 2 }, "eviction does not destroy the image owned by a visible scene");
  await cache.load("one");
  assert.equal(calls, 4);
});

test("failed images can be retried, and new revisions cannot hit the old portrait", async () => {
  let fail = true, calls = 0;
  const cache = createSavedAvatarImageCache({ loadImage: async () => { calls++; if (fail) throw Error("offline"); return { width: 2, height: 2 }; } });
  await assert.rejects(cache.load("revision1")); fail = false;
  await cache.load("revision1"); await cache.load("revision2");
  assert.equal(calls, 3);
});

test("ranking remounts and other screens reuse the same decoded blob, an edit replaces only its avatar", async () => {
  const requests = [], revoked = [];
  let decoded = 0, serial = 0;
  const cache = createAvatarThumbnailCache({ limit: 2, fetchImpl: async url => {
    requests.push(url); return { ok: true, headers: new Headers({ "content-type": "image/png" }), blob: async () => new Blob([url]) };
  }, createURL: () => `blob:${++serial}`, revokeURL: url => revoked.push(url), decode: async () => { decoded++; } });
  const off = cache.subscribe("one?v=1", () => {});
  cache.subscribe("two?v=1", () => {});
  await settle(); off();
  const value = cache.snapshot("one?v=1");
  for (let i = 0; i < 8; i++) { const unsubscribe = cache.subscribe("one?v=1", () => {}); unsubscribe(); }
  assert.equal(cache.snapshot("one?v=1"), value);
  assert.equal(requests.length, 2); assert.equal(decoded, 2);
  cache.subscribe("one?v=2", () => {}); await settle();
  assert.equal(requests.length, 3);
  assert.equal(cache.snapshot("two?v=1").url, "blob:2");
  assert.deepEqual(revoked, ["blob:1"]);
});

test("missing thumbnails recover on a later visit, active rows never poll", async () => {
  let clock = 1000, calls = 0;
  const cache = createAvatarThumbnailCache({ now: () => clock, fetchImpl: async () => { calls++; return { status: 204 }; } });
  const off = cache.subscribe("latest", () => {}); await settle();
  clock += 180000;
  const duplicate = cache.subscribe("latest", () => {}); await settle();
  assert.equal(calls, 1);
  duplicate(); off();
  cache.subscribe("latest", () => {}); await settle();
  assert.equal(calls, 2);
});

test("30 live players reuse unversioned thumbnails after every three-minute round", async () => {
  let clock = 1000, decoded = 0;
  const requests = [];
  const cache = createAvatarThumbnailCache({ now: () => clock, fetchImpl: async source => {
    requests.push(source);
    return { ok: true, headers: new Headers({ "content-type": "image/png" }), blob: async () => new Blob([source]) };
  }, createURL: () => `blob:${requests.length}`, revokeURL: () => {}, decode: async () => { decoded++; } });
  const sources = Array.from({ length: 30 }, (_, index) => `/api/auth/avatars/${index + 1}/chat.png?r=2`);
  for (let round = 0; round < 5; round++) {
    const off = sources.map(source => cache.subscribe(source, () => {}));
    await settle();
    assert.ok(sources.every(source => cache.snapshot(source).status === "ready"));
    assert.equal(requests.length, 30, `round ${round + 1} must not refetch the same avatars`);
    assert.equal(decoded, 30);
    off.forEach(stop => stop());
    clock += 180000;
  }
});

test("account synchronization preserves the saved image descriptor but editable drafts discard it", async () => {
  const renderedAssets = { version: 1, revision: 4, userId: 7 };
  const value = { ...normalizeAvatar({}), renderedAssets };
  const sync = createAccountAvatarSync({ request: async () => ({ userId: 7, avatar: value, revision: 4, unlocksRequired: true }),
    readLocal: () => null, cacheLocal: () => {}, renderedAssetsEnabled: true });
  const stop = sync.connect(7);
  try {
    await sync.refresh();
    assert.equal(sync.getSnapshot().avatar.renderedAssets, renderedAssets);
    assert.equal(normalizeAvatar(sync.getSnapshot().avatar).renderedAssets, undefined);
  } finally { stop(); }
});

test("the major release adopts the saved render descriptor from the authenticated account", async () => {
  const sync = createAccountAvatarSync({ request: async () => ({ userId: 7,
    avatar: { ...normalizeAvatar({}), renderedAssets: { version: 1, revision: 4, userId: 7 } }, revision: 4 }),
    readLocal: () => null, cacheLocal: () => {} });
  const stop = sync.connect(7);
  try { await sync.refresh(); assert.deepEqual(sync.getSnapshot().avatar.renderedAssets, { version: 1, revision: 4, userId: 7 }); }
  finally { stop(); }
});
