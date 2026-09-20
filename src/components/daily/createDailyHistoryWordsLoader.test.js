import test from "node:test";
import assert from "node:assert/strict";
import { createDailyHistoryWordsLoader } from "./createDailyHistoryWordsLoader.js";

test("words load only on demand, deduplicate, cache by date/mode/account and cancel stale loads", async () => {
  const calls = [];
  const loader = createDailyHistoryWordsLoader({ fetchImpl: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })) });
  assert.equal(calls.length, 0);
  const first = loader.load("2026-09-19", "monstrous_grid", "1");
  assert.equal(loader.load("2026-09-19", "monstrous_grid", "1"), first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(new URL(calls[0].url, "https://example.test").searchParams.get("dateId"), "2026-09-19");
  const words = { ok: true, findableWords: ["chat"], myWords: ["chat"] };
  calls[0].resolve({ ok: true, json: async () => words });
  assert.deepEqual(await first, words);
  assert.deepEqual(await loader.load("2026-09-19", "monstrous_grid", "1"), words);
  assert.equal(calls.length, 1);
  const next = loader.load("2026-09-19", "self_specials_3_words", "1");
  const other = loader.load("2026-09-19", "monstrous_grid", "2");
  assert.equal(calls[1].options.signal.aborted, true);
  calls[1].resolve({ ok: true, json: async () => words });
  assert.equal(await next, null);
  loader.cancel();
  calls[2].resolve({ ok: true, json: async () => words });
  assert.equal(await other, null);
});

test("a temporary history failure remains retryable", async () => {
  let count = 0;
  const loader = createDailyHistoryWordsLoader({ fetchImpl: async () => ({
    ok: ++count > 1, json: async () => count > 1 ? { ok: true, findableWords: [] } : { ok: false, error: "not_ready" },
  }) });
  await assert.rejects(loader.load("2026-09-19", "monstrous_grid", "1"), /not_ready/);
  assert.equal((await loader.load("2026-09-19", "monstrous_grid", "1")).ok, true);
});
