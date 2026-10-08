import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPresenterHitsService, createPresenterHitsFileStore } from "./presenterHitsService.js";
import { getPresenterHitsWeekStartTs } from "../../shared/presenterHits.js";

const STREAM = "test-stream-session-123";
const start = Date.parse("2026-10-08T12:00:00Z");
async function fixture(options = {}) {
  let time = start;
  const saved = [];
  const timers = new Set();
  const storage = options.storage || { load: async () => null, save: async snapshot => saved.push(snapshot) };
  const service = createPresenterHitsService({ storage, now: () => time,
    schedule: callback => { timers.add(callback); return callback; }, cancel: callback => timers.delete(callback),
  });
  await service.ready;
  const hit = (sequence, extra = {}) => service.recordHit({ playerKey: "user:7", scope: "room:round-1", presenterId: "pivot", streamId: STREAM, sequence, ...extra });
  return { service, hit, saved, timers, advance: ms => { time += ms; }, setTime: value => { time = value; }, count: id => service.getWeeklyBoard().find(row => row.presenterId === id)?.hits };
}

test("six shared counters persist in one dirty batch and survive departures/reload", async () => {
  const f = await fixture();
  for (let index = 1; index <= 10; index++) assert.equal(f.hit(index), true);
  assert.equal(f.hit(1, { playerKey: "user:8", presenterId: "lepers" }), true);
  assert.equal(f.saved.length, 0);
  assert.equal(f.timers.size, 1);
  assert.equal(f.count("pivot"), 10);
  assert.equal(f.service.getWeeklyBoard()[0].presenterId, "pivot");
  await f.service.flush();
  assert.equal(f.saved.length, 1);
  await f.service.flush();
  assert.equal(f.saved.length, 1, "no write when clean");
  const second = await fixture({ storage: { load: async () => f.saved[0], save: async () => {} } });
  assert.equal(second.count("pivot"), 10);
  assert.equal(second.count("lepers"), 1);
  assert.equal(second.service.getTrackingStartTs(), start);
  await f.service.dispose();
  await second.service.dispose();
});

test("replayed sequences across reconnects, changed presenters and rounds cannot increase totals", async () => {
  const f = await fixture();
  assert.equal(f.hit(1), true);
  assert.equal(f.hit(1, { presenterId: "capello" }), false);
  assert.equal(f.hit(1, { scope: "room:round-2" }), false);
  assert.equal(f.hit(2, { scope: "room:round-2" }), true);
  assert.equal(f.count("pivot"), 2);
  await f.service.dispose();
});

test("burst protection is shared across tabs and rate-limited sequences cannot be replayed", async () => {
  const f = await fixture();
  for (let index = 1; index <= 12; index++) assert.equal(f.hit(index), true);
  assert.equal(f.hit(13), false);
  assert.equal(f.hit(1, { streamId: "another-browser-session" }), false);
  f.advance(1000);
  assert.equal(f.hit(13), false);
  assert.equal(f.hit(14), true);
  assert.equal(f.count("pivot"), 13);
  assert.equal(f.hit(15, { presenterId: "unknown" }), false);
  assert.equal(f.hit(15, { sequence: Infinity }), false);
  await f.service.dispose();
});

test("one browser can count hits through more than 32 rounds without consuming extra replay streams", async () => {
  const f = await fixture();
  for (let round = 1; round <= 40; round++) {
    f.advance(1000);
    assert.equal(f.hit(round, { scope: `room:round-${round}` }), true);
  }
  assert.equal(f.count("pivot"), 40);
  assert.equal(f.hit(2, { scope: "room:round-40" }), false);
  await f.service.dispose();
});

test("weeks follow Paris Monday midnight across summer/winter changes and retain historical counts", async () => {
  assert.equal(getPresenterHitsWeekStartTs(Date.parse("2026-03-29T23:59:59+02:00")), Date.parse("2026-03-23T00:00:00+01:00"));
  assert.equal(getPresenterHitsWeekStartTs(Date.parse("2026-03-30T00:00:00+02:00")), Date.parse("2026-03-30T00:00:00+02:00"));
  assert.equal(getPresenterHitsWeekStartTs(Date.parse("2026-10-25T23:59:59+01:00")), Date.parse("2026-10-19T00:00:00+02:00"));
  assert.equal(getPresenterHitsWeekStartTs(Date.parse("2026-10-26T00:00:00+01:00")), Date.parse("2026-10-26T00:00:00+01:00"));
  const f = await fixture();
  const previous = getPresenterHitsWeekStartTs(start);
  assert.equal(f.hit(1), true);
  f.setTime(Date.parse("2026-10-12T00:00:00+02:00"));
  assert.equal(f.hit(2, { presenterId: "lepers" }), true);
  assert.equal(f.count("pivot"), 0);
  assert.equal(f.count("lepers"), 1);
  assert.equal(f.service.getWeeklyBoard(previous).find(row => row.presenterId === "pivot").hits, 1);
  assert.deepEqual(f.service.getWeeklyBoard(previous - 7 * 86400000), []);
  await f.service.dispose();
});

test("hits arriving during a save remain dirty and storage failures retry without losing counts", async () => {
  let release;
  const saved = [];
  let fail = true;
  const f = await fixture({ storage: { load: async () => null, save: async snapshot => {
    if (fail) { fail = false; throw new Error("disk_busy"); }
    saved.push(snapshot);
    if (saved.length === 1) await new Promise(resolve => { release = resolve; });
  } } });
  f.hit(1);
  await assert.rejects(f.service.flush(), /disk_busy/);
  const saving = f.service.flush();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.hit(2);
  release();
  await saving;
  await f.service.flush();
  assert.equal(saved.at(-1).weeks[getPresenterHitsWeekStartTs(start)].pivot, 2);
  await f.service.dispose();
});

test("atomic file store round trips the compact history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gobble-presenter-hits-"));
  try {
    const storage = createPresenterHitsFileStore(directory);
    assert.equal(await storage.load(), null);
    const snapshot = { version: 1, trackingStartTs: start, weeks: { 123: { pivot: 4 } } };
    await storage.save(snapshot);
    assert.deepEqual(await storage.load(), snapshot);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
