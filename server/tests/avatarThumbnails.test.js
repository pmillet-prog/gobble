import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarRepository } from "../avatars/avatarRepository.js";
import { createAvatarThumbnailRenderer } from "../avatars/avatarThumbnailRenderer.js";
import { registerAvatarRoutes } from "../avatars/registerAvatarRoutes.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { loadImage } from "@napi-rs/canvas";

const avatar = normalizeAvatar({});
async function harness(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1), (2);");
  for (const name of ["2026-09-19-user-avatars.sql", "2026-09-20-avatar-thumbnails.sql"]) {
    await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  const repository = createAvatarRepository({ getDb: async () => db, runWrite: runSerializedSqliteWrite });
  return { db, repository };
}

test("one thumbnail per account, atomic replacement, conflicts and account deletion", async t => {
  const { db, repository } = await harness(t);
  const old = { png: Buffer.from("old-png"), renderVersion: 1 };
  const newer = { png: Buffer.from("new-png"), renderVersion: 1 };
  await repository.save(1, avatar, 0, old);
  await repository.save(1, avatar, 1, newer);
  assert.deepEqual((await repository.getThumbnail(1)).png, newer.png);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM user_avatar_thumbnails")).n, 1);
  assert.equal((await repository.save(1, avatar, 1, old)).saved, false);
  assert.deepEqual((await repository.getThumbnail(1)).png, newer.png);
  await repository.save(2, avatar, 0, old);
  await db.run("DELETE FROM users WHERE id = 1");
  assert.equal(await repository.getThumbnail(1), undefined);
  assert.deepEqual((await repository.getThumbnail(2)).png, old.png);
});

test("thumbnail routes enforce identity, validate ownership and notify only committed saves", async t => {
  const { repository } = await harness(t);
  const routes = new Map(), updates = [];
  let jobs = 0, failing = false;
  const thumbnails = { get: repository.getThumbnail, render: async () => {
    jobs++;
    if (failing) throw new Error("render failed");
    return { png: Buffer.from("png"), renderVersion: 1 };
  } };
  registerAvatarRoutes({
    router: Object.fromEntries(["get", "put"].map(method => [method, (path, handler) => routes.set(`${method}:${path}`, handler)])),
    getAuthContext: async req => ({ user: req.identity ? { id: req.identity } : null }),
    requireAuth: (auth, res) => auth.user ? true : (res.status(401).json({ ok: false }), false),
    repository, thumbnails, onSaved: value => updates.push(value),
  });
  async function request(key, identity, body = {}, headers = {}) {
    const res = {
      statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      set(key, value) { this.headers[key] = value; return this; },
      json(value) { this.body = value; return this; }, type(value) { this.contentType = value; return this; },
      send(value) { this.body = value; return this; }, end() { return this; }, redirect(code, url) { this.statusCode = code; this.location = url; return this; },
    };
    await routes.get(key)({ identity, body, query: body, params: { userId: String(body.userId || "1") }, headers }, res);
    return res;
  }
  const write = expectedRevision => ({ userId: 1, avatar, expectedRevision });
  assert.equal((await request("put:/avatar", 2, write(0))).statusCode, 409);
  assert.equal(jobs, 0);
  assert.equal((await request("put:/avatar", 1, write(0))).statusCode, 200);
  assert.deepEqual(updates, [{ userId: 1, revision: 1 }]);
  assert.equal((await request("put:/avatar", 1, write(0))).statusCode, 409);
  assert.equal(jobs, 1);
  const endpoint = "get:/avatars/:userId/chat.png";
  assert.equal((await request(endpoint, null)).statusCode, 401);
  const image = await request(endpoint, 1, { userId: 1, v: "1" });
  assert.equal(image.contentType, "png");
  assert.equal(image.headers["Cache-Control"], "private, max-age=86400");
  assert.equal((await request(endpoint, 1, { userId: 1 }, { "if-none-match": image.headers.ETag })).statusCode, 304);
  const missing = await request(endpoint, 1, { userId: 2 });
  assert.equal(missing.statusCode, 204);
  assert.equal(missing.location, undefined);
  assert.equal(jobs, 1, "reading messages never runs the compositor");
  failing = true;
  assert.equal((await request("put:/avatar", 1, write(1))).statusCode, 503);
  assert.equal((await repository.get(1)).revision, 1);
  assert.equal(updates.length, 1);
});

test("the isolated renderer produces small, distinct 64px PNGs from real approved assets", async t => {
  const renderer = createAvatarThumbnailRenderer();
  t.after(() => renderer.dispose());
  const first = await renderer.render(avatar);
  const second = await renderer.render(normalizeAvatar({ headwear: "newsboy", hairColor: "#bb4422" }));
  for (const result of [first, second]) {
    assert.deepEqual([...result.png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const image = await loadImage(result.png);
    assert.equal(image.width, 64);
    assert.equal(image.height, 64);
    assert.ok(result.png.length < 20000);
  }
  assert.notDeepEqual(first.png, second.png);
  const temporary = await renderer.render({ ...avatar, auras: "weekly_gold" });
  assert.deepEqual(temporary.png, first.png, "temporary auras cannot get stuck in a cached chat PNG");
  for (const accessories of ["pirate_eyepatch", "freckles", "nose_piercing", "ear_piercing", "scar"]) {
    const equipped = await renderer.render({ ...avatar, accessories });
    assert.ok(!equipped.png.equals(first.png), `${accessories} remains visible in chat`);
  }
  const originalScar = await renderer.render({ ...avatar, accessories: "scar" });
  const movedScar = await renderer.render({ ...avatar, accessories: "scar", scarDx: -175, scarDy: -30, scarRotation: 35 });
  assert.ok(!movedScar.png.equals(originalScar.png), "chat uses the saved scar placement");
});
