import test from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createTargetQuizProgressRepository } from "./targetQuizProgressRepository.js";

test("durable cursors round-trip independently through a new repository instance", async t => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  const options = { getDb: async () => db, now: () => 123456 };
  const repository = createTargetQuizProgressRepository(options);
  assert.equal(await repository.load("user:1"), null);
  const cursor = { version: "catalog-v1", routeIndex: 3, questionIndex: 1234 };
  await repository.save("user:1", cursor);
  await repository.save("install:guest", { ...cursor, questionIndex: 17 });
  await repository.save("dev:user:1", { ...cursor, questionIndex: 500 });
  const reopened = createTargetQuizProgressRepository(options);
  assert.deepEqual(await reopened.load("user:1"), cursor);
  assert.equal((await reopened.load("install:guest")).questionIndex, 17);
  assert.equal((await reopened.load("dev:user:1")).questionIndex, 500);
  await reopened.save("user:1", { ...cursor, routeIndex: 4, questionIndex: 0 });
  assert.deepEqual(await repository.load("user:1"), { ...cursor, routeIndex: 4, questionIndex: 0 });
  assert.equal((await db.get("SELECT count(*) AS n FROM target_quiz_progress")).n, 3);
  assert.equal((await db.get("SELECT updated_at AS at FROM target_quiz_progress WHERE player_key = ?", "user:1")).at, 123456);
});

test("storage initialization failures propagate and can be retried without caching the failure", async t => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  let fail = true;
  const repository = createTargetQuizProgressRepository({ getDb: async () => {
    if (fail) throw new Error("database_unavailable");
    return db;
  } });
  await assert.rejects(repository.load("user:1"), /database_unavailable/);
  fail = false;
  assert.equal(await repository.load("user:1"), null);
  await assert.rejects(repository.save("user:1", { version: "v1", routeIndex: -1, questionIndex: 1 }), /invalid.*progress/);
  await assert.rejects(repository.load(""), /invalid.*player/);
});
