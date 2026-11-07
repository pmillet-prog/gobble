import assert from "node:assert/strict";
import test from "node:test";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createUserUiSeenRepository } from "./userUiSeenRepository.js";
import { ACCOUNT_SEEN_MARKERS, buildSpecialTutorialSeenMarker } from "../../src/utils/accountSeenMarkers.js";

async function fixture(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`CREATE TABLE user_ui_seen (
    user_id INTEGER NOT NULL, marker TEXT NOT NULL, seen_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, marker))`);
  let timestamp = 100;
  const createRepository = () => createUserUiSeenRepository({
    getDb: async () => db, runWrite: task => task(), now: () => timestamp++,
  });
  const addAnnouncements = (count, userId = 1) => db.run(
    `WITH RECURSIVE history(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM history WHERE n < ?)
     INSERT INTO user_ui_seen (user_id, marker, seen_at)
     SELECT ?, 'broadcast:announcement-' || n, 1000+n FROM history`, count, userId
  );
  return { db, createRepository, repository: createRepository(), addAnnouncements };
}

test("reloading an established account retains tutorials behind more than 64 newer notices", async t => {
  const { repository, createRepository, addAnnouncements } = await fixture(t);
  const tutorials = [ACCOUNT_SEEN_MARKERS.mainTutorial, ACCOUNT_SEEN_MARKERS.guidedResultsTutorial,
    buildSpecialTutorialSeenMarker("3words"), "duel-tutorial:duel-v1"];
  await repository.mark(1, tutorials);
  await addAnnouncements(130);

  // A fresh repository reads saved progress, without any browser/session cache.
  const reloaded = await createRepository().list(1);
  assert.equal(reloaded.length, 134);
  for (const marker of tutorials) assert.ok(reloaded.includes(marker), marker);
  assert.ok(reloaded.includes("broadcast:announcement-1"));
  assert.ok(reloaded.includes("broadcast:announcement-130"));
});

test("rotating notices cannot evict onboarding even at the account read limit", async t => {
  const { repository, addAnnouncements } = await fixture(t);
  const permanent = [...Object.values(ACCOUNT_SEEN_MARKERS),
    buildSpecialTutorialSeenMarker("3words"), "duel-tutorial:duel-v1"];
  await repository.mark(1, permanent);
  await addAnnouncements(5100);
  const markers = await repository.list(1);
  assert.equal(markers.length, 5000);
  for (const marker of permanent) assert.ok(markers.includes(marker), marker);
  assert.ok(markers.includes("broadcast:announcement-5100"));
  assert.equal(markers.includes("broadcast:announcement-1"), false);
});

test("new accounts stay eligible for onboarding and never inherit another account's history", async t => {
  const { repository } = await fixture(t);
  await repository.mark(1, ACCOUNT_SEEN_MARKERS.mainTutorial);
  assert.deepEqual(await repository.list(2), []);
  await repository.mark(2, "chat-rules:v1");
  assert.deepEqual(await repository.list(2), ["chat-rules:v1"]);
  assert.deepEqual(await repository.list(1), [ACCOUNT_SEEN_MARKERS.mainTutorial]);
});

test("write validation and batch limit remain independent of the larger read history", async t => {
  const { repository } = await fixture(t);
  const input = [null, "", " ", "a\nb", "a".repeat(181), " tutorial:main:v1 ", "tutorial:main:v1",
    ...Array.from({ length: 70 }, (_, i) => `broadcast:${i}`)];
  const saved = await repository.mark(1, input);
  assert.equal(saved.length, 64);
  assert.equal(saved[0], "tutorial:main:v1");
  assert.equal((await repository.list(1)).length, 64);
  await repository.mark(1, "tutorial:special:v2:target");
  assert.equal((await repository.list(1)).length, 65);
  for (const userId of [null, -1, 0, 1.5, "invalid"]) {
    assert.deepEqual(await repository.mark(userId, "tutorial:main:v1"), []);
    assert.deepEqual(await repository.list(userId), []);
  }
});

test("renewing a transient notice preserves tutorials and other accounts", async t => {
  const { repository, db } = await fixture(t);
  await repository.mark(1, ["vocab-overlay:old", ACCOUNT_SEEN_MARKERS.mainTutorial]);
  await repository.mark(2, "vocab-overlay:other");
  await repository.mark(1, "vocab-overlay:new");
  await repository.mark(1, ACCOUNT_SEEN_MARKERS.mainTutorial);
  assert.deepEqual(new Set(await repository.list(1)), new Set([
    ACCOUNT_SEEN_MARKERS.mainTutorial, "vocab-overlay:new",
  ]));
  assert.deepEqual(await repository.list(2), ["vocab-overlay:other"]);
  assert.equal((await db.get("SELECT count(*) AS n FROM user_ui_seen WHERE user_id = 1")).n, 2);
});
