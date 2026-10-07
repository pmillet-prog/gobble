import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import {
  WEEKLY_TOP3_ROUND_TYPES,
  buildWeeklyTop3Boards,
  createWeeklyTop3Maps,
  getRoundTop3Outcomes,
} from "./weeklyTop3.js";

const player = (nick, score, extra = {}) => ({ nick, playerKey: `install:${nick}`, score, ...extra });

test("zero scores and invalid identities never enter either counter, including a one-player round", () => {
  assert.deepEqual(getRoundTop3Outcomes("normal", [player("late", 0)]), []);
  assert.deepEqual(getRoundTop3Outcomes("normal", [
    player("zero", 0), player("negative", -1), player("invalid", NaN),
    player("anonymous", 2, { playerKey: null }),
  ]), []);
});

test("presenters keep their ranking places but only positive human scores are recorded", () => {
  assert.deepEqual(getRoundTop3Outcomes("normal", [
    player("hostA", 90, { isBot: true }), player("hostB", 80, { isBot: true }),
    player("winner", 70), player("fourth", 60), player("late", 0),
  ]), [
    { playerKey: "install:winner", nick: "winner", isTop3: true },
    { playerKey: "install:fourth", nick: "fourth", isTop3: false },
  ]);
});

test("standard shared third places count, with competition ranking after earlier ties", () => {
  const atThird = getRoundTop3Outcomes("normal", [
    player("first", 100), player("second", 80), player("thirdA", 60), player("thirdB", 60),
  ]);
  assert.ok(atThird.every((entry) => entry.isTop3));
  const afterTie = getRoundTop3Outcomes("normal", [
    player("firstA", 100), player("firstB", 100), player("firstC", 100), player("fourth", 80),
  ]);
  assert.equal(afterTie.at(-1).isTop3, false);
});

test("OCID preserves discovery-time tie breaks, but equal no-target scores share their rank", () => {
  const outcomes = getRoundTop3Outcomes("ocid", [
    player("first", 100, { targetFoundAt: 1 }), player("second", 100, { targetFoundAt: 2 }),
    player("third", 100, { targetFoundAt: 3 }), player("fourth", 100, { targetFoundAt: 4 }),
  ]);
  assert.deepEqual(outcomes.map((entry) => entry.isTop3), [true, true, true, false]);
  const shared = getRoundTop3Outcomes("ocid", [
    player("first", 100), player("second", 80),
    player("thirdA", 60, { targetFoundAt: null }), player("thirdB", 60, { targetFoundAt: null }),
  ]);
  assert.ok(shared.every((entry) => entry.isTop3));
});

test("both target round types use final arrival order even when tournament points tie", () => {
  for (const type of ["target_long", "target_score"]) {
    const outcomes = getRoundTop3Outcomes(type, [
      player("first", 10), player("second", 10), player("third", 10),
      player("fourth", 10), player("late", 0),
    ]);
    assert.deepEqual(outcomes.map((entry) => entry.isTop3), [true, true, true, false]);
  }
});

test("one account contributes at most once to a round and keeps its best placing", () => {
  const outcomes = getRoundTop3Outcomes("normal", [
    player("same", 100), player("second", 90), player("third", 80), player("same", 70),
  ]);
  assert.equal(outcomes.length, 3);
  assert.equal(outcomes[0].isTop3, true);
});

test("boards sort exact ratios, then sample sizes, retain zero percent and cap each type", () => {
  const source = {
    normal: {
      "install:a": { nick: "a", top3Count: 1, roundsPlayed: 3, achievedAt: 1 },
      "install:b": { nick: "b", top3Count: 2, roundsPlayed: 6, achievedAt: 5 },
      "install:c": { nick: "c", top3Count: 333, roundsPlayed: 1000, achievedAt: 1 },
      "install:d": { nick: "d", top3Count: 0, roundsPlayed: 2, achievedAt: 1 },
      "install:e": { nick: "e", top3Count: 0, roundsPlayed: 1, achievedAt: 1 },
    },
  };
  const maps = createWeeklyTop3Maps(source);
  const boards = buildWeeklyTop3Boards(maps, 50);
  assert.deepEqual(Object.keys(boards), WEEKLY_TOP3_ROUND_TYPES);
  assert.deepEqual(boards.normal.map((entry) => entry.nick), ["b", "a", "c", "d", "e"]);
  assert.ok(Math.abs(boards.normal[0].percentage - 100 / 3) < 1e-12);
  assert.equal(boards.normal.at(-1).percentage, 0);
  assert.equal(buildWeeklyTop3Boards(maps, 2).normal.length, 2);
  assert.equal(maps.normal.get("install:b").percentage, undefined);
});

test("legacy data yields empty boards and malformed persisted counters are rejected", () => {
  assert.ok(Object.values(createWeeklyTop3Maps()).every((board) => board.size === 0));
  const maps = createWeeklyTop3Maps({
    normal: {
      zero: { nick: "zero", roundsPlayed: 0, top3Count: 0 },
      impossible: { nick: "impossible", roundsPlayed: 1, top3Count: 2 },
      fraction: { nick: "fraction", roundsPlayed: 1.5, top3Count: 1 },
      valid: { nick: "valid", roundsPlayed: 2, top3Count: 0 },
    },
    unknown: { valid: { nick: "valid", roundsPlayed: 2, top3Count: 0 } },
  });
  assert.deepEqual(Array.from(maps.normal.keys()), ["valid"]);
  assert.equal(maps.unknown, undefined);
});

test("weekly service preserves old data, persists and reloads per-type ratios, then resets on Monday", async (t) => {
  const temporaryRoot = path.resolve(".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, "weekly-top3-test-"));
  const filename = path.join(directory, "weekly-stats.json");
  const previousDataDir = process.env.GOBBLE_DATA_DIR;
  process.env.GOBBLE_DATA_DIR = directory;
  // A real empty primary file prevents the service from reading a legacy data directory.
  await writeFile(filename, JSON.stringify({
    totalScore: { "install:legacy": { nick: "legacy", playerKey: "install:legacy", totalScore: 50, roundsPlayed: 2 } },
  }));
  const serviceUrl = new URL(`./weeklyStatsService.js?test=${path.basename(directory)}`, import.meta.url);
  let service;
  const readSaved = async (predicate) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const saved = JSON.parse(await readFile(filename, "utf8"));
      if (predicate(saved)) return saved;
      await wait(25);
    }
    assert.fail("weekly statistics were not saved");
  };
  try {
    service = await import(serviceUrl.href);
    const initial = service.getWeeklyStats();
    assert.equal(initial.top3TrackingStartTs, null);
    assert.deepEqual(initial.boards.top3.normal, []);
    assert.equal(initial.boards.totalScore[0].roundsPlayed, 2);
    const at = Date.now();
    service.recordRoundTop3({ results: [player("late", 0)], achievedAt: at });
    assert.equal(service.getWeeklyStats().top3TrackingStartTs, at);
    for (const type of WEEKLY_TOP3_ROUND_TYPES) {
      service.recordRoundTop3({ roundType: type, results: [player("alice", 10), player("late", 0)], achievedAt: at });
    }
    service.recordRoundTop3({ results: [
      player("h1", 90, { isBot: true }), player("h2", 80, { isBot: true }),
      player("h3", 70, { isBot: true }), player("alice", 60),
    ], achievedAt: at + 1 });
    service.recordRoundTop3({ roundType: "unknown", results: [player("alice", 10)] });
    service.recordTotalScore("install:legacy", "legacy", 0);
    service.recordTotalScore("install:legacy", "legacy", -10);
    service.recordTotalScore("install:alice", "alice", 10);
    const current = service.getWeeklyStats();
    assert.equal(current.boards.top3.normal[0].roundsPlayed, 2);
    assert.equal(current.boards.top3.normal[0].top3Count, 1);
    assert.equal(current.boards.top3.normal[0].percentage, 50);
    assert.equal(current.boards.top3.speed[0].percentage, 100);
    assert.equal(current.boards.totalScore.find((entry) => entry.nick === "legacy").roundsPlayed, 2);
    await readSaved((saved) => saved.top3?.normal?.["install:alice"]?.roundsPlayed === 2);

    const reloaded = await import(`${serviceUrl.href}-reload`);
    assert.deepEqual(reloaded.getWeeklyStats().boards.top3, current.boards.top3);
    assert.equal(reloaded.getWeeklyStats().top3TrackingStartTs, at);

    t.mock.method(Date, "now", () => initial.nextResetTs + 1);
    const nextWeek = service.getWeeklyStats();
    assert.equal(nextWeek.weekStartTs, initial.nextResetTs);
    assert.equal(nextWeek.top3TrackingStartTs, null);
    assert.ok(Object.values(nextWeek.boards.top3).every((entries) => entries.length === 0));
    service.recordRoundTop3({ results: [player("bob", 10)] });
    const saved = await readSaved((data) => data.weekStartTs === initial.nextResetTs);
    assert.equal(saved.history[initial.weekStartTs].top3.normal["install:alice"].roundsPlayed, 2);
    assert.equal(saved.top3.normal["install:bob"].roundsPlayed, 1);
  } finally {
    t.mock.restoreAll();
    if (previousDataDir === undefined) delete process.env.GOBBLE_DATA_DIR;
    else process.env.GOBBLE_DATA_DIR = previousDataDir;
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    assert.ok(path.basename(directory).startsWith("weekly-top3-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
