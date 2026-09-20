import test from "node:test";
import assert from "node:assert/strict";
import { collectRecapAvatarIds, recapAvatarUserId } from "./weeklyRecapAvatars.js";

test("recap portraits use account identities, never nicknames or bot homonyms", () => {
  assert.equal(recapAvatarUserId({ userId: 12, nick: "Tigre" }), 12);
  assert.equal(recapAvatarUserId({ installId: "12" }), 12);
  assert.equal(recapAvatarUserId({ playerKey: "install:12" }), 12);
  for (const entry of [{ nick: "12" }, { playerKey: "nick:12" }, { installId: "device-12" }, { installId: "1e2" }, { userId: 12, isBot: true }]) {
    assert.equal(recapAvatarUserId(entry), null);
  }
});

test("the batch covers visible contributors, records and the fallback weekly podium once", () => {
  const summary = {
    weekStartTs: 1000,
    contributorsByTeam: { red: [1, 2, 3, 4, 5, 6].map(installId => ({ installId })) },
    weeklyRecords: { medals: [{ playerKey: "install:2" }, { userId: 7 }, { userId: 8, avatar: { version: 1 } }] },
  };
  const stats = { weekStartTs: 1000 + 7 * 86400000, previousWeeklyVocabPodium: [{ playerKey: "install:9" }] };
  assert.deepEqual(collectRecapAvatarIds(summary, stats, 1), [2, 3, 4, 5, 7, 9]);
  assert.deepEqual(collectRecapAvatarIds({ ...summary, weeklyVocabPodium: [] }, stats, 1), [2, 3, 4, 5, 7]);
});
