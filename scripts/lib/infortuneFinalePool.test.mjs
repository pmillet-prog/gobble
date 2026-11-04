import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileInfortuneFinalePool, inspectInfortuneFinalePool } from "./infortuneFinalePool.mjs";

const manifest = { schemaVersion: 1, name: "Test", packs: ["test.json"] };
const entry = (id, clue, answer, extra = {}) => ({ id, clue, answer, difficulty: 1, ...extra });
const pack = puzzles => ({ schemaVersion: 1, kind: "riddle", groups: [{ category: "Mystères", puzzles }] });

test("assembly preserves editorial choices and never promotes drafts automatically", () => {
  const puzzle = entry("p1", "Mes aiguilles donnent une direction aux voyageurs.", "boussole", {
    acceptedAnswers: ["compas"], excludedAnswers: ["boussolettes"],
  });
  const value = compileInfortuneFinalePool(manifest, [pack([puzzle])]);
  assert.equal(value.puzzles[0].status, "draft");
  assert.deepEqual(value.puzzles[0].acceptedAnswers, ["compas"]);
  assert.deepEqual(value.puzzles[0].excludedAnswers, ["boussolettes"]);
  assert.equal(value.puzzles[0].editorial.pack, "test.json");
  const approved = compileInfortuneFinalePool(manifest, [pack([{ ...puzzle, status: "reviewed" }])]);
  assert.equal(approved.puzzles[0].status, "reviewed");
});

test("a mistyped reference stops assembly instead of inventing a citation", () => {
  const puzzle = entry("p1", "Quel astre gravite naturellement autour de la Terre ?", "Lune", { reference: "missing" });
  assert.throws(() => compileInfortuneFinalePool(manifest, [pack([puzzle])]), /reference_missing/);
});

test("declared themes prevent label drift while allowing new themes and entry overrides", () => {
  const input = pack([entry("p1", "Le ciel devient sombre quand ces masses cachent le soleil.", "nuages")]);
  const plan = { ...manifest, categories: ["Sciences"] };
  assert.throws(() => compileInfortuneFinalePool(plan, [input]), /category_unknown/);
  input.groups[0].category = "Sciences";
  assert.equal(compileInfortuneFinalePool(plan, [input]).puzzles[0].category, "Sciences");
  input.groups[0].puzzles[0].category = "Météo";
  assert.throws(() => compileInfortuneFinalePool(plan, [input]), /category_unknown/);
  plan.categories.push("Météo");
  assert.equal(compileInfortuneFinalePool(plan, [input]).puzzles[0].category, "Météo");
  assert.throws(() => compileInfortuneFinalePool({ ...plan, categories: ["Météo", "Météo"] }, [input]), /categories_invalid/);
});

test("aliases count once per puzzle but collisions between puzzles are reported", () => {
  const bank = compileInfortuneFinalePool(manifest, [pack([
    entry("p1", "La montagne renvoie votre voix après votre cri.", "écho", { acceptedAnswers: ["echo"] }),
    entry("p2", "Une caverne vous répond avec les mots que vous avez prononcés.", "echo"),
  ])]);
  assert.deepEqual(inspectInfortuneFinalePool(bank).repeatedAnswers, [{ answer: "ECHO", ids: ["p1", "p2"] }]);
});

test("rephrased but lexically similar clues are flagged for editorial review", () => {
  const bank = compileInfortuneFinalePool(manifest, [pack([
    entry("p1", "La lune traverse le ciel chaque nuit au-dessus de la forêt.", "mystère"),
    entry("p2", "La lune traverse le ciel chaque nuit près de la forêt.", "autre"),
  ])]);
  assert.equal(inspectInfortuneFinalePool(bank).similarClues.length, 1);
});

test("revealing a letter is charged once, including accented forms, in full-board estimates", () => {
  const bank = compileInfortuneFinalePool(manifest, [pack([
    entry("p1", "ÉÉÉÉ ÉÉÉÉ ÉÉÉÉ ÉÉÉÉ ÉÉÉÉ", "inconnu"),
  ])]);
  const report = inspectInfortuneFinalePool(bank);
  assert.equal(report.entries[0].fullRevealCost, 150);
  assert.equal(report.entries[0].eCoverage, 100);
});

test("free answers in themes and visible digits are called out", () => {
  const input = pack([entry("p1", "Quel animal revient ici après 123 jours de voyage ?", "chat")]);
  input.groups[0].category = "Le chat";
  const report = inspectInfortuneFinalePool(compileInfortuneFinalePool(manifest, [input]));
  assert.deepEqual(report.warnings.map(value => value.kind), ["answer_in_category", "visible_numbers"]);
});

test("the checked-in catalogue and report exactly match their editable source packs", async () => {
  const base = new URL("../../data/", import.meta.url);
  const source = new URL("infortune-finale/", base);
  const load = async url => JSON.parse(await readFile(url, "utf8"));
  const plan = await load(new URL("manifest.json", source));
  const packs = await Promise.all(plan.packs.map(name => load(new URL(name, source))));
  const compiled = compileInfortuneFinalePool(plan, packs);
  assert.deepEqual(await load(new URL("infortune-finale-bank.json", base)), compiled);
  assert.deepEqual(await load(new URL("infortune-finale-pool.report.json", base)), inspectInfortuneFinalePool(compiled));
});
