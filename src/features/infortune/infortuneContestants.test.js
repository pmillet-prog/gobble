import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { loadInfortuneContestants, createInfortuneContestantLoader } from "./loadInfortuneContestants.js";
import { createChatAvatarRevisions } from "../avatar/chatAvatarRevisions.js";
import { avatarAssetSignature } from "../../../shared/avatarRenderAssets.js";
import { prepareInfortuneContestant } from "./prepareInfortuneContestant.js";
import { savedAvatarImages } from "../avatar/savedAvatarImages.js";
import { PRESENTER_IDENTITIES } from "../../../shared/presenterIdentities.js";
import { placeStageContestants } from "../../../dev/infortune-perspective/stageFixtures.js";
import { collectStagePresenterFiles } from "../../../dev/infortune-perspective/stageAvatarAssets.mjs";

test("one appearance request fetches only the two opponents and preserves their server identities", async () => {
  const opponents = [{ id: "user:2", userId: 2, nick: "Deux" }, { id: "user:3", userId: 3, nick: "Trois" }];
  const requests = [];
  const loaded = await loadInfortuneContestants(opponents, { fetchImpl: async url => {
    requests.push(url); return { ok: true, json: async () => ({ ok: true, avatars: { 2: { version: 1, base: "femme" } } }) };
  } });
  assert.deepEqual(requests, ["/api/auth/avatars?userIds=2,3"]);
  assert.equal(loaded[0].avatar.base, "femme"); assert.equal(loaded[1].avatar, null);
  assert.deepEqual(loaded.map(player => [player.id, player.nick]), opponents.map(player => [player.id, player.nick]));
  const bots = [{ id: "bot", isBot: true, presenterKey: "pivot", nick: "Bernard Pinot" }];
  assert.equal(await loadInfortuneContestants(bots, { fetchImpl: () => { throw Error("no request expected"); } }), bots);
});

test("an aborted appearance request never installs its obsolete portraits", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadInfortuneContestants([{ userId: 2 }], { signal: controller.signal,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, avatars: {} }) }) }), { name: "AbortError" });
});

test("successive wheel launches reuse saved bust descriptors, and only edited avatars are fetched again", async () => {
  const revisions = createChatAvatarRevisions(), load = createInfortuneContestantLoader({ revisions });
  const requests = [], opponents = [{ id: 'user:2', userId: 2 }, { id: 'user:3', userId: 3 }];
  const fetchImpl = async url => {
    requests.push(url);
    return { ok: true, json: async () => ({ ok: true, avatars: { 2: { renderedAssets: { revision: requests.length } }, 3: { renderedAssets: { revision: 1 } } } }) };
  };
  const first = await load(opponents, { fetchImpl });
  for (let round = 0; round < 4; round++) {
    const next = await load(opponents, { fetchImpl });
    assert.equal(next[0].avatar, first[0].avatar);
    assert.equal(next[1].avatar, first[1].avatar);
  }
  assert.equal(requests.length, 1);
  revisions.update({ userId: 2, revision: 2 });
  await load(opponents, { fetchImpl });
  assert.equal(requests.at(-1), '/api/auth/avatars?userIds=2');
  revisions.refreshKnown();
  await load(opponents, { fetchImpl });
  assert.equal(requests.at(-1), '/api/auth/avatars?userIds=2,3');
});

test("failed appearance requests never enter the saved bust cache", async () => {
  const load = createInfortuneContestantLoader({ revisions: createChatAvatarRevisions() });
  const opponents = [{ userId: 12 }];
  await assert.rejects(load(opponents, { fetchImpl: async () => ({ ok: false }) }));
  let calls = 0;
  const result = await load(opponents, { fetchImpl: async () => {
    calls++; return { ok: true, json: async () => ({ ok: true, avatars: { 12: { base: 'femme' } } }) };
  } });
  assert.equal(calls, 1);
  assert.equal(result[0].avatar.base, 'femme');
});

test("an expired weekly aura refreshes its bust descriptor", async () => {
  let clock = 10, calls = 0;
  const load = createInfortuneContestantLoader({ revisions: createChatAvatarRevisions(), now: () => clock });
  const fetchImpl = async () => {
    calls++; return { ok: true, json: async () => ({ ok: true, avatars: { 12: { weeklyAura: { expiresAt: 20 } } } }) };
  };
  await load([{ userId: 12 }], { fetchImpl });
  await load([{ userId: 12 }], { fetchImpl });
  assert.equal(calls, 1);
  clock = 21;
  await load([{ userId: 12 }], { fetchImpl });
  assert.equal(calls, 2);
});

test("a generated smiling bust is drawn directly without loading any vector avatar parts", async t => {
  const urls = [], draws = [];
  t.mock.method(savedAvatarImages, 'load', async url => { urls.push(url); return { width: 600, height: 600, url }; });
  const avatar = { base: 'femme' };
  avatar.renderedAssets = { userId: 12, revision: 4, version: 1, signature: avatarAssetSignature(avatar),
    frames: { stage_happy: { size: 600 } } };
  const canvas = { width: 600, height: 600, getContext: () => ({ clearRect() {}, drawImage: image => draws.push(image.url) }) };
  await prepareInfortuneContestant({ userId: 12, avatar }, {
    makeCanvas: () => canvas, loadRenderer: () => { throw Error('No vector composition for a generated bust'); },
  });
  assert.deepEqual(urls, ['/api/auth/avatars/12/render/4/1/stage_happy.png']);
  assert.deepEqual(draws, urls);
});

test("all known presenter portraits keep aspect ratio and never load the modular avatar renderer", async t => {
  const images = [], draws = [];
  t.mock.method(savedAvatarImages, "load", async url => { images.push(url); return { width: 500, height: 600 }; });
  for (const [presenterKey, { nick }] of Object.entries(PRESENTER_IDENTITIES)) {
    const canvas = { width: 600, height: 600, getContext: () => ({ drawImage: (...args) => draws.push(args) }) };
    const prepared = await prepareInfortuneContestant({ id: presenterKey, isBot: true, presenterKey, nick }, {
      makeCanvas: () => canvas, loadRenderer: () => { throw Error("No compositor for presenters"); },
    });
    assert.equal(prepared, canvas);
  }
  assert.equal(images.length, 6);
  assert.ok(images.every(url => /^\/bots\/presenters\/[^/]+\/frame-\d+\.webp$/.test(url)));
  assert.ok(draws.every(([, x, y, width, height]) => Number.isFinite(x + y) && Math.abs(width / height - 5 / 6) < 1e-10));
  const placed = placeStageContestants([{ id: "1", nick: "Un" }, { id: "2", nick: "Deux" }]);
  assert.deepEqual(placed.map(player => player.nick), ["Un", "Deux"]);
  assert.ok(placed[0].position[0] * placed[1].position[0] < 0);
});

test("the standalone workshop includes all presenter portraits and lightweight buttons", async () => {
  const root = new URL("../../../public/", import.meta.url);
  const files = collectStagePresenterFiles();
  assert.equal(files.size, 12);
  for (const file of files) assert.ok((await stat(new URL(file, root))).size > 0, file);
});
