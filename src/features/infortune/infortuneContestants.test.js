import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { loadInfortuneContestants } from "./loadInfortuneContestants.js";
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

test("all five substitute presenters use one real portrait, keep aspect ratio and never load the modular avatar renderer", async t => {
  const images = [], draws = [];
  t.mock.method(savedAvatarImages, "load", async url => { images.push(url); return { width: 500, height: 600 }; });
  for (const [presenterKey, { nick }] of Object.entries(PRESENTER_IDENTITIES)) {
    const canvas = { width: 600, height: 600, getContext: () => ({ drawImage: (...args) => draws.push(args) }) };
    const prepared = await prepareInfortuneContestant({ id: presenterKey, isBot: true, presenterKey, nick }, {
      makeCanvas: () => canvas, loadRenderer: () => { throw Error("No compositor for presenters"); },
    });
    assert.equal(prepared, canvas);
  }
  assert.equal(images.length, 5);
  assert.ok(images.every(url => /^\/bots\/presenters\/[^/]+\/frame-\d+\.webp$/.test(url)));
  assert.ok(draws.every(([, x, y, width, height]) => Number.isFinite(x + y) && Math.abs(width / height - 5 / 6) < 1e-10));
  const placed = placeStageContestants([{ id: "1", nick: "Un" }, { id: "2", nick: "Deux" }]);
  assert.deepEqual(placed.map(player => player.nick), ["Un", "Deux"]);
  assert.ok(placed[0].position[0] * placed[1].position[0] < 0);
});

test("the standalone workshop includes all presenter portraits and lightweight buttons", async () => {
  const root = new URL("../../../public/", import.meta.url);
  const files = collectStagePresenterFiles();
  assert.equal(files.size, 11);
  for (const file of files) assert.ok((await stat(new URL(file, root))).size > 0, file);
});
