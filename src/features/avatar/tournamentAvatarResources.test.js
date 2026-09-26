import test from "node:test";
import assert from "node:assert/strict";
import { createTournamentAvatarResources } from "./createTournamentAvatarResources.js";

const drain = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "image/png" }), blob: async () => new Blob(["image"]) });
function fixture(options = {}) {
  const requests = [], revoked = [], preparations = [], releases = [];
  let serial = 0;
  const resources = createTournamentAvatarResources({
    fetchImpl: async (url, init) => { requests.push({ url, init }); return response(); },
    createObjectURL: () => `blob:${++serial}`, revokeObjectURL: url => revoked.push(url), decodeImage: async () => {},
    loadPodium: async () => ({ prepareTournamentPodium: async (entrants, { signal }) => {
      preparations.push({ entrants, signal });
      return { actors: [entrants], release: () => releases.push(entrants) };
    } }), ...options,
  });
  resources.configure("account:tour-1");
  return { resources, requests, revoked, preparations, releases };
}

test("all rounds and duplicate avatar rows reuse one download and one decode per player", async () => {
  let decodes = 0;
  const { resources, requests } = fixture({ decodeImage: async () => { decodes++; } });
  for (let round = 1; round <= 8; round++) {
    resources.configure("account:tour-1");
    resources.ensureThumbnail(1, `/avatar/1?sync=${round}`);
    resources.ensureThumbnail(1, "/avatar/1?v=2");
    resources.ensureThumbnail(2, "/avatar/2");
    await drain();
  }
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.init.cache === "no-cache"), "the first read checks freshness once per tournament");
  assert.equal(decodes, 2);
  assert.equal(resources.thumbnail(1).status, "ready");
  resources.dispose();
});

test("a late arrival is added without fetching or notifying existing players", async () => {
  const { resources, requests } = fixture();
  let originalUpdates = 0;
  const off = resources.subscribeThumbnail(1, () => originalUpdates++);
  resources.ensureThumbnail(1, "/avatar/1"); await drain();
  const original = resources.thumbnail(1);
  resources.ensureThumbnail(2, "/avatar/2"); await drain();
  assert.equal(resources.thumbnail(1), original);
  assert.equal(originalUpdates, 1);
  assert.deepEqual(requests.map(entry => entry.url), ["/avatar/1", "/avatar/2"]);
  off(); resources.dispose();
});

test("the next tournament releases blobs, refreshes once, and ignores obsolete responses", async () => {
  const delayed = deferred();
  const { resources, revoked } = fixture({ decodeImage: url => url === "blob:2" ? delayed.promise : Promise.resolve() });
  resources.ensureThumbnail(1, "/avatar/1"); await drain();
  resources.ensureThumbnail(2, "/avatar/2"); await drain();
  resources.configure("account:tour-2");
  assert.deepEqual(revoked, ["blob:1"]);
  resources.ensureThumbnail(1, "/avatar/1?v=9"); await drain();
  delayed.resolve(); await drain();
  assert.equal(resources.thumbnail(1).url, "blob:3");
  assert.equal(resources.thumbnail(2).status, "loading");
  assert.deepEqual(revoked, ["blob:1", "blob:2"]);
  resources.dispose();
  assert.equal(resources.thumbnail(1), null);
  assert.deepEqual(revoked, ["blob:1", "blob:2", "blob:3"]);
});

test("missing or failed miniatures do not create request storms on result remounts", async () => {
  let requests = 0;
  const { resources } = fixture({ fetchImpl: async url => {
    requests++;
    if (url === "/missing") return { status: 204 };
    throw new Error("offline");
  } });
  resources.ensureThumbnail(1, "/missing"); resources.ensureThumbnail(2, "/error"); await drain();
  resources.ensureThumbnail(1, "/missing"); resources.ensureThumbnail(2, "/error"); await drain();
  assert.equal(resources.thumbnail(1).status, "missing");
  assert.equal(resources.thumbnail(2).status, "failed");
  assert.equal(requests, 2);
  resources.dispose();
});

test("final results and podium opening share preparation, then dismissal releases the frames", async () => {
  const { resources, preparations, releases } = fixture();
  const entrants = { players: [1, 2, 3], self: 4 };
  const warm = resources.preparePodium("tour-1", entrants);
  const opening = resources.preparePodium("tour-1", { ...entrants });
  assert.equal(opening, warm);
  const ready = await opening.promise;
  assert.equal(warm.value, ready);
  assert.equal(preparations.length, 1);
  resources.releasePodium("tour-1");
  assert.equal(releases.length, 1);
  assert.equal(warm.promise, null);
  assert.equal(warm.value, null);
  assert.equal(resources.preparePodium("tour-1", entrants).released, true, "a duplicate result cannot restart the dismissed podium");
  resources.dispose();
  assert.equal(releases.length, 1);
});

test("leaving during preparation aborts it and frees any result completed late", async () => {
  const pending = deferred();
  let signal, released = 0;
  const { resources } = fixture({ loadPodium: async () => ({ prepareTournamentPodium: (_, options) => {
    signal = options.signal; return pending.promise;
  } }) });
  const warm = resources.preparePodium("tour-1", {});
  const promise = warm.promise;
  await drain(); resources.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve({ release: () => { released++; } });
  assert.equal(await promise, null);
  assert.equal(released, 1);
});

test("a failed podium can retry without restarting successful preparations", async () => {
  let calls = 0;
  const { resources } = fixture({ loadPodium: async () => ({ prepareTournamentPodium: async () => {
    if (++calls === 1) throw Error("image unavailable");
    return { release() {} };
  } }) });
  const first = resources.preparePodium("tour-1", {});
  await assert.rejects(first.promise);
  const next = resources.preparePodium("tour-1", {}, { retry: true });
  await next.promise;
  assert.equal(calls, 2);
  assert.equal(resources.preparePodium("tour-1", {}), next);
  resources.dispose();
});
