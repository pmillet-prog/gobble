import test from "node:test";
import assert from "node:assert/strict";
import { createWheelAudioPreload, wheelAudioAlreadyAllowed } from "./wheelAudioPreload.js";

test("activated live documents keep automatic intros, while a fresh or explicitly blocked tab waits", () => {
  assert.equal(wheelAudioAlreadyAllowed({}), false);
  assert.equal(wheelAudioAlreadyAllowed({ userActivation: { hasBeenActive: true } }), true);
  assert.equal(wheelAudioAlreadyAllowed({ getAutoplayPolicy: () => "allowed" }), true);
  assert.equal(wheelAudioAlreadyAllowed({ getAutoplayPolicy: () => "disallowed", userActivation: { hasBeenActive: true } }), false);
});

test("compressed prefetch is reused but decoding receives independent buffers, and cancellation discards late data", async () => {
  let fetches = 0, signal;
  const preload = createWheelAudioPreload(async (_url, options) => {
    fetches++; signal = options.signal;
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
  });
  await preload.prime("intro");
  const first = await (await preload.fetch("intro")).arrayBuffer();
  new Uint8Array(first)[0] = 5;
  const second = await (await preload.fetch("intro")).arrayBuffer();
  assert.equal(fetches, 1); assert.equal(new Uint8Array(second)[0], 1);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(preload.fetch("intro", { signal: aborted.signal }), /cancelled/);
  preload.dispose(); await assert.rejects(preload.fetch("intro"), /disposed/);
  assert.equal(signal.aborted, false, "Completed downloads have already removed their abort listener");
});
