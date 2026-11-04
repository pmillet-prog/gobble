import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createGotusCatalog } from "../../server/gotus/gotusCatalog.js";
import { extractGotusFamiliarity, selectGotusTargets } from "./gotusWordSelection.mjs";

const candidates = ["ALEVIN", "ARILLE", "BALLON", "GABBRO", "LITCHI", "ORPHIE", "PORTES"];
const bank = { wordLength: 6, targets: candidates, accepted: [...candidates, "AIMAIS"] };

test("familiarity keeps known but infrequent words; frequency is the fallback when familiarity is missing", () => {
  const familiarity = { words: {
    ALEVIN: [0.003, 84], BALLON: [15, 100], GABBRO: [0.013, null],
    LITCHI: [0.044, null], ORPHIE: [0.5, 22], PORTES: [800, 100],
  } };
  const result = selectGotusTargets(bank, familiarity);
  assert.deepEqual(result.targets, ["ALEVIN", "BALLON", "LITCHI", "PORTES"]);
  assert.deepEqual(result.excluded, {
    missingEvidence: ["ARILLE"], lowFamiliarity: ["ORPHIE"], lowFrequency: ["GABBRO"],
  });
  assert.ok(bank.accepted.includes("GABBRO"), "excluded targets remain valid guesses");
  assert.ok(!result.targets.includes("AIMAIS"), "grammatical exclusions still apply");
});

test("threshold boundaries are inclusive and zero familiarity is not missing data", () => {
  const result = selectGotusTargets(bank, { words: {
    ALEVIN: [0.001, 50], BALLON: [0.02, null], ARILLE: [0.019, null],
    GABBRO: [100, 0], ORPHIE: [100, 49],
  } });
  assert.deepEqual(result.targets, ["ALEVIN", "BALLON"]);
  assert.ok(result.excluded.lowFamiliarity.includes("GABBRO"));
});

test("TSV extraction merges accents without summing repeated homographs", () => {
  const tsv = [
    "1_Mot\t11_FreqOrtho\t33_Preval\t34_PrevalNb",
    "portes\t30\t100\t25", "portes\t30\t100\t25", "portés\t2\t80\t20",
    "orphie\t0.02\t0\t20", "litchi\t0.04\t\t", "ballon\t10\t100\t0",
    "alevin\t\t84\t19", "gabbro\t0.1\t150\t20", "arille\t0.2\t50",
    "autres\t50\t100\t20",
  ].join("\r\n");
  const result = extractGotusFamiliarity(tsv, candidates);
  assert.deepEqual(result.words, {
    BALLON: [10, null], LITCHI: [0.04, null], ORPHIE: [0.02, 0], PORTES: [30, 100],
  });
  assert.equal(result.invalidRows, 3);
  assert.throws(() => extractGotusFamiliarity("wrong\theader", candidates), /Colonne Lexique absente/);
});

test("invalid measurements and empty selections fail rather than silently restoring obscure targets", () => {
  assert.throws(() => selectGotusTargets(bank, { words: {} }), /aucune cible/);
  assert.throws(() => selectGotusTargets(bank, { words: { BALLON: [-1, 100] } }), /Mesure/);
  assert.throws(() => selectGotusTargets(bank, { words: { BALLON: [1, 120] } }), /Mesure/);
  assert.throws(() => selectGotusTargets(bank, { words: {} }, { minKnownPercent: NaN, minFrequencyPerMillion: 0.02 }), /Seuils/);
});

test("published bank is reproducible and identical for server draws and browser training", async () => {
  const read = name => readFile(new URL(`../../${name}`, import.meta.url), "utf8");
  const rawSource = await read("dev/motus/data/words.json");
  const source = JSON.parse(rawSource);
  const familiarity = JSON.parse(await read("data/gotus-word-familiarity.json"));
  const published = JSON.parse(await read("public/gotus/words.json"));
  assert.equal(familiarity.candidateBankSha256, createHash("sha256").update(JSON.stringify(source)).digest("hex"));
  assert.deepEqual(published.targets, selectGotusTargets(source, familiarity).targets);
  assert.deepEqual(published.accepted, source.accepted);
  assert.equal(published.accepted.length, 17991);
  assert.ok(published.targets.length >= 6000, "the light filter retains a substantial pool");
  assert.equal(published.counts.targets, published.targets.length);
  assert.equal(published.counts.targets + published.counts.difficultyExcluded, source.targets.length);
  const catalog = createGotusCatalog(published);
  for (const word of ["ALEVIN", "BALLON", "LITCHI", "BOUTON", "PORTES", "SUSHIS"]) assert.ok(published.targets.includes(word), word);
  for (const word of ["ARILLE", "GABBRO", "ORPHIE", "BREDIN"]) {
    assert.ok(!published.targets.includes(word), word);
    assert.ok(catalog.has(word), `${word} remains an accepted guess`);
  }
  for (let i = 0; i < published.targets.length; i++) {
    assert.equal(catalog.choose(() => (i + 0.5) / published.targets.length), published.targets[i]);
  }
});
