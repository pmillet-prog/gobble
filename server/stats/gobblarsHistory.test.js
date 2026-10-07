import test from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { initGobblarsHistory, readGobblarsHistory } from "./gobblarsHistory.js";
import { gobblarsHistoryDetails } from "./gobblarsHistoryDetails.js";
import { registerGobblarsHistoryRoute } from "./registerGobblarsHistoryRoute.js";
import { presentGobblarsGain } from "../../src/features/gobblars/gobblarsHistoryModel.js";

const now = Date.parse("2026-10-06T12:00:00Z");
async function fixture(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`CREATE TABLE gobblar_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT,
    installId TEXT NOT NULL, ts INTEGER NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, meta TEXT)`);
  await initGobblarsHistory(db);
  const add = (amount, reason, meta = null, installId = "7", ts = now) => db.run(
    "INSERT INTO gobblar_ledger (installId,ts,delta,reason,meta) VALUES (?,?,?,?,?)",
    installId, ts, amount, reason, typeof meta === "string" ? meta : JSON.stringify(meta)
  );
  return { db, add, read: options => readGobblarsHistory(db, { installId: "7", ...options }) };
}

test("one mini-tournament groups all gobbles and its medal, without mixing accounts, rooms or simultaneous tournaments", async t => {
  const { add, read } = await fixture(t);
  const meta = { tournamentId: "one", tournamentStartedAt: now - 60000, roomId: "main" };
  await add(2, "live_gobble", meta);
  await add(1, "live_gobble", meta);
  await add(10, "tournament_medal", { ...meta, medal: "gold" });
  await add(99, "live_gobble", meta, "8");
  await add(-500, "avatar_unlock");
  await add(1, "live_gobble", { ...meta, tournamentId: "two" });
  await add(1, "live_gobble", { ...meta, roomId: "other" });
  const { entries } = await read();
  assert.equal(entries.length, 4);
  assert.equal(entries[2].kind, "avatar_unlock");
  assert.equal(entries[2].amount, -500);
  assert.equal(entries[3].kind, "tournament");
  assert.equal(entries[3].amount, 13);
  assert.equal(entries[3].gobbles, 3);
  assert.equal(entries[3].medalAmount, 10);
  assert.deepEqual(entries[3].medals, { gold: 1, silver: 0, bronze: 0 });
  assert.equal(entries[3].at, now - 60000);
  const display = presentGobblarsGain(entries[3]);
  assert.equal(display.title, "Mini-tournoi");
  assert.match(display.date, /13:59/);
  assert.match(display.detail, /3 gobbles : \+3.*1 or.*\+10/);
});

test("old live gains are compact by UTC day; daily challenges and all other credits remain identifiable", async t => {
  const { add, read } = await fixture(t);
  await add(1, "live_gobble", { roundId: 123 });
  await add(2, "live_gobble", { roundId: 456 });
  await add(3, "tournament_medal", { medal: "bronze" });
  await add(1, "live_gobble", null, "7", now - 86400000);
  await add(1, "daily_gobbles", { dateId: "2026-10-06" });
  await add(3, "daily_gobbles", { dateId: "2026-10-06" });
  for (const reason of ["avatar_starter", "global_bonus", "weekly_duel_winner", "avatar_face_gift", "avatar_refund"]) await add(500, reason);
  await add(3, "manual", "invalid legacy JSON");
  const { entries } = await read();
  assert.equal(entries.length, 9);
  const old = entries.find(entry => entry.kind === "legacy_live" && entry.dateId === "2026-10-06");
  assert.equal(old.amount, 6);
  assert.equal(old.gobbles, 3);
  assert.equal(presentGobblarsGain(old).date, "06/10/2026 (UTC)");
  assert.equal(entries.find(entry => entry.kind === "daily_gobbles").amount, 4);
  assert.equal(entries[0].kind, "manual");
});

test("pagination stays complete and stable when a late gain updates an older tournament", async t => {
  const { add, read } = await fixture(t);
  for (let i = 0; i < 33; i++) await add(1, "live_gobble", { tournamentId: `t-${i}`, roomId: "main" });
  const first = await read();
  assert.equal(first.entries.length, 30);
  assert.ok(first.nextBefore);
  await add(10, "tournament_medal", { tournamentId: "t-0", roomId: "main", medal: "gold" });
  const second = await read({ before: first.nextBefore, snapshot: first.snapshot });
  assert.equal(second.entries.length, 3);
  assert.equal(second.nextBefore, null);
  assert.equal(new Set([...first.entries, ...second.entries].map(entry => entry.id)).size, 33);
  assert.equal(second.entries.at(-1).amount, 1);
  assert.equal((await read()).entries[0].amount, 11);
  for (const before of [-1, 1.5, "1 OR 1=1", "NaN"]) await assert.rejects(read({ before }), /invalid_cursor/);
});

test("history includes actual signed purchases, weekly rewards and avatar resets without exposing ledger metadata", async t => {
  const { add, read } = await fixture(t);
  const itemDetails = [{ key: "headwear:cowboy", label: "Cowboy au moment de l’achat", amount: 1800 }];
  await add(-1800, "avatar_unlock", { items: ["headwear:cowboy"], itemDetails, internal: "secret" });
  await add(-1000, "theme_unlock_full", { requiredUnlocks: ["font:rounded", "background:solid-night"],
    itemDetails: [{ key: "font:rounded", amount: 500 }, { key: "background:solid-night", amount: 500 }], categoriesToApply: ["font", "background"] });
  await add(100, "weekly_duel_winner", { weekId: "2026-W40", accountId: "private" });
  await add(1800, "avatar_refund", { items: ["headwear:cowboy"], itemDetails, purchaseIds: [1], token: "private" });
  await add(0, "manual");
  await add(-500, "theme_unlock_single", { requiredUnlocks: ["font:serif"] }, "8");
  const { entries } = await read();
  assert.deepEqual(entries.map(entry => [entry.kind, entry.amount]), [
    ["avatar_refund", 1800], ["weekly_duel_winner", 100], ["theme_unlock_full", -1000], ["avatar_unlock", -1800],
  ]);
  assert.deepEqual(entries[0].items, itemDetails);
  assert.deepEqual(entries[3].items, itemDetails);
  assert.equal(entries[1].weekId, "2026-W40");
  assert.deepEqual(entries[2].items, [{ key: "font:rounded", amount: 500 }, { key: "background:solid-night", amount: 500 }]);
  assert.doesNotMatch(JSON.stringify(entries), /secret|private|purchaseIds|categoriesToApply|internal|accountId|token/);
});

test("legacy item names use the avatar catalogue without repricing; stored names survive catalogue changes", async () => {
  let loads = 0;
  const loadCatalog = async () => {
    loads++;
    return { families: { headwear: [{ id: "cowboy", label: "Cowboy actuel", price: 9999 }] } };
  };
  let details = await gobblarsHistoryDetails("avatar_unlock", JSON.stringify({ items: ["headwear:cowboy", "headwear:retired", "headwear:cowboy"] }), { loadCatalog });
  assert.deepEqual(details, { items: [{ key: "headwear:cowboy", label: "Cowboy actuel" }, { key: "headwear:retired" }] });
  details = await gobblarsHistoryDetails("avatar_refund", JSON.stringify({ items: ["headwear:cowboy"],
    itemDetails: [{ key: "headwear:cowboy", label: "Cowboy acheté", amount: 1800 }] }), { loadCatalog });
  assert.deepEqual(details, { items: [{ key: "headwear:cowboy", label: "Cowboy acheté", amount: 1800 }] });
  await gobblarsHistoryDetails("theme_unlock_single", JSON.stringify({ requiredUnlocks: ["font:serif"] }), { loadCatalog });
  await gobblarsHistoryDetails("weekly_duel_winner", JSON.stringify({ weekId: "2026-W40" }), { loadCatalog });
  assert.equal(loads, 1);
});

test("malformed legacy details remain readable and only allowlisted presentation data is returned", async () => {
  const unavailable = { loadCatalog: async () => { throw new Error("catalogue unavailable"); } };
  for (const data of ["broken", "null", "[]", "{}", "42"]) {
    assert.deepEqual(await gobblarsHistoryDetails("avatar_unlock", data, unavailable), {});
  }
  const details = await gobblarsHistoryDetails("avatar_unlock", JSON.stringify({
    items: ["headwear:cowboy", null, "broken:key:extra", "../private"],
    itemDetails: [{ key: "headwear:cowboy", label: "", amount: -100 }, { key: "headwear:fedora", label: "Not purchased", amount: 2000 }],
  }), unavailable);
  assert.deepEqual(details, { items: [{ key: "headwear:cowboy" }] });
  assert.deepEqual(await gobblarsHistoryDetails("manual", JSON.stringify({ items: ["headwear:cowboy"], private: "value" })), {});
  assert.deepEqual(await gobblarsHistoryDetails("weekly_duel_winner", JSON.stringify({ weekId: "not a week" })), {});
});

test("mixed credit/debit pagination is stable across new purchases and refunds", async t => {
  const { add, read } = await fixture(t);
  for (let index = 0; index < 33; index++) await add(index % 2 ? -500 : 500, index % 2 ? "theme_unlock_single" : "manual");
  const first = await read();
  await add(-1500, "avatar_unlock");
  await add(1500, "avatar_refund");
  const second = await read({ before: first.nextBefore, snapshot: first.snapshot });
  assert.equal(first.entries.length, 30);
  assert.equal(second.entries.length, 3);
  assert.equal(second.nextBefore, null);
  assert.equal(new Set([...first.entries, ...second.entries].map(entry => entry.id)).size, 33);
  assert.deepEqual((await read()).entries.slice(0, 2).map(entry => entry.amount), [1500, -1500]);
});

function route(dependencies) {
  let handler;
  registerGobblarsHistoryRoute({ get: (_url, fn) => { handler = fn; } }, dependencies);
  const res = { statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { handler, res };
}

test("HTTP history uses only the authenticated identity and honors authentication and rate limiting", async () => {
  const calls = [];
  const dependencies = {
    requireIdentity: async () => ({ installId: "7", userId: 7 }), checkRateLimit: () => true,
    readHistory: async payload => { calls.push(payload); return { entries: [] }; },
  };
  let { handler, res } = route(dependencies);
  await handler({ query: { installId: "victim", userId: 8, before: "12", snapshot: "22" } }, res);
  assert.deepEqual(calls, [{ installId: "7", before: "12", snapshot: "22" }]);
  assert.equal(res.body.accountId, "7");
  ({ handler, res } = route({ ...dependencies, requireIdentity: async () => null }));
  await handler({}, res);
  ({ handler, res } = route({ ...dependencies, checkRateLimit: () => false }));
  await handler({}, res);
  assert.equal(calls.length, 1);
  ({ handler, res } = route({ ...dependencies, readHistory: async () => { throw new Error("invalid_cursor"); } }));
  await handler({}, res);
  assert.equal(res.statusCode, 400);
});
