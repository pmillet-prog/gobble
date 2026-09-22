import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarInventoryRepository } from "../avatars/avatarInventoryRepository.js";
import { createAvatarRepository } from "../avatars/avatarRepository.js";
import { registerAvatarRoutes } from "../avatars/registerAvatarRoutes.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { getAvatarUnlockRule, getLockedAvatarParts, isAvatarPartUnlocked } from "../../shared/avatarUnlocks.js";
import { DEFAULT_AVATAR, createBlankAvatar, normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { validateAvatarConfiguration } from "../avatars/avatarValidation.js";
import { selectAvatarPart, removeAvatarParts } from "../../shared/avatarSelections.js";
import { getAvatarSliders } from "../../src/features/avatar/avatarControls.js";
import { createAccountAvatarSync } from "../../src/features/avatar/createAccountAvatarSync.js";
import { withAvatarAccessories } from "../../shared/avatarObjectives.js";
import { getAvatarPurchasePlan, getOwnedAvatarAppearance } from "../../src/features/avatar/avatarPurchasePlan.js";

const catalog = withAvatarAccessories(JSON.parse(await readFile(new URL("../../public/avatars/v1/catalog.json", import.meta.url))));
const item = (family, id) => ({ family, id });
async function setup(t, balance = 20000, options = {}) {
  let maintenance = false;
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1),(2);
    CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER, updatedAt INTEGER);
    CREATE TABLE gobblar_ledger (installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);`);
  await db.run("INSERT INTO gobblar_profiles VALUES ('1', ?, 0), ('2', ?, 0)", balance, balance);
  const migration = await readFile(new URL("../migrations/2026-09-19-avatar-unlocks.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(await readFile(new URL("../migrations/2026-09-19-game-avatar-objectives.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../migrations/2026-09-19-user-avatars.sql", import.meta.url), "utf8"));
  const args = { getDb: async () => db, runWrite: runSerializedSqliteWrite, loadCatalog: async () => catalog };
  const inventory = createAvatarInventoryRepository(args), repository = createAvatarRepository(args);
  const routes = new Map();
  registerAvatarRoutes({ inventory, repository,
    isMaintenanceModeActive: () => maintenance,
    thumbnails: options.thumbnails,
    router: Object.fromEntries(["get", "put", "post"].map(method => [method, (path, handler) => routes.set(`${method}:${path}`, handler)])),
    getAuthContext: async req => { options.onAuth?.(); return { user: req.identity ? { id: req.identity } : null }; },
    requireAuth: (auth, res) => { if (auth.user) return true; res.status(401).json({ ok: false, error: "auth_required" }); return false; },
  });
  const request = async (method, path, identity = 1, data = {}) => {
    const res = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(`${method}:${path}`)({ identity, query: data, body: data }, res);
    return res;
  };
  return { db, inventory, repository, request, migration, setMaintenance: value => { maintenance = value; } };
}

test("maintenance closes the avatar shop and refuses purchases and saves while profiles stay readable", async t => {
  const { db, request, setMaintenance } = await setup(t, 3000);
  setMaintenance(true);
  for (const identity of [null, 1, 2]) for (const [method, path, data] of [
    ["get", "/avatar/inventory", {}],
    ["post", "/avatar/purchase", { items: [item("base", "homme")] }],
    ["put", "/avatar", { avatar: createBlankAvatar(), expectedRevision: 0 }],
  ]) {
    const response = await request(method, path, identity, { userId: identity, ...data });
    assert.equal(response.statusCode, 503, path);
    assert.equal(response.body.error, "maintenance_mode", path);
  }
  assert.equal((await request("get", "/avatar", 1, { userId: 1 })).statusCode, 200);
  assert.equal((await request("get", "/avatars", 1, { userIds: "1,2" })).statusCode, 200);
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 3000);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM avatar_unlocks")).n, 0);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM user_avatars")).n, 0);
  setMaintenance(false);
  assert.equal((await request("post", "/avatar/purchase", 1, { userId: 1, items: [item("base", "homme")] })).body.spent, 500);
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar: createBlankAvatar(), expectedRevision: 0 })).statusCode, 200);
});

test("maintenance switched on during authentication or PNG rendering prevents an in-flight write", async t => {
  let afterAuth = false, duringRender = false;
  const context = await setup(t, 3000, {
    onAuth: () => { if (afterAuth) context.setMaintenance(true); },
    thumbnails: { render: async () => { if (duringRender) context.setMaintenance(true); return { png: Buffer.from("png"), renderVersion: 1 }; } },
  });
  afterAuth = true;
  assert.equal((await context.request("post", "/avatar/purchase", 1, { userId: 1, items: [item("base", "homme")] })).statusCode, 503);
  afterAuth = false; context.setMaintenance(false);
  await context.inventory.purchase(1, [item("base", "homme")]);
  duringRender = true;
  assert.equal((await context.request("put", "/avatar", 1, { userId: 1, avatar: createBlankAvatar(), expectedRevision: 0 })).statusCode, 503);
  assert.equal((await context.db.get("SELECT COUNT(*) AS n FROM user_avatars")).n, 0);
});

test("queued avatar transactions recheck availability before debiting or saving", async t => {
  const { db } = await setup(t, 3000);
  let maintenance = false;
  const args = { getDb: async () => db, loadCatalog: async () => catalog,
    runWrite: task => { maintenance = true; return runSerializedSqliteWrite(task); } };
  const assertWritable = () => { if (maintenance) throw Object.assign(new Error("maintenance_mode"), { code: "maintenance_mode" }); };
  await assert.rejects(createAvatarInventoryRepository(args).purchase(1, [item("base", "homme")], { assertWritable }), { code: "maintenance_mode" });
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 3000);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 0);
  maintenance = false;
  await assert.rejects(createAvatarRepository(args).save(1, createBlankAvatar(), 0, null, { assertWritable }), { code: "maintenance_mode" });
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM user_avatars")).n, 0);
});

test("all requested prices include paid faces, premium hats and the objective-only crown", () => {
  for (const part of catalog.families.headwear) {
    const rule = getAvatarUnlockRule("headwear", part.id);
    if (part.id === "crown") { assert.equal(rule.type, "objective"); assert.equal(rule.required, 100); }
    else assert.equal(rule.price, ["cowboy", "trilby", "fedora", "boater", "bowler", "panama"].includes(part.id) ? 2000 : 1000, part.id);
  }
  for (const [family, price] of Object.entries({ base: 500, eyes: 1000, hair: 1000, brows: 500, nose: 500, mouths: 500, facialhair: 500, clothes: 5000, backdrops: 5000 })) {
    assert.equal(getAvatarUnlockRule(family, family === "base" ? "homme" : catalog.families[family][0].id).price, price);
  }
  for (const part of catalog.families.glasses) assert.equal(getAvatarUnlockRule("glasses", part.id).price, part.id.startsWith("soleil_") ? 2000 : 1000);
  assert.equal(isAvatarPartUnlocked({ owned: {} }, "base", "homme"), false);
});

test("checkout itemizes unpaid selections and objectives, shows the shortfall and equips the entire purchase", async t => {
  const { request, inventory } = await setup(t, 3000);
  const avatar = { ...createBlankAvatar(), eyes: "open", hair: "quiff", headwear: "cap" };
  const plan = getAvatarPurchasePlan(avatar, catalog, await inventory.get(1));
  assert.equal(plan.total, 3500); assert.equal(plan.missing, 500);
  assert.deepEqual(plan.purchasable.map(({ family, price }) => [family, price]), [["base", 500], ["eyes", 1000], ["hair", 1000], ["headwear", 1000]]);
  const objectivePlan = getAvatarPurchasePlan({ ...avatar, headwear: "crown" }, catalog, await inventory.get(1));
  assert.equal(objectivePlan.total, 2500); assert.equal(objectivePlan.missing, 0);
  assert.equal(objectivePlan.unavailable[0].objective, "mini_tournament_wins");
  assert.ok(objectivePlan.unavailable[0].description);
  const selected = { ...avatar, headwear: "" };
  const purchase = getAvatarPurchasePlan(selected, catalog, await inventory.get(1));
  const bought = await request("post", "/avatar/purchase", 1, { userId: 1, items: purchase.purchasable.map(({ family, id }) => ({ family, id })) });
  assert.equal(bought.body.spent, 2500); assert.equal(bought.body.inventory.balance, 500);
  assert.equal(getAvatarPurchasePlan(selected, catalog, bought.body.inventory).total, 0);
  const saved = await request("put", "/avatar", 1, { userId: 1, avatar: selected, expectedRevision: 0 });
  assert.equal(saved.statusCode, 200); assert.deepEqual(saved.body.avatar, selected);
});

test("wearing an individual purchase preserves owned pieces in place of unpaid trials", async t => {
  const { inventory, request } = await setup(t);
  const owned = (await inventory.purchase(1, [item("base", "homme"), item("hair", "quiff"), item("headwear", "cap")])).inventory;
  const saved = { ...createBlankAvatar(), hair: "quiff" };
  const trial = { ...saved, hair: catalog.families.hair.find(part => part.id !== "quiff").id, headwear: "cap", eyes: "open", auras: "donor" };
  const wearable = getOwnedAvatarAppearance(trial, saved, catalog, owned);
  assert.equal(wearable.hair, "quiff"); assert.equal(wearable.headwear, "cap"); assert.equal(wearable.eyes, "");
  assert.deepEqual(getLockedAvatarParts(wearable, catalog, owned), []);
  assert.notEqual(trial.hair, "quiff", "the pending preview is not mutated");
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar: wearable, expectedRevision: 0 })).statusCode, 200);
  assert.equal(getOwnedAvatarAppearance({ ...trial, base: "femme" }, saved, catalog, owned), null);
});

test("new accessories use server prices and persist a purchased repositioned scar", async t => {
  const { inventory, request } = await setup(t, 5500);
  const prices = { pirate_eyepatch: 1000, freckles: 500, nose_piercing: 500, ear_piercing: 500, scar: 500, diamond_necklace: 2000 };
  for (const [id, price] of Object.entries(prices)) {
    assert.ok(catalog.families.accessories.some(part => part.id === id), id);
    assert.deepEqual(getAvatarUnlockRule("accessories", id), { type: "gobblars", price });
  }
  await inventory.purchase(1, [item("base", "homme")]);
  const avatar = { ...createBlankAvatar(), accessories: "scar", scarDx: -175, scarDy: -30, scarRotation: 35 };
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar, expectedRevision: 0 })).body.error, "avatar_locked");
  const items = Object.keys(prices).map(id => ({ ...item("accessories", id), price: 0 }));
  const bought = await request("post", "/avatar/purchase", 1, { userId: 1, items });
  assert.equal(bought.body.spent, 5000);
  assert.equal(bought.body.inventory.balance, 0);
  assert.equal((await request("post", "/avatar/purchase", 1, { userId: 1, items })).body.spent, 0);
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar, expectedRevision: 0 })).statusCode, 200);
  assert.deepEqual((await request("get", "/avatar", 1, { userId: 1 })).body.avatar, normalizeAvatar(avatar));
});

test("multiple accessories toggle independently, retain scar controls and remove only unavailable trials", () => {
  const old = normalizeAvatar({ accessories: "scar" }, catalog);
  assert.deepEqual(old.accessories, ["scar"]);
  const combined = selectAvatarPart(old, "accessories", "earrings_hoops");
  assert.deepEqual(combined.accessories, ["scar", "earrings_hoops"]);
  assert.equal(getAvatarSliders("accessories", combined).length, 3);
  assert.deepEqual(selectAvatarPart(combined, "accessories", "earrings_hoops", { toggle: false }).accessories, combined.accessories);
  assert.deepEqual(selectAvatarPart(combined, "accessories", "scar").accessories, ["earrings_hoops"]);
  assert.deepEqual(selectAvatarPart(combined, "accessories", "").accessories, []);
  const objectiveTrial = { ...combined, accessories: [...combined.accessories, "participant_tag"] };
  assert.deepEqual(removeAvatarParts(objectiveTrial, [item("accessories", "participant_tag")]).accessories, combined.accessories);
  assert.deepEqual(old.accessories, ["scar"], "the previous appearance remains untouched");
});

test("multiple accessories are priced, purchased and saved together without bypassing any lock", async t => {
  const { inventory, request } = await setup(t, 5000);
  await inventory.purchase(1, [item("base", "homme"), item("accessories", "scar")]);
  const avatar = { ...createBlankAvatar(), nose: "witch_nose", accessories: ["scar", "earrings_hoops", "diamond_necklace", "freckles"] };
  const plan = getAvatarPurchasePlan(avatar, catalog, await inventory.get(1));
  assert.deepEqual(plan.purchasable.map(({ family, id, price }) => [family, id, price]), [
    ["nose", "witch_nose", 500], ["accessories", "earrings_hoops", 500],
    ["accessories", "diamond_necklace", 2000], ["accessories", "freckles", 500],
  ]);
  assert.equal(plan.total, 3500); assert.equal(plan.missing, 0);
  assert.equal(getAvatarPurchasePlan(avatar, catalog, { balance: 3000, owned: { "base:homme": true, "accessories:scar": true } }).missing, 500);
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar, expectedRevision: 0 })).body.error, "avatar_locked");
  const purchase = await inventory.purchase(1, [...plan.purchasable, item("accessories", "earrings_hoops")]);
  assert.equal(purchase.spent, 3500); assert.equal(purchase.inventory.balance, 500);
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar, expectedRevision: 0 })).statusCode, 200);
  assert.deepEqual((await request("get", "/avatars", 2, { userIds: "1" })).body.avatars[1], avatar);
  const trial = { ...avatar, accessories: [...avatar.accessories, "earrings_stars", "participant_tag"] };
  const wearable = getOwnedAvatarAppearance(trial, avatar, catalog, purchase.inventory);
  assert.deepEqual(wearable.accessories, avatar.accessories, "wearing purchased pieces preserves all owned accessories");
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar: trial, expectedRevision: 1 })).body.error, "avatar_locked");
});

test("accessory validation accepts old saves and rejects malformed or unknown lists", async () => {
  const avatar = createBlankAvatar();
  assert.deepEqual((await validateAvatarConfiguration({ ...avatar, accessories: "scar" })).accessories, ["scar"]);
  assert.deepEqual((await validateAvatarConfiguration({ ...avatar, accessories: undefined })).accessories, []);
  for (const accessories of [["scar", "scar"], ["scar", "unknown"], ["../file"], [42], {}, null, [["scar"]]]) {
    assert.equal(await validateAvatarConfiguration({ ...avatar, accessories }), null, JSON.stringify(accessories));
  }
  for (const nose of ["button_nose", "crooked_nose", "witch_nose"]) {
    assert.equal((await validateAvatarConfiguration({ ...avatar, nose })).nose, nose);
    assert.equal(getAvatarUnlockRule("nose", nose).price, 500);
  }
  for (const id of ["earrings_hoops", "earrings_pearls", "earrings_stars", "earrings_gems"]) {
    assert.equal(getAvatarUnlockRule("accessories", id).price, 500);
  }
});

test("repeated and concurrent purchases charge only once and keep the actual wallet in sync", async t => {
  const { inventory, db } = await setup(t, 5000);
  const results = await Promise.all([inventory.purchase(1, [item("headwear", "cowboy"), item("headwear", "cowboy")]), inventory.purchase(1, [item("headwear", "cowboy")])]);
  assert.equal(results.reduce((sum, result) => sum + result.spent, 0), 2000);
  assert.equal((await inventory.get(1)).balance, 3000);
  assert.equal((await inventory.get(2)).owned["headwear:cowboy"], undefined);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM gobblar_ledger")).count, 1);
  assert.equal((await inventory.purchase(1, [item("glasses", "soleil_aviator"), item("headwear", "panama")])).error, "insufficient_funds");
  assert.equal((await inventory.get(1)).balance, 3000);
});

test("failed ledger writes roll back both the debit and ownership", async t => {
  const { inventory, db } = await setup(t, 1000);
  await db.exec("CREATE TRIGGER refuse_ledger BEFORE INSERT ON gobblar_ledger BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(inventory.purchase(1, [item("headwear", "cap")]));
  assert.deepEqual((await inventory.get(1)).owned, {});
  assert.equal((await inventory.get(1)).balance, 1000);
});

test("crown ignores old results, duplicates and other accounts, then unlocks at the 100th new win", async t => {
  const { inventory, db, migration } = await setup(t);
  const start = (await inventory.get(1)).objectiveStartedAt;
  assert.equal(await inventory.recordTournamentWin({ userId: 1, tournamentKey: "old", wonAt: start - 1 }), false);
  assert.equal(await inventory.recordTournamentWin({ userId: 999, tournamentKey: "unknown" }), false);
  for (let i = 0; i < 99; i++) await inventory.recordTournamentWin({ userId: 1, tournamentKey: `room:a${i}`, wonAt: start + 1 });
  await inventory.recordTournamentWin({ userId: 1, tournamentKey: "room:a0", wonAt: start + 2 });
  await inventory.recordTournamentWin({ userId: 2, tournamentKey: "room:other", wonAt: start + 2 });
  assert.equal((await inventory.get(1)).miniTournamentWins, 99);
  assert.equal(isAvatarPartUnlocked(await inventory.get(1), "headwear", "crown"), false);
  assert.equal((await inventory.purchase(1, [item("headwear", "crown")])).error, "avatar_objective_locked");
  await inventory.recordTournamentWin({ userId: 1, tournamentKey: "room:100", wonAt: start + 2 });
  await db.exec(migration);
  assert.equal((await inventory.get(1)).objectiveStartedAt, start);
  assert.equal(isAvatarPartUnlocked(await inventory.get(1), "headwear", "crown"), true);
});

test("API blocks forged accounts, client prices, objective purchases and equipping unpaid assets", async t => {
  const { inventory, repository, request } = await setup(t);
  assert.equal((await request("post", "/avatar/purchase", null, { userId: 1, items: [item("base", "homme")] })).statusCode, 401);
  assert.equal((await request("post", "/avatar/purchase", 2, { userId: 1, items: [item("base", "homme")] })).statusCode, 409);
  const paid = await request("post", "/avatar/purchase", 1, { userId: 1, items: [{ ...item("base", "homme"), price: 0 }] });
  assert.equal(paid.body.spent, 500);
  for (const items of [[item("__proto__", "x")], [item("headwear", "unknown")], [item("mouths", "thin_happy")], [item("auras", "weekly_gold")]]) {
    assert.equal((await request("post", "/avatar/purchase", 1, { userId: 1, items })).body.ok, false);
  }
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar: DEFAULT_AVATAR, expectedRevision: 0 })).body.error, "avatar_locked");
  await repository.save(1, DEFAULT_AVATAR, 0); // A previously saved development avatar grants no ownership.
  assert.equal((await request("get", "/avatar", 1, { userId: 1 })).body.avatar, null);
  assert.deepEqual((await request("get", "/avatars", 1, { userIds: "1" })).body.avatars, {});
  const required = getLockedAvatarParts(DEFAULT_AVATAR, catalog, await inventory.get(1));
  await inventory.purchase(1, required);
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar: DEFAULT_AVATAR, expectedRevision: 1 })).statusCode, 200);
  assert.deepEqual((await request("get", "/avatars", 1, { userIds: "1" })).body.avatars[1], DEFAULT_AVATAR);
});

test("an old local draft cannot bypass locks or prevent the editor from opening", async () => {
  let calls = 0;
  const store = createAccountAvatarSync({ readLocal: () => DEFAULT_AVATAR, cacheLocal() {},
    request: async () => { calls++; return { userId: 1, avatar: null, revision: 4, unlocksRequired: true }; },
  });
  const stop = store.connect(1);
  try { await store.refresh(); assert.equal(calls, 1); assert.equal(store.getSnapshot().avatar, null); assert.equal(store.getSnapshot().ready, true); }
  finally { stop(); }
});

test("Julien's answers are counted once per account/question and grant the tag exactly at 100", async t => {
  const { inventory, db, request } = await setup(t);
  const { started_at: start } = await db.get("SELECT started_at FROM avatar_objective_epochs WHERE objective = 'lepers_correct_answers'");
  const event = (eventKey, userId = 1) => ({ userId, eventKey, occurredAt: start + 1, objective: "lepers_correct_answers" });
  assert.equal((await inventory.objectives.recordBatch([{ ...event("old"), occurredAt: start - 1 }, event("unknown", 999)])).recorded, 0);
  await inventory.objectives.recordBatch(Array.from({ length: 99 }, (_, i) => event(`room:question-${i}`)));
  await inventory.objectives.recordBatch([event("room:question-0"), event("room:question-0", 2)]);
  assert.equal((await inventory.get(1)).lepersCorrectAnswers, 99);
  assert.equal((await inventory.get(2)).lepersCorrectAnswers, 1);
  assert.equal(isAvatarPartUnlocked(await inventory.get(1), "accessories", "participant_tag"), false);
  assert.equal((await inventory.purchase(1, [item("accessories", "participant_tag")])).error, "avatar_objective_locked");
  const results = await Promise.all([inventory.objectives.recordBatch([event("room:100")]), inventory.objectives.recordBatch([event("room:100")])]);
  const rewards = results.flatMap(result => result.rewards);
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].reward.key, "accessories:participant_tag");
  assert.equal(rewards[0].reward.imageUrl, "/avatars/v1/rewards/participant-tag-oval.svg");
  assert.equal((await inventory.get(1)).owned["accessories:participant_tag"], true);
  assert.equal((await inventory.get(1)).balance, 20000);
  assert.equal((await request("get", "/avatar", 1, { userId: 1 })).body.rewards.length, 1);
  assert.equal((await request("post", "/avatar/rewards/ack", 2, { userId: 1, keys: [rewards[0].reward.key] })).statusCode, 409);
  await request("post", "/avatar/rewards/ack", 2, { userId: 2, keys: [rewards[0].reward.key] });
  assert.equal((await inventory.objectives.pending(1)).length, 1);
  assert.equal((await request("post", "/avatar/rewards/ack", 1, { userId: 1, keys: [rewards[0].reward.key] })).statusCode, 200);
  assert.equal((await inventory.objectives.pending(1)).length, 0);
  assert.equal((await inventory.objectives.recordBatch([event("room:101")])).rewards.length, 0);
  assert.equal((await inventory.get(1)).lepersCorrectAnswers, 101, "the statistic continues after the reward");
  const avatar = { ...DEFAULT_AVATAR, accessories: "participant_tag" };
  await inventory.purchase(1, getLockedAvatarParts(avatar, catalog, await inventory.get(1)));
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar, expectedRevision: 0 })).statusCode, 200);
  assert.deepEqual((await request("get", "/avatars", 2, { userIds: "1" })).body.avatars[1].accessories, ["participant_tag"]);
});

test("generic objective migration preserves existing crown progress without resetting new statistics", async t => {
  const { inventory, db } = await setup(t);
  await db.run("INSERT INTO avatar_tournament_wins VALUES (1, 'existing', ?)", Date.now());
  const migration = await readFile(new URL("../migrations/2026-09-19-game-avatar-objectives.sql", import.meta.url), "utf8");
  await db.exec(migration);
  assert.equal((await inventory.get(1)).miniTournamentWins, 1);
  assert.equal((await inventory.get(1)).lepersCorrectAnswers, 0);
  assert.equal(await inventory.recordTournamentWin({ userId: 1, tournamentKey: "existing" }), false);
  await inventory.recordTournamentWin({ userId: 1, tournamentKey: "new" });
  await db.exec(migration);
  assert.equal((await inventory.get(1)).miniTournamentWins, 2);
});

test("a new player buys only the bare face for 500 and adds features individually", async t => {
  const { inventory, request } = await setup(t, 2000);
  const avatar = createBlankAvatar("femme");
  assert.deepEqual(getLockedAvatarParts(avatar, catalog, await inventory.get(1)).map(({ family, id, price }) => ({ family, id, price })), [{ family: "base", id: "femme", price: 500 }]);
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar, expectedRevision: 0 })).statusCode, 403);
  const face = await request("post", "/avatar/purchase", 1, { userId: 1, items: [item("base", "femme")] });
  assert.equal(face.body.spent, 500);
  assert.deepEqual(face.body.inventory.owned, { "base:femme": true });
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar, expectedRevision: 0 })).statusCode, 200);
  assert.deepEqual((await request("get", "/avatar", 1, { userId: 1 })).body.avatar, avatar);
  const withEyes = { ...avatar, eyes: "open" };
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar: withEyes, expectedRevision: 1 })).statusCode, 403);
  const eyes = await request("post", "/avatar/purchase", 1, { userId: 1, items: [item("eyes", "open")] });
  assert.equal(eyes.body.spent, 1000); assert.equal(eyes.body.inventory.balance, 500);
  assert.equal((await request("put", "/avatar", 1, { userId: 1, avatar: withEyes, expectedRevision: 1 })).statusCode, 200);
  assert.equal((await request("get", "/avatars", 2, { userIds: "1" })).body.avatars[1].hair, "");
});

test("lashes require unlocked eyes and can only be worn with eyelids", async t => {
  const { inventory } = await setup(t, 2000);
  const lashes = catalog.families.lashes[0].id;
  const avatar = { ...createBlankAvatar(), lashes };
  assert.equal(isAvatarPartUnlocked(await inventory.get(1), "lashes", lashes), false);
  assert.equal(await inventory.canEquip(1, avatar), false);
  assert.equal((await inventory.purchase(1, [item("lashes", lashes)])).ok, false);
  await inventory.purchase(1, [item("base", "homme"), item("eyes", "open")]);
  assert.equal(isAvatarPartUnlocked(await inventory.get(1), "lashes", lashes), true);
  assert.equal(await inventory.canEquip(1, { ...avatar, eyes: "open" }), true);
  assert.equal(await inventory.canEquip(1, avatar), false);
  assert.equal(getLockedAvatarParts({ ...avatar, eyes: "dots" }, catalog, { owned: { "base:homme": true, "eyes:dots": true } })[0].family, "lashes");
});

test("the tiger costs one million; Tigrou's migration grants only the registered account without charging", async t => {
  const { db, inventory } = await setup(t, 1000000);
  assert.equal(getAvatarUnlockRule("accessories", "tiger_plush").price, 1000000);
  const bought = await inventory.purchase(1, [item("accessories", "tiger_plush")]);
  assert.equal(bought.spent, 1000000);
  assert.equal(bought.inventory.balance, 0);
  assert.equal(bought.inventory.owned["accessories:tiger_plush"], true);
  await db.exec("ALTER TABLE users ADD COLUMN username_normalized TEXT; UPDATE users SET username_normalized = 'tigrou' WHERE id = 2;");
  const migration = await readFile(new URL("../migrations/2026-09-20-tiger-plush.sql", import.meta.url), "utf8");
  await db.exec(migration); await db.exec(migration);
  assert.equal((await inventory.get(2)).owned["accessories:tiger_plush"], true);
  assert.equal((await inventory.get(2)).balance, 1000000);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM gobblar_ledger")).count, 1);
});
