import test from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { TROPHY_REWARDS } from "../../shared/trophyCatalog.js";
import { createAchievementCollectionRepository } from "./achievementCollectionRepository.js";
import { achievementWordEvents, createAchievementRuntime } from "./achievementRuntime.js";
import { createAvatarObjectivesRepository } from "../avatars/avatarObjectivesRepository.js";
import { getWeekStartTs, getNextResetTs } from "./parisWeek.js";

const FIRST_FULL_WEEK = Date.parse("2026-10-11T22:00:00Z"); // Monday 12 October, 00:00 Paris.

async function fixture(t, catalog, activationAt = 1000) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username_display TEXT);
    INSERT INTO users VALUES(1,'Tigre'),(2,'Test');
    CREATE TABLE player_lifetime_stats(installId TEXT PRIMARY KEY,gobbles INTEGER);
    CREATE TABLE avatar_objective_progress(user_id INTEGER,objective TEXT,value INTEGER,PRIMARY KEY(user_id,objective));
    CREATE TABLE target_quiz_points(user_id INTEGER PRIMARY KEY,total INTEGER);`);
  let at = activationAt;
  const repository = createAchievementCollectionRepository({ getDb: async () => db, catalog, now: () => at });
  await repository.bootstrap();
  at++;
  return { db, repository };
}

test("occurrences stack, survive retries and remain bound to the authenticated account", async t => {
  const { repository } = await fixture(t, TROPHY_REWARDS.map(item => ({ ...item, points: null })));
  const event = { userId: 1, events: [{ id: "word_16", eventKey: "room#r1:word:ABCDEFGHIJKLMNOP" }], roundId: "room#r1", earnedAt: 1001 };
  const [first] = await repository.record(event);
  assert.equal(first.count, 1);
  assert.equal(first.roundId, "r1");
  assert.deepEqual(await repository.record(event), []);
  assert.equal((await repository.record({ ...event, events: [{ id: "word_16", eventKey: "room#r2:word:ABCDEFGHIJKLMNOP" }], roundId: "room#r2" }))[0].count, 2);
  assert.equal((await repository.snapshot(1)).totalCount, 2);
  assert.equal((await repository.snapshot(1)).points, null);
  assert.deepEqual(await repository.record({ ...event, userId: 999 }), []);
  await repository.acknowledge(2, [first.eventId]);
  assert.equal((await repository.pending(1)).length, 2);
  await repository.acknowledge(1, [first.eventId]);
  assert.equal((await repository.pending(1)).length, 1);
  assert.deepEqual(await repository.roundAwards("room#r1"), [first]);
});

test("existing lifetime totals and prototype trophies are ignored; activation survives restarts", async t => {
  const { db, repository } = await fixture(t);
  await db.exec("INSERT INTO player_lifetime_stats VALUES('1',10000); INSERT INTO avatar_objective_progress VALUES(1,'lepers_correct_answers',2999); INSERT INTO target_quiz_points VALUES(1,1000000)");
  await db.exec("CREATE TABLE achievement_collection(user_id INTEGER,trophy_id TEXT,count INTEGER); INSERT INTO achievement_collection VALUES(1,'word_16',12)");
  await repository.record({ userId: 1, totals: { gold: 15000, gobbles: 20000 }, silent: true });
  const snapshot = await repository.snapshot(1);
  assert.equal(snapshot.totalCount, 0);
  assert.equal(snapshot.points, 0, "the validated scale gives no points to pre-activation activity");
  assert.ok(Object.values(snapshot.counts).every(count => count === 0));
  assert.deepEqual(await repository.leaderboard(), []);
  assert.deepEqual(await repository.pending(1), []);
  await repository.record({ userId: 1, progress: { eventKey: "new:1", changes: { julien: 20 } } });
  const reopened = createAchievementCollectionRepository({ getDb: async () => db, now: () => 2000 });
  assert.equal(await reopened.bootstrap(), 1000);
  assert.equal((await reopened.snapshot(1)).counts.julien_1000, 1);
  assert.equal((await reopened.snapshot(1)).points, 140, "only the new bronze, silver and gold Julien rewards score");
  assert.deepEqual((await reopened.leaderboard()).map(row => [row.userId, row.points]), [[1, 140]]);
  assert.equal((await db.get("SELECT count FROM achievement_collection WHERE user_id=1")).count, 12);
  assert.equal((await db.get("SELECT total FROM target_quiz_points WHERE user_id=1")).total, 1000000);
});

test("all cumulative thresholds start at zero and deduplicate source events; signed recovery cannot duplicate trophies", async t => {
  const { repository } = await fixture(t);
  const request = { userId: 1, progress: { eventKey: "post-launch:1", changes: {
    gold: 50, singleGobbles: 200, julien: 20, foukro: 20000, rounds: 2000,
    score: 2000000, doubleGobbles: 50, targets: 200, medals: 100, words: 50000,
  } } };
  assert.equal((await repository.record(request)).length, 30);
  assert.deepEqual(await repository.record(request), []);
  assert.equal((await repository.snapshot(1)).totalCount, 30);
  await repository.record({ userId: 1, progress: { eventKey: "loss", changes: { foukro: -75 } } });
  assert.deepEqual(await repository.record({ userId: 1, progress: { eventKey: "recovery", changes: { foukro: 100 } } }), []);
  assert.equal((await repository.snapshot(1)).counts.foukro_500000, 1);
  const more = await repository.record({ userId: 1, progress: { eventKey: "two-more", changes: { foukro: 40000 } } });
  assert.deepEqual(more.map(award => [award.id, award.delta, award.count]), [["foukro_500000", 2, 3]]);
});

test("a cumulative jump awards each introductory tier once and every full gold tranche", async t => {
  const { repository } = await fixture(t);
  const request = { userId: 1, progress: { eventKey: "jump", changes: { rounds: 6000 } } };
  assert.deepEqual((await repository.record(request)).map(award => [award.id, award.delta, award.count]), [
    ["marathon_10000:bronze", 1, 1], ["marathon_10000:silver", 1, 1], ["marathon_10000", 3, 3],
  ]);
  assert.deepEqual(await repository.record(request), []);
  assert.deepEqual((await repository.record({ userId: 1,
    progress: { eventKey: "fourth", changes: { rounds: 2000 } } })).map(award => [award.id, award.delta, award.count]), [["marathon_10000", 1, 4]]);
  const forgedEvents = ["marathon_10000:bronze", "marathon_10000:silver", "marathon_10000", "toString", "__proto__"]
    .map(id => ({ id, eventKey: "untrusted-event" }));
  assert.deepEqual(await repository.record({ userId: 2, events: forgedEvents }), []);
  assert.equal((await repository.snapshot(2)).totalCount, 0, "cumulative rewards require accepted progress");
});

test("one hundred words unlocks once, while round-score gold repeats at most once per eligible round", async t => {
  const { repository } = await fixture(t);
  const idsAt = score => achievementWordEvents({ key: "boundary", score }).map(event => event.id);
  assert.deepEqual(idsAt(1999), []);
  assert.deepEqual(idsAt(2000), ["round_5000:bronze"]);
  assert.deepEqual(idsAt(3999), ["round_5000:bronze"]);
  assert.deepEqual(idsAt(4000), ["round_5000:bronze", "round_5000:silver"]);
  assert.deepEqual(idsAt(4999), ["round_5000:bronze", "round_5000:silver"]);
  assert.deepEqual(idsAt(5000), ["round_5000:bronze", "round_5000:silver", "round_5000"]);
  const request = { userId: 1, events: achievementWordEvents({ key: "one", wordsCount: 100, score: 10000 }) };
  assert.deepEqual((await repository.record(request)).map(award => [award.id, award.count]), [
    ["volume_100", 1], ["round_5000:bronze", 1], ["round_5000:silver", 1], ["round_5000", 1],
  ]);
  assert.deepEqual(await repository.record(request), []);
  const second = await repository.record({ userId: 1, events: achievementWordEvents({ key: "two", wordsCount: 150, score: 10000 }) });
  assert.deepEqual(second.map(award => [award.id, award.delta, award.count]), [["round_5000", 1, 2]]);
  assert.deepEqual(await repository.record({ userId: 1,
    events: achievementWordEvents({ key: "finale", wordsCount: 100, score: 20000, eligible: false }) }), []);
  assert.equal((await repository.snapshot(1)).counts.volume_100, 1);
});

test("weekly awards are unique by completed week and rollback includes both count and notification", async t => {
  const { db, repository } = await fixture(t);
  const request = { userId: 1, events: [{ id: "weekly_gold", eventKey: "week:1" }] };
  await repository.record(request);
  await repository.record(request);
  await repository.record({ ...request, events: [{ id: "weekly_gold", eventKey: "week:2" }] });
  assert.equal((await repository.snapshot(1)).counts.weekly_gold, 2);
  await db.exec("CREATE TRIGGER reject_achievement BEFORE INSERT ON achievement_events_v2 BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  await assert.rejects(repository.record({ ...request, events: [{ id: "weekly_gold", eventKey: "week:3" }] }), /test rollback/);
  assert.equal((await repository.snapshot(1)).counts.weekly_gold, 2);
  assert.equal((await repository.pending(1)).length, 2);
});

test("the leaderboard waits for a complete points scale then sums all acquired copies", async t => {
  const { repository } = await fixture(t, TROPHY_REWARDS.map(item => ({ ...item, points: null })));
  assert.equal(await repository.leaderboard(), null);
  const configured = await fixture(t, TROPHY_REWARDS.map(item => ({ ...item, points: item.id === "word_16" ? 10 : 3 })));
  await configured.repository.record({ userId: 1, events: [{ id: "word_16", eventKey: "1" }, { id: "word_16", eventKey: "2" }] });
  await configured.repository.record({ userId: 2, events: [{ id: "weekly_gold", eventKey: "week1" }] });
  assert.deepEqual((await configured.repository.leaderboard()).map(row => [row.userId, row.points]), [[1, 20], [2, 3]]);
  await configured.repository.record({ userId: 2, progress: { eventKey: "first-tranches", changes: { rounds: 4000 } } });
  assert.equal((await configured.repository.snapshot(2)).points, 15, "bronze and silver score once, both gold tranches score");
  assert.deepEqual((await configured.repository.leaderboard()).map(row => [row.userId, row.points]), [[1, 20], [2, 15]]);
});

test("the validated scale scores all 41 rewards, unique tiers once and each repeated gold", async t => {
  const { repository } = await fixture(t);
  const request = { userId: 1, progress: { eventKey: "every-cumulative", changes: {
    rounds: 2000, words: 50000, score: 2000000, singleGobbles: 200, doubleGobbles: 50,
    targets: 200, gold: 50, medals: 100, julien: 20, foukro: 20000,
  } }, events: [
    ...["weekly_gold", "weekly_silver", "weekly_bronze", "target_under_2s"].map(id => ({ id, eventKey: "first" })),
    ...achievementWordEvents({ key: "first", words: ["ABCDEFGHIJKLMNOP", "ABCDEFGHIJKLMNOPQ"], wordsCount: 100,
      score: 5000, threeWords: true }),
  ] };
  assert.equal((await repository.record(request)).length, 41);
  const first = await repository.snapshot(1);
  assert.equal(first.totalCount, 41);
  assert.equal(first.points, 3365, "1 855 cumulative points plus 1 510 exploit and podium points");
  assert.deepEqual(await repository.record(request), []);
  assert.equal((await repository.snapshot(1)).points, 3365, "source retries never score twice");
  await repository.record({ userId: 1, progress: { eventKey: "two-more-golds", changes: { rounds: 4000 } },
    events: achievementWordEvents({ key: "another-round", words: ["ABCDEFGHIJKLMNOP"], wordsCount: 100, score: 10000 }) });
  const next = await repository.snapshot(1);
  assert.equal(next.totalCount, 45);
  assert.equal(next.points, 4505, "800 for two marathon golds, 40 for one round gold, 300 for the sixteen-letter word");
  assert.equal(next.counts.volume_100, 1);
  assert.equal(next.counts["round_5000:bronze"], 1);
  assert.equal(next.counts["round_5000:silver"], 1);
  assert.equal(next.counts.round_5000, 2);
  await repository.record({ userId: 2,
    events: ["one", "two", "three"].map(eventKey => ({ id: "word_17", eventKey })) });
  assert.deepEqual((await repository.leaderboard()).map(row => [row.userId, row.points, row.totalCount]), [
    [1, 4505, 45], [2, 3000, 3],
  ], "the SQL leaderboard uses the same 41-reward scale as the profile snapshot");
});

test("round rules preserve exact lengths, strict target timing and the finale exclusion", () => {
  const events = achievementWordEvents({ key: "r", words: ["ABCDEFGHIJKLMNOP", "ABCDEFGHIJKLMNOPQ"], wordsCount: 100, score: 5000, eligible: false });
  assert.deepEqual(events.map(event => event.id), ["word_16", "word_17", "volume_100"]);
  assert.deepEqual(achievementWordEvents({ key: "r", score: 1000, threeWords: true }).map(event => event.id), ["three_words_1000"]);
  const calls = [];
  const runtime = createAchievementRuntime({ persistence: { achievementCollection: async payload => { calls.push(payload); return []; } },
    getIo: () => ({ sockets: { sockets: new Map() } }), getWeeklySnapshot: () => ({ allTime: {} }) });
  const room = { id: "room", currentRound: { id: "r" } };
  runtime.target({ room, userId: 1, elapsed: 2000 });
  runtime.target({ room, userId: 1, elapsed: -1 });
  runtime.target({ room, userId: 1, elapsed: 1999 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].events[0].id, "target_under_2s");
});

test("preactivation events are ignored and a failed cumulative award rolls its counter and source receipt back", async t => {
  const { db, repository } = await fixture(t);
  await repository.record({ userId: 1, earnedAt: 999, events: [{ id: "word_16", eventKey: "old" }] });
  await repository.record({ userId: 1, earnedAt: 1001, sourceStartedAt: 999, events: [{ id: "word_16", eventKey: "old-round" }] });
  await repository.record({ userId: 1, progress: { eventKey: "old-session", startedAt: 999, changes: { foukro: 500000 } } });
  assert.equal((await repository.snapshot(1)).totalCount, 0);
  const request = { userId: 1, progress: { eventKey: "new-session", changes: { words: 50000 } } };
  await db.exec("CREATE TRIGGER reject_achievement BEFORE INSERT ON achievement_events_v2 WHEN NEW.trophy_id='words_100000:silver' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  await assert.rejects(repository.record(request), /test rollback/);
  assert.equal((await db.get("SELECT count(*) AS n FROM achievement_progress_v2")).n, 0);
  assert.equal((await db.get("SELECT count(*) AS n FROM achievement_progress_events_v2")).n, 0);
  assert.equal((await repository.snapshot(1)).totalCount, 0, "the preceding bronze award rolls back with silver");
  assert.deepEqual(await repository.pending(1), []);
  await db.exec("DROP TRIGGER reject_achievement");
  assert.equal((await repository.record(request)).length, 3);
});

test("round finalization uses durable receipts, retries live awards and emits only to their owner", async t => {
  const { repository } = await fixture(t);
  const emitted = [], spectators = [];
  let queue = Promise.resolve();
  const persistence = { achievementCollection: payload => {
    const result = queue.then(() => payload.action === "record" ? repository.record(payload)
      : payload.action === "round" ? repository.roundAwards(payload.roundId) : repository.snapshot(payload.userId));
    queue = result.catch(() => {});
    return result;
  } };
  const sockets = new Map([[1, { data: { authUser: { id: 1 } }, emit: (...args) => emitted.push(args) }],
    [2, { data: { authUser: { id: 2 } }, emit: (...args) => spectators.push(args) }]]);
  const runtime = createAchievementRuntime({ persistence, getIo: () => ({ sockets: { sockets } }),
    getWeeklyPodiums: () => [] });
  const room = { id: "live", currentRound: { id: "round", startsAt: 1000, special: { type: "self_specials_3_words" } } };
  const words = ["ABCDEFGHIJKLMNOP", "ABCDEFGHIJKLMNOPQ"];
  runtime.word({ room, userId: 1, words: [words[0]], wordsCount: 1, score: 300 });
  const results = [{ userId: 1, nick: "Tigre", participated: true, score: 1000, words },
    { userId: 2, nick: "Test", participated: false, score: 0, words: [] },
    { userId: 999, nick: "Bot", participated: true, isBot: true, score: 5000, words }];
  await runtime.settleRound(room, results);
  assert.deepEqual(results[0].achievementAwards.map(award => award.id).sort(), ["three_words_1000", "word_16", "word_17"]);
  assert.equal(emitted.length, 3);
  assert.equal(spectators.length, 0);
  assert.equal((await repository.snapshot(1)).counts.word_16, 1);
  assert.deepEqual(results[1].achievementAwards, []);
  assert.deepEqual(results[2].achievementAwards, []);
});

test("profile reads never consume a newly crossed milestone or import later lifetime changes", async t => {
  const { db, repository } = await fixture(t);
  await db.exec("INSERT INTO avatar_objective_progress VALUES(1,'lepers_correct_answers',1999)");
  await repository.bootstrap([{ userId: 1, gold: 5000, gobbles: 10000 }]);
  assert.equal((await repository.snapshot(1)).counts.julien_1000, 0);
  assert.deepEqual(await repository.pending(1), []);
  await db.run("UPDATE avatar_objective_progress SET value=2000");
  // A profile request or restart between source persistence and notification
  // only reads; it cannot claim the new tranche silently.
  await repository.bootstrap([]);
  assert.equal((await repository.snapshot(1)).counts.julien_1000, 0);
  await repository.record({ userId: 1, events: [{ id: "weekly_gold", eventKey: "week:old" }], earnedAt: 1, includeCumulative: false, silent: true });
  assert.equal((await repository.snapshot(1)).counts.julien_1000, 0);
  const awards = await repository.record({ userId: 1, roundId: "live#new", progress: { eventKey: "new", changes: { julien: 20 } } });
  assert.deepEqual(awards.map(award => [award.id, award.roundId, award.delta]), [
    ["julien_1000:bronze", "new", 1], ["julien_1000:silver", "new", 1], ["julien_1000", "new", 1],
  ]);
  assert.equal((await repository.pending(1)).length, 3);
});

test("a delayed tournament medal updates the existing result snapshot without replaying round end", async t => {
  const { repository } = await fixture(t);
  await repository.record({ userId: 1, progress: { eventKey: "earlier", changes: { gold: 49, medals: 99 } } });
  const emitted = [];
  const result = { userId: 1, achievementAwards: [] };
  const room = { id: "live", currentRound: { id: "r" }, lastRoundResults: { payload: { roundId: "r", results: [result] } } };
  const runtime = createAchievementRuntime({
    persistence: { achievementCollection: payload => repository.record(payload) },
    getIo: () => ({ sockets: { sockets: new Map([[1, { data: { authUser: { id: 1 } }, emit: (...args) => emitted.push(args) }]]) } }),
  });
  await runtime.medal({ room, userId: 1, type: "gold", tournamentKey: "live:1" });
  assert.equal(result.achievementAwards[0].id, "mini_gold_5000");
  assert.deepEqual(emitted.map(([name]) => name), ["achievement:earned", "achievement:earned"]);
  await runtime.medal({ room, userId: 1, type: "gold", tournamentKey: "live:1" });
  assert.equal(result.achievementAwards.length, 2);
});

test("OCID includes validated proposals and excludes invalid words without double-counting volume", async t => {
  const { repository } = await fixture(t);
  let queue = Promise.resolve();
  const persistence = { achievementCollection: payload => {
    const result = queue.then(() => payload.action === "record" ? repository.record(payload) : repository.roundAwards(payload.roundId));
    queue = result.catch(() => {});
    return result;
  } };
  const runtime = createAchievementRuntime({ persistence, getIo: () => ({ sockets: { sockets: new Map() } }),
    getWeeklySnapshot: () => ({ allTime: {} }) });
  const accepted = "ABCDEFGHIJKLMNOP", rejected = "ABCDEFGHIJKLMNOPQ";
  const room = { id: "live", currentRound: { id: "ocid1", special: { type: "ocid" } } };
  const results = [
    { userId: 1, participated: true, words: [], score: 100, ocid: { validProposal: true, proposal: accepted } },
    { userId: 2, participated: true, words: [], score: 0, ocid: { validProposal: false, proposal: rejected } },
  ];
  await runtime.settleRound(room, results);
  assert.deepEqual(results[0].achievementAwards.map(award => award.id), ["word_16"]);
  assert.deepEqual(results[1].achievementAwards, []);
  room.currentRound = { id: "ocid2", special: { type: "ocid" } };
  const existingWords = [accepted, ...Array.from({ length: 98 }, (_, index) => `WORD${index}`)];
  await runtime.settleRound(room, [{ userId: 1, participated: true, words: existingWords, score: 100,
    ocid: { validProposal: true, proposal: accepted.toLowerCase() } }]);
  const snapshot = await repository.snapshot(1);
  assert.equal(snapshot.counts.word_16, 2);
  assert.equal(snapshot.counts.volume_100, 0);
  assert.equal(existingWords.length, 99, "the authoritative result words remain unchanged");
});

test("the launch week's podium is excluded after restart; the next full weeks remain eligible and idempotent", async t => {
  const cutoff = Date.parse("2026-10-11T20:00:00Z");
  const { db, repository } = await fixture(t, undefined, cutoff);
  const partialWeek = getWeekStartTs(cutoff);
  const previousWeek = getWeekStartTs(partialWeek - 1);
  const oldPodium = { installId: "1", rank: 1, weekStartTs: previousWeek, awardedAt: partialWeek };
  const partialPodium = { installId: "1", rank: 2, weekStartTs: partialWeek, awardedAt: FIRST_FULL_WEEK };
  const eligiblePodium = { installId: "1", rank: 3, weekStartTs: FIRST_FULL_WEEK, awardedAt: getNextResetTs(FIRST_FULL_WEEK) };
  const emitted = [];
  const makeRuntime = (podiums, repo = repository) => createAchievementRuntime({
    persistence: { achievementCollection: payload => repo.record(payload) },
    getIo: () => ({ sockets: { sockets: new Map([[1, { data: { authUser: { id: 1 } }, emit: (...args) => emitted.push(args) }]]) } }),
    getWeeklyPodiums: () => podiums,
  });
  await makeRuntime([oldPodium, partialPodium]).reconcileWeekly({ weekStartTs: FIRST_FULL_WEEK });
  assert.equal((await repository.snapshot(1)).counts.weekly_gold, 0);
  assert.deepEqual(await repository.pending(1), []);
  assert.deepEqual(emitted, []);
  const reopened = createAchievementCollectionRepository({ getDb: async () => db, now: () => eligiblePodium.awardedAt });
  assert.equal(await reopened.bootstrap(), cutoff, "a restart preserves the original eligibility boundary");
  const podiums = [oldPodium, partialPodium, eligiblePodium];
  await makeRuntime(podiums, reopened).reconcileWeekly({ weekStartTs: eligiblePodium.awardedAt });
  const pending = await repository.pending(1);
  assert.deepEqual(pending.map(award => award.id), ["weekly_bronze"]);
  assert.equal((await repository.snapshot(1)).counts.weekly_silver, 0);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][0], "achievement:earned");
  await makeRuntime(podiums, reopened).reconcileWeekly({ weekStartTs: eligiblePodium.awardedAt });
  assert.deepEqual(await repository.pending(1), pending);
  assert.equal(emitted.length, 1);
  const laterWeek = eligiblePodium.awardedAt;
  await makeRuntime([...podiums, { installId: "1", rank: 3, weekStartTs: laterWeek, awardedAt: getNextResetTs(laterWeek) }], reopened)
    .reconcileWeekly({ weekStartTs: getNextResetTs(laterWeek) });
  assert.equal((await repository.snapshot(1)).counts.weekly_bronze, 2);
  assert.equal(emitted.length, 2);
});

test("weekly eligibility includes exact Paris Monday activation, but excludes activation one millisecond later", async t => {
  for (const offset of [0, 1]) {
    const { repository } = await fixture(t, undefined, FIRST_FULL_WEEK + offset);
    const secondWeek = getNextResetTs(FIRST_FULL_WEEK);
    const runtime = createAchievementRuntime({
      persistence: { achievementCollection: payload => repository.record(payload) },
      getIo: () => ({ sockets: { sockets: new Map() } }),
      getWeeklyPodiums: () => [
        { installId: "1", rank: 1, weekStartTs: FIRST_FULL_WEEK, awardedAt: secondWeek },
        { installId: "1", rank: 2, weekStartTs: secondWeek, awardedAt: getNextResetTs(secondWeek) },
      ],
    });
    await runtime.reconcileWeekly({ weekStartTs: getNextResetTs(secondWeek) });
    const snapshot = await repository.snapshot(1);
    assert.equal(snapshot.counts.weekly_gold, offset === 0 ? 1 : 0);
    assert.equal(snapshot.counts.weekly_silver, 1);
  }
});

test("weekly recap groups real event deltas by reward and account within the Paris week", async t => {
  const { db, repository } = await fixture(t);
  const start = getNextResetTs(FIRST_FULL_WEEK), end = getNextResetTs(start);
  assert.equal(end - start, 169 * 60 * 60 * 1000, "the autumn Paris week includes the extra hour");
  const word = (userId, eventKey, earnedAt) => repository.record({ userId, earnedAt,
    events: [{ id: "word_16", eventKey }] });
  await word(1, "before", start - 1);
  await word(1, "start", start);
  await word(1, "last-millisecond", end - 1);
  await word(1, "next-week", end);
  await word(2, "same-reward", start + 1);
  await repository.record({ userId: 1, earnedAt: start - 1,
    progress: { eventKey: "old-marathon", changes: { rounds: 6000 } } });
  await repository.record({ userId: 1, earnedAt: start + 2,
    progress: { eventKey: "two-weekly-tranches", changes: { rounds: 4000, words: 50000 } } });
  await repository.record({ userId: 1, earnedAt: end,
    progress: { eventKey: "next-marathon", changes: { rounds: 2000 } } });
  await repository.acknowledge(1, (await repository.pending(1)).map(award => award.eventId));
  // A displayed collection total is not a weekly receipt (and dev trials never create receipts).
  await db.run("INSERT INTO achievement_collection_v2(user_id,trophy_id,count) VALUES(1,'word_17',999)");
  assert.deepEqual(await repository.weeklyRecap(start), [
    { id: "word_16", recipients: [{ userId: 2, nick: "Test", count: 1 }, { userId: 1, nick: "Tigre", count: 2 }] },
    { id: "marathon_10000", recipients: [{ userId: 1, nick: "Tigre", count: 2 }] },
    { id: "words_100000:bronze", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
    { id: "words_100000:silver", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
    { id: "words_100000", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
  ]);
});

test("weekly podium trophies belong to their competition week even when published at the next reset or later", async t => {
  const { repository } = await fixture(t);
  const start = FIRST_FULL_WEEK, previous = getWeekStartTs(start - 1), end = getNextResetTs(start);
  const podium = (userId, id, weekStartTs, earnedAt) => repository.record({ userId, earnedAt, sourceStartedAt: weekStartTs,
    events: [{ id, eventKey: `week:${weekStartTs}` }] });
  await podium(1, "weekly_gold", previous, start);
  await podium(1, "weekly_gold", start, end);
  await podium(2, "weekly_silver", start, end + 60_000);
  await podium(1, "weekly_gold", end, getNextResetTs(end));
  assert.deepEqual(await repository.weeklyRecap(start), [
    { id: "weekly_gold", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
    { id: "weekly_silver", recipients: [{ userId: 2, nick: "Test", count: 1 }] },
  ]);
  assert.deepEqual(await repository.weeklyRecap(end), [
    { id: "weekly_gold", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
  ], "the previous podium cannot appear twice by its publication date");
});

test("a partial activation week can recap new exploits, but never its own podium or prior history", async t => {
  const start = FIRST_FULL_WEEK, end = getNextResetTs(start), activation = start + 86400000;
  const { repository } = await fixture(t, undefined, activation);
  await repository.record({ userId: 1, earnedAt: activation + 1, events: [{ id: "word_16", eventKey: "new-exploit" }] });
  // Simulate a receipt written by the earlier partial-week prototype.
  await repository.record({ userId: 1, earnedAt: end, events: [{ id: "weekly_gold", eventKey: `week:${start}` }] });
  assert.deepEqual(await repository.weeklyRecap(start), [
    { id: "word_16", recipients: [{ userId: 1, nick: "Tigre", count: 1 }] },
  ]);
  assert.deepEqual(await repository.weeklyRecap(getWeekStartTs(start - 1)), []);
});

test("the recap read waits for existing weekly podium reconciliation", async () => {
  const calls = [];
  let finishAward;
  const runtime = createAchievementRuntime({
    persistence: { achievementCollection: payload => {
      calls.push(payload);
      if (payload.action === "record") return new Promise(resolve => { finishAward = resolve; });
      return Promise.resolve([]);
    } },
    getIo: () => ({ sockets: { sockets: new Map() } }),
    getWeeklyPodiums: () => [{ installId: "1", rank: 1, weekStartTs: FIRST_FULL_WEEK, awardedAt: getNextResetTs(FIRST_FULL_WEEK) }],
  });
  runtime.reconcileWeekly({ weekStartTs: getNextResetTs(FIRST_FULL_WEEK) });
  const recap = runtime.weeklyRecap(FIRST_FULL_WEEK);
  await Promise.resolve();
  assert.deepEqual(calls.map(call => call.action), ["record"]);
  finishAward([]);
  assert.deepEqual(await recap, []);
  assert.deepEqual(calls.at(-1), { action: "weeklyRecap", weekStartTs: FIRST_FULL_WEEK });
});

test("a double gobble never advances singles, while validated target rounds advance every applicable counter once", async t => {
  const { db, repository } = await fixture(t);
  await repository.record({ userId: 1, progress: { eventKey: "earlier", changes: {
    singleGobbles: 199, doubleGobbles: 49, targets: 199, rounds: 1999, score: 1999000, words: 49999,
  } } });
  let queue = Promise.resolve();
  const runtime = createAchievementRuntime({ persistence: { achievementCollection: payload => {
    const result = queue.then(() => payload.action === "record" ? repository.record(payload) : repository.roundAwards(payload.roundId));
    queue = result.catch(() => {});
    return result;
  } }, getIo: () => ({ sockets: { sockets: new Map() } }) });
  const room = { id: "live", currentRound: { id: "double", startsAt: 1000, endsAt: 61000, durationMs: 60000,
    special: { type: "target_long" }, gobbles: new Map([["Tigre", 2]]), targetFoundAt: new Map([["Tigre", 4000]]) } };
  const results = [{ userId: 1, nick: "Tigre", participated: true, words: ["CIBLE"], score: 40 }];
  await runtime.settleRound(room, results);
  await runtime.settleRound(room, results);
  let snapshot = await repository.snapshot(1);
  assert.equal(snapshot.counts.gobbles_10000, 0);
  for (const id of ["double_gobbles_1000", "targets_1000", "marathon_10000", "total_score_10000000", "words_100000"]) assert.equal(snapshot.counts[id], 1, id);
  assert.equal((await db.get("SELECT value FROM achievement_progress_v2 WHERE metric='rounds'")).value, 2000);
  room.currentRound = { id: "single", startsAt: 1000, gobbles: new Map([["Tigre", 1]]) };
  await runtime.settleRound(room, results);
  snapshot = await repository.snapshot(1);
  assert.equal(snapshot.counts.gobbles_10000, 1);
  assert.equal(snapshot.counts.double_gobbles_1000, 1);
});

test("Julien progress and its trophy are atomic with each accepted answer, ignoring earlier answers", async t => {
  const { db, repository } = await fixture(t);
  await db.exec(`CREATE TABLE avatar_objective_epochs(objective TEXT PRIMARY KEY,started_at INTEGER);
    INSERT INTO avatar_objective_epochs VALUES('lepers_correct_answers',1);
    CREATE TABLE avatar_objective_events(user_id INTEGER,objective TEXT,event_key TEXT,recorded_at INTEGER,PRIMARY KEY(user_id,objective,event_key));
    CREATE TABLE avatar_unlocks(user_id INTEGER,item_key TEXT,unlocked_at INTEGER,PRIMARY KEY(user_id,item_key));
    CREATE TABLE avatar_reward_notifications(user_id INTEGER,item_key TEXT,objective TEXT,unlocked_at INTEGER,acknowledged_at INTEGER,PRIMARY KEY(user_id,item_key));
    INSERT INTO avatar_objective_progress VALUES(1,'lepers_correct_answers',2000);`);
  const source = createAvatarObjectivesRepository({ getDb: async () => db, runWrite: fn => fn(), loadCatalog: async () => ({ families: {} }) });
  const event = { userId: 1, objective: "lepers_correct_answers", eventKey: "old", occurredAt: 999, achievementRoundId: "live#julien" };
  await source.recordBatch([event]);
  assert.equal((await db.get("SELECT count(*) AS n FROM achievement_progress_v2")).n, 0);
  const initial = await repository.record({ userId: 1, progress: { eventKey: "earlier-post-launch", changes: { julien: 19 } } });
  await repository.acknowledge(1, initial.map(award => award.eventId));
  const next = { ...event, eventKey: "new", occurredAt: 1001 };
  await db.exec("CREATE TRIGGER reject_achievement BEFORE INSERT ON achievement_events_v2 BEGIN SELECT RAISE(ABORT,'answer rollback'); END");
  await assert.rejects(source.recordBatch([next]), /answer rollback/);
  assert.equal((await db.get("SELECT value FROM avatar_objective_progress WHERE user_id=1")).value, 2001);
  assert.equal((await repository.snapshot(1)).counts.julien_1000, 0);
  await db.exec("DROP TRIGGER reject_achievement");
  const result = await source.recordBatch([next]);
  assert.equal(result.achievementAwards[0].id, "julien_1000");
  assert.equal(result.achievementAwards[0].roundId, "julien");
  assert.deepEqual((await source.recordBatch([next])).achievementAwards, []);
  assert.equal((await db.get("SELECT value FROM avatar_objective_progress WHERE user_id=1")).value, 2002);
  assert.deepEqual(await repository.pending(1), result.achievementAwards);
});
