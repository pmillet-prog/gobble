import test from "node:test";
import assert from "node:assert/strict";
import {
  addPreparedGrid,
  buildFrequencyPayload,
  buildFrequencyRows,
  createFrequencyStats,
  createSeededRandom,
  renderFrequencyCsv,
  renderFrequencyHtml,
  summarizeFrequencyStats,
  wilsonInterval,
} from "../scripts/word-grid-frequency-core.mjs";
import { parseArgs } from "../scripts/measure-word-grid-frequency.mjs";

function grid(words, { mode = "normal", ok = true } = {}) {
  return {
    plan: { type: mode },
    grid: Array.from({ length: 16 }, () => ({ letter: "A" })),
    quality: { ok },
    solutions: words.map((word) => ({ word })),
  };
}

test("presence counts once per normalized word and grid, not per path or player", () => {
  const stats = createFrequencyStats("normal");
  addPreparedGrid(stats, grid(["ÉTÉ", "ete", "été", "rire"]));
  addPreparedGrid(stats, grid(["RIRE", "chat"]));
  assert.equal(stats.grids, 2);
  assert.deepEqual(Object.fromEntries(stats.counts), { ete: 1, rire: 2, chat: 1 });
  assert.equal(stats.totalWords, 4);
  assert.deepEqual(buildFrequencyRows(stats).map(({ word, frequencyPercent }) => [word, frequencyPercent]), [
    ["rire", 100], ["chat", 50], ["ete", 50],
  ]);
});

test("an absent word still contributes to the denominator; repeated random grids remain observations", () => {
  const stats = createFrequencyStats("normal");
  const repeated = grid(["chat"]);
  addPreparedGrid(stats, repeated);
  addPreparedGrid(stats, repeated);
  addPreparedGrid(stats, grid(["rire"]));
  const row = buildFrequencyRows(stats)[0];
  assert.equal(row.hits, 2);
  assert.equal(row.grids, 3);
  assert.equal(row.frequencyPercent, 200 / 3);
  assert.equal(row.gridsPerAppearance, 1.5);
});

test("keep returned quality fallbacks but never count empty preparations as grids", () => {
  const stats = createFrequencyStats("normal");
  assert.equal(addPreparedGrid(stats, null), false);
  addPreparedGrid(stats, grid(["rare"], { ok: false }));
  assert.equal(stats.grids, 1);
  assert.equal(stats.emptyPreparations, 1);
  assert.equal(stats.qualityFallbacks, 1);
  assert.equal(buildFrequencyRows(stats)[0].frequencyPercent, 100);
  assert.throws(() => addPreparedGrid(stats, grid([])), /sans solutions/);
  assert.throws(() => addPreparedGrid(stats, grid(["mot"], { mode: "finale" })), /invalide/);
});

test("mode populations and table length filters do not change the denominator", () => {
  const classic = createFrequencyStats("normal");
  const massive = createFrequencyStats("massive_boggle");
  addPreparedGrid(classic, grid(["chat"]));
  addPreparedGrid(classic, grid(["plaisanterie"]));
  addPreparedGrid(massive, grid(["chat"], { mode: "massive_boggle" }));
  const rows = buildFrequencyRows(classic, { minLength: 4, maxLength: 4 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].frequencyPercent, 50);
  assert.equal(buildFrequencyRows(massive)[0].frequencyPercent, 100);
  assert.equal(summarizeFrequencyStats(classic).distinctWords, 2);
});

test("Wilson 95% intervals include uncertainty at zero and at 100%", () => {
  const [lower, upper] = wilsonInterval(50, 100);
  assert.ok(Math.abs(lower - 0.4038315303659957) < 1e-10);
  assert.ok(Math.abs(upper - 0.5961684696340044) < 1e-10);
  assert.ok(wilsonInterval(0, 100)[1] > 0.03);
  assert.ok(wilsonInterval(100, 100)[0] < 0.97);
  assert.throws(() => wilsonInterval(2, 1), /invalides/);
  assert.throws(() => wilsonInterval(0, 0), /invalides/);
});

test("sample seeds are independent of previous jobs and worker scheduling", () => {
  const draw = (seed) => {
    const random = createSeededRandom(seed);
    return Array.from({ length: 20 }, random);
  };
  const a = draw("run:normal:0:0");
  draw("run:normal:800:0");
  assert.deepEqual(a, draw("run:normal:0:0"));
  assert.notDeepEqual(a, draw("run:normal:1:0"));
  assert.ok(a.every((value) => value >= 0 && value < 1));
});

test("sampling uses production generation plans and disables the optional theme search", () => {
  const classic = buildFrequencyPayload("normal", 12);
  assert.equal(classic.roundNumber, 13);
  assert.equal(classic.roomConfig.gridSize, 4);
  assert.equal(classic.roundPlan.minWords, 150);
  assert.deepEqual(classic.cultureThemeOptions, { disabled: true });
  const finale = buildFrequencyPayload("finale", 0);
  assert.equal(finale.roundPlan.minWords, 225);
  assert.equal(finale.roundPlan.minTotalScore, 12000);
  assert.equal(finale.roundPlan.tileBonusMultiplier, 2);
  assert.equal(buildFrequencyPayload("massive_boggle", 0).roundPlan.minWordLength, 3);
  assert.equal(buildFrequencyPayload("fake_twins", 0).roundPlan.minWordLength, 2);
  assert.throws(() => buildFrequencyPayload("unknown", 0), /inconnu/);
});

test("CLI rejects invalid or misleading sample sizes instead of silently truncating them", () => {
  assert.throws(() => parseArgs(["--count", "1.5"]), /Entier positif/);
  assert.throws(() => parseArgs(["--count", "0"]), /Entier positif/);
  assert.throws(() => parseArgs(["--modes", "normal,unknown"]), /inconnu/);
  assert.throws(() => parseArgs(["--min-length", "8", "--max-length", "4"]), /minimale/);
  const options = parseArgs(["--modes", "normal,finale,normal", "--count", "100"]);
  assert.deepEqual(options.modes, ["normal", "finale"]);
  assert.equal(options.count, 100);
});

test("French CSV preserves numeric counts and percentages; HTML safely embeds labels", () => {
  const stats = createFrequencyStats("normal");
  addPreparedGrid(stats, grid(["chat"]));
  addPreparedGrid(stats, grid(["rire"]));
  const rows = buildFrequencyRows(stats);
  const csv = renderFrequencyCsv(rows);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"chat";"4";"1";"2";"50,0000"/);
  assert.equal(csv.trim().split("\r\n").length, 3);
  const html = renderFrequencyHtml({ modes: [], options: { seed: "</script><b>" }, rows });
  assert.ok(!html.includes("</script><b>"));
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
});
