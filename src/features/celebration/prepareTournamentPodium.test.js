import test from "node:test";
import assert from "node:assert/strict";
import { prepareTournamentPodium } from "./prepareTournamentPodium.js";
import { createTournamentAvatarResources } from "../avatar/createTournamentAvatarResources.js";
import { accountAvatarStore } from "../avatar/accountAvatarStore.js";

const entrants = { players: [{ userId: 12, nick: "Lina", rank: 1 }], self: null };
const response = payload => ({ ok: true, json: async () => payload });

for (const [label, fetchImpl] of [
  ["network error", async () => { throw new TypeError("Failed to fetch"); }],
  ["HTTP error", async () => ({ ok: false, status: 503 })],
  ["unreadable JSON", async () => ({ ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } })],
  ["missing avatar map", async () => response({ ok: true })],
  ["invalid avatar map", async () => response({ ok: true, avatars: [] })],
  ["API error", async () => response({ ok: false, avatars: {} })],
]) {
  test(`${label} cannot become a successful preparation with default portraits`, async t => {
    t.mock.method(globalThis, "fetch", fetchImpl);
    t.mock.method(accountAvatarStore, "getSnapshot", () => ({ userId: 99, avatar: null }));
    const resources = createTournamentAvatarResources({ loadPodium: async () => ({ prepareTournamentPodium }) });
    t.after(() => resources.dispose());
    resources.configure("account:tour-1");
    const warm = resources.preparePodium("tour-1", entrants);
    await assert.rejects(warm.promise);
    assert.equal(warm.value, null);
    assert.equal(warm.status, "failed");
  });
}

test("a five-second request timeout rejects instead of preparing default portraits", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requestSignal;
  t.mock.method(globalThis, "fetch", (_, { signal }) => {
    requestSignal = signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const pending = prepareTournamentPodium(entrants);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  t.mock.timers.tick(4999);
  assert.equal(requestSignal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(requestSignal.aborted, true);
});

test("leaving the tournament aborts the avatar request", async t => {
  const controller = new AbortController();
  let requestSignal;
  t.mock.method(globalThis, "fetch", (_, { signal }) => {
    requestSignal = signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const pending = prepareTournamentPodium(entrants, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(requestSignal.aborted, true);
});

test("a confirmed absence of a saved avatar still uses a default without unnecessary retries", async t => {
  const previous = Object.fromEntries(["Image", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const decoded = [];
  globalThis.Image = class {
    width = 600;
    height = 600;
    async decode() { decoded.push(this.src); }
  };
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) };
  const fetchMock = t.mock.method(globalThis, "fetch", async () => response({ ok: true, avatars: {} }));
  const resources = createTournamentAvatarResources({ loadPodium: async () => ({ prepareTournamentPodium }) });
  t.after(() => resources.dispose());
  resources.configure("account:tour-1");
  const warm = resources.preparePodium("tour-1", entrants);
  const ready = await warm.promise;
  assert.equal(ready.players[0].avatar, undefined);
  assert.deepEqual(decoded, ["/avatars/default.png"]);
  assert.equal(await resources.openPodium("tour-1", entrants), ready);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(ready.actors[0].frames.neutral.width, 600);
  resources.releasePodium("tour-1");
  assert.equal(ready.actors[0].frames.neutral.width, 0);
});
