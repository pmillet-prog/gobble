import test from "node:test";
import assert from "node:assert/strict";
import { loadChalkboardTexture } from "./chalkboardTexture.js";

const response = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
test("a cached HTML fallback is rejected even with HTTP 200", async () => {
  await assert.rejects(loadChalkboardTexture({ fetchImage: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }) }), /texture_unavailable/);
});

test("the texture is decoded before display and its object URL is released on disposal", async () => {
  const events = [];
  const resource = await loadChalkboardTexture({
    fetchImage: async (url, options) => { assert.equal(options.cache, "reload"); return response(); },
    makeImage: () => ({ decode: async () => { events.push("decoded"); } }),
    urls: { createObjectURL: () => "blob:chalk", revokeObjectURL: url => events.push(url) },
  });
  assert.deepEqual(events, ["decoded"]);
  assert.equal(resource.src, "blob:chalk");
  resource.release();
  assert.deepEqual(events, ["decoded", "blob:chalk"]);
});

test("decode failure and leaving during decode do not leak image URLs", async () => {
  for (const abort of [false, true]) {
    const controller = new AbortController();
    const released = [];
    await assert.rejects(loadChalkboardTexture({ signal: controller.signal, fetchImage: async () => response(),
      makeImage: () => ({ decode: async () => { if (abort) controller.abort(); else throw new Error("decode_failed"); } }),
      urls: { createObjectURL: () => "blob:chalk", revokeObjectURL: url => released.push(url) },
    }));
    assert.deepEqual(released, ["blob:chalk"]);
  }
});
