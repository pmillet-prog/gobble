import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("daily launch recovery and on-demand history use an isolated ledger", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gobble-daily-launch-"));
  const previous = process.env.GOBBLE_DATA_DIR;
  process.env.GOBBLE_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.GOBBLE_DATA_DIR;
    else process.env.GOBBLE_DATA_DIR = previous;
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-daily-launch-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const service = await import("../daily/dailyService.js");
  const today = service.getParisDateId();
  const yesterday = service.addDaysToDateId(today, -1);
  const grid = "CHATRIENSONTLUNE".split("").map(letter => ({ letter, bonus: null }));
  const fixture = {
    durationMs: 120000, grid: grid.map(tile => ({ ...tile, letter: "A" })), specialGrid: grid,
    fakeTwinsGrid: grid.map(tile => ({ ...tile, letter: "B" })), fakeTwinsWordCount: 200,
    fakeTwinsGridQuality: { fakeTwinBonusWords: 30 },
  };
  await fs.mkdir(path.join(directory, "daily"));
  for (const dateId of [today, yesterday]) {
    await fs.writeFile(path.join(directory, "daily", `daily-${dateId}.json`), JSON.stringify({ ...fixture, dateId }));
  }
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const launchId = "first-launch-0000001";
  const secondId = "other-launch-0000002";
  const dictionary = new Set(["chat", "rien"]);

  for (const dailyMode of [service.DAILY_MONSTROUS_MODE, service.DAILY_SPECIAL_MODE]) {
    await t.test(`${dailyMode}: preparation is free; recovery keeps its clock; paint confirmation closes replay`, async () => {
      const installId = dailyMode;
      const options = { dailyMode, launchId, dictionary };
      const prepared = await service.startDailyAttempt(today, installId, "Test", { ...options, stage: "prepare" });
      assert.equal(prepared.prepared, true);
      assert.equal(prepared.grid, undefined);
      assert.equal(prepared.solutions, undefined);
      assert.equal((await service.getDailyStatus(today, installId)).hasPlayed, false);
      // Another preparation is still free and creates no attempt.
      assert.equal((await service.startDailyAttempt(today, installId, "Test", { ...options, stage: "prepare", launchId: secondId })).launchId, secondId);
      const [started, duplicate] = await Promise.all([
        service.startDailyAttempt(today, installId, "Test", options),
        service.startDailyAttempt(today, installId, "Test", options),
      ]);
      assert.equal(started.ok, true);
      assert.equal(duplicate.startedAt, started.startedAt);
      now += 8000;
      const retry = await service.startDailyAttempt(today, installId, "Test", options);
      assert.equal(retry.ok, true);
      assert.equal(retry.endsAt, started.endsAt);
      assert.equal(retry.endsAt - retry.serverNow, 112000);
      assert.deepEqual(retry.grid, started.grid);
      assert.equal((await service.startDailyAttempt(today, installId, "Test", { ...options, launchId: secondId })).error, "already_played");
      // Refresh / a new browser request can recover only that same pending attempt.
      assert.equal((await service.startDailyAttempt(today, installId, "Test", { ...options, stage: "prepare", launchId: secondId })).launchId, launchId);
      assert.equal((await service.confirmDailyLaunch({ dateId: today, installId, dailyMode, launchId: secondId })).error, "invalid_launch");
      assert.equal((await service.confirmDailyLaunch({ dateId: today, installId, dailyMode, launchId })).ok, true);
      assert.equal((await service.confirmDailyLaunch({ dateId: today, installId, dailyMode, launchId })).ok, true);
      assert.equal((await service.startDailyAttempt(today, installId, "Test", options)).error, "already_played");
      assert.equal((await service.startDailyAttempt(today, installId, "Test", { ...options, stage: "prepare" })).error, "already_played");
    });
  }

  await t.test("missing confirmation expires into a consumed attempt; legacy attempts stay consumed", async () => {
    const options = { dailyMode: service.DAILY_SPECIAL_MODE, launchId };
    await service.startDailyAttempt(today, "lost", "Test", options);
    assert.equal((await service.getDailyStatus(today, "lost")).hasPlayedSpecial, false);
    now += 30001;
    assert.equal((await service.startDailyAttempt(today, "lost", "Test", options)).error, "already_played");
    assert.equal((await service.getDailyStatus(today, "lost")).hasPlayedSpecial, true);
    await service.startDailyAttempt(today, "legacy", "Test", { dailyMode: service.DAILY_SPECIAL_MODE });
    assert.equal((await service.startDailyAttempt(today, "legacy", "Test", { ...options, stage: "prepare" })).error, "already_played");
  });

  await t.test("history ranks load without solving; one dated mode returns only the owner's found words", async () => {
    await service.submitDailyResult({ dateId: yesterday, installId: "owner", pseudo: "Test", dictionary,
      dailyMode: service.DAILY_SPECIAL_MODE, foundWords: ["chat"] });
    const forbiddenDictionary = { get size() { throw new Error("History must not solve any grid"); } };
    const history = await service.getDailyHistory({ days: 2, installId: "owner", dictionary: forbiddenDictionary, includeWords: true });
    assert.ok(history.days[1].entries.length);
    assert.equal(history.days[1].findableWordsByMode, undefined);
    const words = await service.getDailyHistoryWords({ dateId: yesterday, dailyMode: service.DAILY_SPECIAL_MODE, installId: "owner", dictionary });
    assert.equal(words.ok, true);
    assert.deepEqual(new Set(words.findableWords), new Set(["chat", "rien"]));
    assert.deepEqual(words.myWords, ["chat"]);
    assert.deepEqual((await service.getDailyHistoryWords({ dateId: yesterday, dailyMode: service.DAILY_SPECIAL_MODE, installId: "other", dictionary })).myWords, []);
    assert.equal((await service.getDailyHistoryWords({ dateId: today, dailyMode: service.DAILY_SPECIAL_MODE, dictionary })).error, "bad_request");
    assert.equal((await service.getDailyHistoryWords({ dateId: "../../private", dailyMode: service.DAILY_SPECIAL_MODE, dictionary })).error, "bad_request");
    assert.equal((await service.getDailyHistoryWords({ dateId: yesterday, dailyMode: "unknown", dictionary })).error, "bad_request");
  });
});
