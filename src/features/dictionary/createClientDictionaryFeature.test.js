import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  createClientDictionaryFeature,
  parseClientDictionary,
} from "./createClientDictionaryFeature.js";

function createKernelHarness(initialView = "home") {
  let state = { navigation: { view: initialView } };
  const listeners = new Set();
  return {
    getState: () => state,
    setView(view) {
      state = { navigation: { view } };
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

test("dictionary parser builds the deduplicated set without intermediate line arrays", () => {
  const entries = parseClientDictionary(" Chat\r\nchien\nCHAT\n\n");
  assert.deepEqual([...entries], ["chat", "chien"]);
});

test("dictionary satellite loads only for daily play and releases retained data", async () => {
  const scope = createResourceScope("test:dictionary");
  const kernel = createKernelHarness();
  const released = [];
  const buffer = new TextEncoder().encode("chat\nchien\nchat\n").buffer;
  const feature = createClientDictionaryFeature(
    { getKernel: () => kernel, scope },
    {
      assetManager: {
        getFileBuffer: () => buffer,
        release: (key) => released.push(key),
      },
      fetchImpl: () => {
        throw new Error("network should not be used for a cached dictionary");
      },
    }
  );

  feature.start();
  assert.equal(feature.store.getState().entries, null);
  kernel.setView("daily_play");
  await Promise.resolve();
  assert.deepEqual([...feature.store.getState().entries], ["chat", "chien"]);
  assert.equal(feature.store.getState().status, "ready");
  assert.equal(released.length, 1);

  kernel.setView("home");
  assert.equal(feature.store.getState().entries, null);
  assert.equal(feature.store.getState().status, "idle");
  scope.dispose();
});

test("dictionary satellite aborts an unfinished network load when leaving daily play", async () => {
  const scope = createResourceScope("test:dictionary-abort");
  const kernel = createKernelHarness();
  let aborted = false;
  const feature = createClientDictionaryFeature(
    { getKernel: () => kernel, scope },
    {
      assetManager: { getFileBuffer: () => null },
      fetchImpl: (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    }
  );

  feature.start();
  kernel.setView("daily_play");
  assert.equal(feature.store.getState().status, "loading");
  kernel.setView("home");
  await Promise.resolve();
  assert.equal(aborted, true);
  assert.equal(feature.store.getState().entries, null);
  assert.equal(feature.store.getState().status, "idle");
  scope.dispose();
});
