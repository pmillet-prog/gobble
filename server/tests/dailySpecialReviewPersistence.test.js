import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("daily submission persists the private recap and the total matches its accepted words", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gobble-daily-recap-"));
  const previousDirectory = process.env.GOBBLE_DATA_DIR;
  process.env.GOBBLE_DATA_DIR = directory;
  t.after(async () => {
    if (previousDirectory === undefined) delete process.env.GOBBLE_DATA_DIR;
    else process.env.GOBBLE_DATA_DIR = previousDirectory;
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-daily-recap-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const service = await import("../daily/dailyService.js");
  const dateId = service.getParisDateId();
  const specialGrid = ["CHAT", "RIEN", "SONT", "LUNE"].join("").split("").map(letter => ({ letter, bonus: null }));
  await fs.mkdir(path.join(directory, "daily"));
  await fs.writeFile(path.join(directory, "daily", `daily-${dateId}.json`), JSON.stringify({
    dateId, durationMs: 120000,
    grid: specialGrid.map(tile => ({ ...tile, letter: "A" })),
    specialGrid,
    fakeTwinsGrid: specialGrid.map(tile => ({ ...tile, letter: "B" })),
    fakeTwinsWordCount: 200,
    fakeTwinsGridQuality: { fakeTwinBonusWords: 30 },
  }));
  const payload = {
    dateId, installId: "17", pseudo: "Tigre", dailyMode: service.DAILY_SPECIAL_MODE,
    dictionary: new Set(["chat", "rien"]),
    specialPlacements: { M3: 0, L2: 1 },
    wordSubmissions: [
      { word: "CHAT", path: [0, 1, 2, 3] },
      { word: "SONT", path: [8, 9, 10, 11] },
      { word: "RIEN", path: [4, 5, 6, 7] },
    ],
  };
  const result = await service.submitDailyResult(payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.wordReview.map(entry => entry.valid), [true, false, true]);
  assert.equal(result.wordReview[1].reason, "not_in_dictionary");
  assert.equal(result.score, result.wordReview.reduce((sum, entry) => sum + entry.points, 0));
  assert.ok(result.board.every(entry => !("wordReview" in entry) && !("wordSubmissions" in entry)));
  const stored = JSON.parse(await fs.readFile(path.join(directory, "daily", `results-${dateId}.json`), "utf8"));
  assert.deepEqual(stored.results[0].wordReview, result.wordReview);
  const status = await service.getDailyStatus(dateId, "17");
  assert.deepEqual(status.mySpecialResult.wordReview, result.wordReview);
  assert.equal((await service.getDailyStatus(dateId, "18")).mySpecialResult, null);
  const empty = await service.submitDailyResult({ ...payload, installId: "18", wordSubmissions: [] });
  assert.equal(empty.ok, true);
  assert.equal(empty.score, 0);
  assert.deepEqual(empty.wordReview, []);
  const legacy = await service.submitDailyResult({ ...payload, installId: "19", wordSubmissions: undefined, foundWords: ["chat"] });
  assert.equal(legacy.ok, true);
  assert.ok(legacy.score > 0);
  assert.equal(legacy.wordReview, undefined);
});
