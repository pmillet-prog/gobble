import assert from "node:assert/strict";
import test from "node:test";
import AssetManager from "./assetManager.js";
import { IMAGE_KEYS } from "./assetKeys.js";
import { BOOT_ASSET_MANIFEST_BASE } from "./bootAssetManifest.js";

function browserImages(t, { failWebp = false, failAll = false } = {}) {
  const attempts = [], decoded = [], allocations = [];
  const replacements = {
    Image: class {
      naturalWidth = 800;
      naturalHeight = 533;
      set src(url) {
        this.url = url;
        this.failed = failAll || (failWebp && url.endsWith(".webp"));
        attempts.push(url);
        queueMicrotask(() => this.failed ? this.onerror?.() : this.onload?.());
      }
      decode() {
        decoded.push(this.url);
        return this.failed ? Promise.reject(new Error("unsupported image")) : Promise.resolve();
      }
    },
    fetch: async () => { allocations.push("fetch"); throw new Error("DOM images should use the browser cache"); },
    createImageBitmap: async () => { allocations.push("bitmap"); throw new Error("unused bitmap"); },
  };
  for (const [key, value] of Object.entries(replacements)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous
      ? Object.defineProperty(globalThis, key, previous)
      : Reflect.deleteProperty(globalThis, key));
  }
  t.mock.method(URL, "createObjectURL", () => { allocations.push("blob URL"); return "blob:unexpected"; });
  t.after(() => AssetManager.dispose());
  AssetManager.registerManifest(BOOT_ASSET_MANIFEST_BASE);
  return { attempts, decoded, allocations };
}

test("all seven BigScore images preload through the browser cache without bitmap or blob copies", async t => {
  const { attempts, decoded, allocations } = browserImages(t);
  const keys = Object.values(IMAGE_KEYS.bigwords);
  const progress = [];
  await AssetManager.preload({ keys, onProgress: event => progress.push(event) });
  assert.equal(keys.length, 7);
  assert.equal(progress.length, 7);
  assert.ok(progress.every(event => event.ok));
  assert.equal(attempts.length, 7);
  assert.equal(decoded.length, 7);
  assert.deepEqual(allocations, []);
  for (const key of keys) {
    assert.equal(AssetManager.isReady(key), true);
    assert.match(AssetManager.getImage(key).url, /^\/bigwords\/.+\.webp$/);
    assert.equal(AssetManager.getImage(key).bitmap, null);
    assert.equal(AssetManager.getImage(key).width, 800);
  }
  await AssetManager.preload({ keys });
  assert.equal(attempts.length, 7, "repeated preloads reuse ready images");
});

test("BigScore loading retains the PNG fallback and can be released and loaded again", async t => {
  const { attempts, allocations } = browserImages(t, { failWebp: true });
  const key = IMAGE_KEYS.bigwords.epique;
  await AssetManager.preload({ keys: [key] });
  assert.deepEqual(attempts, ["/bigwords/epique.webp", "/bigwords/epique.png"]);
  assert.equal(AssetManager.isReady(key), true);
  assert.equal(AssetManager.getImage(key).url, "/bigwords/epique.png");
  assert.deepEqual(allocations, []);
  AssetManager.release(key);
  assert.equal(AssetManager.isReady(key), false);
  await AssetManager.preload({ keys: [key] });
  assert.equal(attempts.length, 4);
  assert.equal(AssetManager.isReady(key), true);
});

test("a missing BigScore image finishes loading with failure instead of blocking boot", async t => {
  const { attempts } = browserImages(t, { failAll: true });
  const key = IMAGE_KEYS.bigwords.bonus, progress = [];
  await AssetManager.preload({ keys: [key], onProgress: event => progress.push(event) });
  assert.equal(attempts.length, 2);
  assert.equal(progress.length, 1);
  assert.equal(progress[0].ok, false);
  assert.equal(AssetManager.isReady(key), false);
});
