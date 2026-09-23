import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarRepository } from "../avatars/avatarRepository.js";
import { registerAvatarRoutes } from "../avatars/registerAvatarRoutes.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { DEFAULT_AVATAR, AVATAR_ADJUSTMENT_RANGES, normalizeAvatar } from "../../shared/avatarConfiguration.js";
import adjustments from "../../src/features/avatar/renderer/adjustment_limits.js";
import { createAccountAvatarSync } from "../../src/features/avatar/createAccountAvatarSync.js";
import { avatarApiError } from "../../src/features/avatar/avatarApi.js";

const avatar = patch => normalizeAvatar({ ...DEFAULT_AVATAR, ...patch });
const desktopFace = avatar({ hairColor: "#bb4422", glasses: "vue_ronde", glassesDy: -7 });
const phoneFace = avatar({ hairColor: "#112233" });
const catalog = JSON.parse(await readFile(new URL("../../public/avatars/v1/catalog.json", import.meta.url), "utf8"));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

async function harness(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1), (2);");
  const migration = await readFile(new URL("../migrations/2026-09-19-user-avatars.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const createRepository = () => createAvatarRepository({ getDb: async () => db, runWrite: runSerializedSqliteWrite });
  const repository = createRepository();
  const routes = new Map();
  registerAvatarRoutes({
    router: Object.fromEntries(["get", "put"].map(method => [method, (path, handler) => routes.set(`${method}:${path}`, handler)])),
    getAuthContext: async req => ({ user: req.identity ? { id: req.identity } : null }),
    requireAuth: (auth, res) => {
      if (auth.user) return true;
      res.status(401).json({ ok: false, error: "auth_required" });
      return false;
    },
    repository,
  });
  const request = async (method, identity, body = {}, path = "/avatar") => {
    const res = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      set(key, value) { this.headers[key] = value; return this; },
      json(value) { this.body = value; return this; },
    };
    await routes.get(`${method}:${path}`)({ identity, body, query: body }, res);
    return res;
  };
  const device = (initial = null, transform = null, cacheThrows = false) => {
    let local = initial;
    const calls = [];
    const transport = async (userId, options) => {
      calls.push({ userId, ...options });
      const res = await request(options.avatar ? "put" : "get", userId, { userId, ...options });
      if (!res.body.ok) throw avatarApiError(res.body.error);
      return res.body;
    };
    const sync = createAccountAvatarSync({
      request: transform ? transform(transport) : transport,
      readLocal: () => local,
      cacheLocal: (_userId, value) => { if (cacheThrows) throw Error("storage blocked"); local = value; },
      prepareLocal: async value => normalizeAvatar(value, catalog),
    });
    const stop = sync.connect(1);
    t.after(stop);
    return { sync, stop, calls, local: () => local };
  };
  return { db, migration, repository, createRepository, request, device };
}

test("persisted adjustment limits agree with the workshop renderer", () => {
  for (const [key, range] of Object.entries(adjustments.ranges)) assert.deepEqual(AVATAR_ADJUSTMENT_RANGES[key], range, key);
  for (const [key, range] of Object.entries(adjustments.noseRanges)) {
    assert.deepEqual(AVATAR_ADJUSTMENT_RANGES[`nose${key[0].toUpperCase()}${key.slice(1)}`], range);
  }
});

test("skin relief is validated, saved across devices and remains compatible with older clients", async t => {
  const { request, repository } = await harness(t);
  for (const [index, skinStyle] of ["chubby", "defined", "wrinkled", "classic"].entries()) {
    const value = avatar({ base: index % 2 ? "femme" : "homme", skinStyle, tone: "custom", customColor: "#503427" });
    const result = await request("put", 1, { userId: 1, avatar: value, expectedRevision: index });
    assert.equal(result.statusCode, 200);
    assert.equal((await repository.get(1)).avatar.skinStyle, skinStyle);
    assert.equal((await request("get", 1, { userId: 1 })).body.avatar.skinStyle, skinStyle);
  }
  const { skinStyle, ...older } = avatar({});
  assert.equal((await request("put", 1, { userId: 1, avatar: older, expectedRevision: 4 })).body.avatar.skinStyle, "classic");
  for (const invalid of ["unknown", "../../file", null, []]) {
    assert.equal((await request("put", 1, { userId: 1, avatar: { ...older, skinStyle: invalid }, expectedRevision: 5 })).statusCode, 400);
  }
});

test("recap portraits read only requested appearances and refresh after an edit", async t => {
  const { request, repository } = await harness(t);
  await repository.save(1, desktopFace, 0);
  await repository.save(2, phoneFace, 0);
  const read = userIds => request("get", 1, { userIds }, "/avatars");
  const selected = await read("1,1,3");
  assert.equal(selected.statusCode, 200);
  assert.equal(selected.headers["Cache-Control"], "no-store");
  assert.deepEqual(selected.body, { ok: true, avatars: { 1: desktopFace } });
  await repository.save(1, phoneFace, 1);
  assert.deepEqual((await read("1,2")).body.avatars, { 1: phoneFace, 2: phoneFace });
});

test("silhouette is saved across devices, defaults for older clients and rejects invalid widths", async t => {
  const { request } = await harness(t);
  const value = avatar({ silhouetteWidth: 1.12, skinStyle: "chubby", accessories: ["earrings_hoops"] });
  assert.equal((await request("put", 1, { userId: 1, avatar: value, expectedRevision: 0 })).statusCode, 200);
  assert.equal((await request("get", 1, { userId: 1 })).body.avatar.silhouetteWidth, 1.12);
  const { silhouetteWidth, ...older } = value;
  assert.equal((await request("put", 1, { userId: 1, avatar: older, expectedRevision: 1 })).body.avatar.silhouetteWidth, 1);
  for (const invalid of [.79, 1.16, null, "1.1", 1.001]) {
    assert.equal((await request("put", 1, { userId: 1, avatar: { ...value, silhouetteWidth: invalid }, expectedRevision: 2 })).statusCode, 400);
  }
});

test("recap portrait batches require authentication and bounded valid account ids", async t => {
  const { request } = await harness(t);
  assert.equal((await request("get", null, { userIds: "1" }, "/avatars")).statusCode, 401);
  for (const userIds of [undefined, "", "1,", "-1", "1e2", "nick:Tigre", "9007199254740992", Array(25).fill("1").join(",")]) {
    assert.equal((await request("get", 1, { userIds }, "/avatars")).statusCode, 400, String(userIds));
  }
});

test("avatar routes require a session and never select an account from the request body", async t => {
  const { request, repository } = await harness(t);
  for (const method of ["get", "put"]) {
    const anonymous = await request(method, null, { userId: 1, avatar: desktopFace, expectedRevision: 0 });
    assert.equal(anonymous.statusCode, 401);
    assert.equal(anonymous.headers["Cache-Control"], "no-store");
    const switched = await request(method, 2, { userId: 1, avatar: desktopFace, expectedRevision: 0 });
    assert.equal(switched.statusCode, 409);
    assert.equal(switched.body.error, "avatar_account_changed");
  }
  assert.equal((await repository.get(1)).revision, 0);
  assert.equal((await repository.get(2)).revision, 0);
});

test("API validates catalog parts, colours, adjustments and revision before writing", async t => {
  const { request, repository } = await harness(t);
  for (const invalid of [null, {}, [], { ...desktopFace, version: 99 }, { ...desktopFace, image: "data:image/png" },
    { ...desktopFace, hair: "../../secrets" }, { ...desktopFace, hair: "missing_asset" },
    { ...desktopFace, hairColor: "red" }, { ...desktopFace, glassesScale: 500 }, { ...desktopFace, dx: null }]) {
    const res = await request("put", 1, { userId: 1, expectedRevision: 0, avatar: invalid });
    assert.equal(res.statusCode, 400, JSON.stringify(invalid));
  }
  for (const expectedRevision of [undefined, -1, 1.5, "0"]) {
    assert.equal((await request("put", 1, { userId: 1, expectedRevision, avatar: desktopFace })).statusCode, 400);
  }
  assert.equal((await repository.get(1)).revision, 0);
  assert.equal((await request("put", 1, { userId: 1, expectedRevision: 0, avatar: desktopFace })).statusCode, 200);
});

test("scar controls accept older clients but reject malformed positions", async t => {
  const { request } = await harness(t);
  const { scarDx, scarDy, scarRotation, ...olderClient } = desktopFace;
  assert.equal((await request("put", 1, { userId: 1, avatar: olderClient, expectedRevision: 0 })).statusCode, 200);
  assert.deepEqual((await request("get", 1, { userId: 1 })).body.avatar, desktopFace);
  for (const patch of [{ scarDx: -271 }, { scarDy: 111 }, { scarRotation: 91 }, { scarDx: null }, { scarRotation: "25" }]) {
    assert.equal((await request("put", 1, { userId: 1, avatar: { ...desktopFace, ...patch }, expectedRevision: 1 })).statusCode, 400);
  }
});

test("avatar persists in SQLite, migrations are repeatable and accounts are isolated", async t => {
  const { db, migration, repository, createRepository } = await harness(t);
  await repository.save(1, desktopFace, 0);
  await repository.save(2, phoneFace, 0);
  await db.exec(migration);
  assert.deepEqual((await createRepository().get(1)).avatar, desktopFace);
  assert.deepEqual((await createRepository().get(2)).avatar, phoneFace);
  await db.run("DELETE FROM users WHERE id = 1");
  assert.equal((await repository.get(1)).avatar, null);
  assert.equal((await repository.get(2)).revision, 1);
});

test("desktop saves reach a phone with an old local avatar and survive a fresh device", async t => {
  const { device, repository } = await harness(t);
  const desktop = device(desktopFace);
  await desktop.sync.refresh();
  const phone = device(phoneFace);
  await phone.sync.refresh();
  assert.deepEqual(phone.sync.getSnapshot().avatar, desktopFace);
  assert.equal(phone.calls.filter(call => call.avatar).length, 0, "an old phone never uploads over an existing account");
  const changed = avatar({ ...desktopFace, backgroundColor: "#aa7711", glassesDx: 4 });
  await desktop.sync.save(1, changed, 1);
  await phone.sync.refresh();
  assert.deepEqual(phone.sync.getSnapshot().avatar, changed);
  assert.deepEqual(phone.local(), changed);
  const freshPhone = device();
  await freshPhone.sync.refresh();
  assert.deepEqual(freshPhone.sync.getSnapshot().avatar, changed);
  assert.equal((await repository.get(1)).revision, 2);
});

test("an untouched device does not populate an empty account before the existing desktop avatar arrives", async t => {
  const { device, repository } = await harness(t);
  const phone = device();
  await phone.sync.refresh();
  assert.equal((await repository.get(1)).avatar, null);
  const desktop = device(desktopFace);
  await desktop.sync.refresh();
  await phone.sync.refresh();
  assert.deepEqual(phone.sync.getSnapshot().avatar, desktopFace);
});

test("legacy local choices migrate to the same supported configuration used by the renderer", async t => {
  const { device, repository } = await harness(t);
  const legacy = { ...desktopFace, mouths: "thin_happy", headwear: "old_removed_hat", glassesDy: -999 };
  const desktop = device(legacy);
  await desktop.sync.refresh();
  const expected = normalizeAvatar(legacy, catalog);
  assert.deepEqual((await repository.get(1)).avatar, expected);
  assert.deepEqual(desktop.sync.getSnapshot().avatar, expected);
});

test("simultaneous first-device migrations preserve the first avatar without an overwrite", async t => {
  const { device, repository } = await harness(t);
  const gate = deferred();
  let reads = 0;
  const holdInitialReads = transport => async (userId, options) => {
    const result = await transport(userId, options);
    if (!options.avatar && result.revision === 0) {
      if (++reads === 2) gate.resolve();
      await gate.promise;
    }
    return result;
  };
  const desktop = device(desktopFace, holdInitialReads), phone = device(phoneFace, holdInitialReads);
  await Promise.all([desktop.sync.refresh(), phone.sync.refresh()]);
  assert.equal((await repository.get(1)).revision, 1);
  assert.deepEqual(desktop.sync.getSnapshot().avatar, phone.sync.getSnapshot().avatar);
});

test("a stale editor receives a conflict instead of overwriting a more recent device save", async t => {
  const { device, repository } = await harness(t);
  const desktop = device(desktopFace);
  await desktop.sync.refresh();
  const phone = device();
  await phone.sync.refresh();
  await desktop.sync.save(1, phoneFace, 1);
  await assert.rejects(phone.sync.save(1, desktopFace, 1), { code: "avatar_conflict" });
  assert.deepEqual((await repository.get(1)).avatar, phoneFace);
  assert.deepEqual(phone.sync.getSnapshot().avatar, desktopFace, "failed save does not publish a new avatar");
  await phone.sync.refresh();
  assert.deepEqual(phone.sync.getSnapshot().avatar, phoneFace);
});

test("failed saves keep the confirmed avatar and can be retried", async t => {
  const { device } = await harness(t);
  let fail = false;
  const desktop = device(desktopFace, transport => (userId, options) => {
    if (fail && options.avatar) throw avatarApiError();
    return transport(userId, options);
  });
  await desktop.sync.refresh();
  fail = true;
  await assert.rejects(desktop.sync.save(1, phoneFace, 1));
  assert.deepEqual(desktop.local(), desktopFace);
  assert.deepEqual(desktop.sync.getSnapshot().avatar, desktopFace);
  fail = false;
  await desktop.sync.save(1, phoneFace, 1);
  assert.deepEqual(desktop.sync.getSnapshot().avatar, phoneFace);
});

test("server persistence works when browser storage is unavailable", async t => {
  const { device, repository } = await harness(t);
  const desktop = device(null, null, true);
  await desktop.sync.refresh();
  await desktop.sync.save(1, desktopFace, 0);
  assert.deepEqual(desktop.sync.getSnapshot().avatar, desktopFace);
  assert.deepEqual((await repository.get(1)).avatar, desktopFace);
});

test("late responses after logout cannot publish or migrate an avatar", async t => {
  const { device, repository } = await harness(t);
  const gate = deferred();
  let signal;
  const desktop = device(desktopFace, transport => async (userId, options) => {
    signal = options.signal;
    const result = await transport(userId, options);
    await gate.promise;
    return result;
  });
  const pending = desktop.sync.refresh();
  desktop.stop();
  assert.equal(signal.aborted, true);
  gate.resolve();
  await assert.rejects(pending, { code: "avatar_account_changed" });
  assert.equal(desktop.sync.getSnapshot().userId, null);
  assert.equal((await repository.get(1)).avatar, null);
});

test("overlapping refreshes coalesce and an older read cannot undo a save", async t => {
  const { device } = await harness(t);
  let hold = false;
  const gate = deferred();
  const desktop = device(desktopFace, transport => async (userId, options) => {
    const result = await transport(userId, options);
    if (hold && !options.avatar) await gate.promise;
    return result;
  });
  await desktop.sync.refresh();
  hold = true;
  const read = desktop.sync.refresh();
  assert.equal(read, desktop.sync.refresh());
  const save = desktop.sync.save(1, phoneFace, 1);
  assert.equal(save, desktop.sync.refresh());
  gate.resolve();
  await Promise.all([read, save]);
  assert.deepEqual(desktop.sync.getSnapshot().avatar, phoneFace);
  assert.equal(desktop.sync.getSnapshot().revision, 2);
});
test("a midnight reward waits for an older account read, then fetches the newly unlocked aura once", async () => {
  let finishOldRead, calls = 0;
  const oldRead = new Promise(resolve => { finishOldRead = resolve; });
  const fresh = { userId: 1, avatar: null, revision: 0, unlocksRequired: true, rewards: [{ key: "auras:weekly_gold@new" }] };
  const sync = createAccountAvatarSync({ request: async () => ++calls === 1 ? oldRead : fresh, readLocal: () => null, cacheLocal: () => {} });
  const received = [];
  sync.subscribeRewards(payload => received.push(...(payload.rewards || [])));
  const disconnect = sync.connect(1);
  const refreshes = [sync.refreshAfterPending(), sync.refreshAfterPending()];
  finishOldRead({ ...fresh, rewards: [] });
  await Promise.all(refreshes);
  assert.equal(calls, 2);
  assert.deepEqual(received, fresh.rewards);
  disconnect();
});
