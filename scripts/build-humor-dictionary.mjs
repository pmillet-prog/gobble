import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { normalizeWord } from '../shared/gameLogic.js';
import { buildHumorLemmaForms, readHumorLemmaRows } from '../server/definitions/humorLemmaIndex.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = path.join(root, 'data/humor/definitions.fr.txt');
const reportPath = path.resolve(process.argv[2] || path.join(root, '.tmp/word-grid-frequency/first-1000/report.json'));
const outputDir = path.join(root, 'docs/humor-dictionary');
const [source, reportText, dictionaryText, template] = await Promise.all([
  fs.readFile(sourcePath, 'utf8'), fs.readFile(reportPath, 'utf8'),
  fs.readFile(path.join(root, 'public/dico.txt'), 'utf8'),
  fs.readFile(path.join(root, 'scripts/humor-dictionary.template.html'), 'utf8'),
]);
const report = JSON.parse(reportText);
assert.equal(report.status, 'complete', 'Le rapport de fréquences doit être complet.');
const modeKeys = ['normal', 'massive_boggle', 'finale'];
const modes = modeKeys.map(key => {
  const mode = report.modes.find(entry => entry.mode === key);
  assert.ok(mode?.grids > 0, `Échantillon manquant : ${key}`);
  return {key, label: mode.label, grids: mode.grids};
});
const dictionary = new Set(dictionaryText.split(/\r?\n/).map(word => normalizeWord(word.trim())));
const rows = new Map(report.rows.map(row => [`${row.mode}:${row.word}`, row]));
const keys = new Set(), definitions = new Set(), entries = [];
for (const [index, raw] of source.split(/\r?\n/).entries()) {
  if (!raw.trim() || raw.startsWith('#')) continue;
  const fields = raw.split('|');
  assert.equal(fields.length, 2, `Ligne ${index + 1} : deux champs requis.`);
  const [label, definition] = fields;
  const word = normalizeWord(label);
  assert.match(word, /^[a-z]{3,}$/, `Mot invalide : ${label}`);
  assert.equal(label, label.trim().toLocaleUpperCase('fr'), `Graphie à corriger : ${label}`);
  assert.match(label, /^\p{Lu}+$/u, `Lettres majuscules uniquement : ${label}`);
  assert.equal(definition, definition.trim(), `Espaces superflus : ${label}`);
  assert.ok(definition.length >= 15 && definition.length <= 200, `Longueur à revoir : ${label}`);
  assert.match(definition, /[.!?]$/, `Ponctuation finale manquante : ${label}`);
  assert.ok(dictionary.has(word), `Absent du dictionnaire du jeu : ${label}`);
  assert.ok(word.length >= report.options.minLength && word.length <= report.options.maxLength,
    `Longueur non couverte par le rapport de fréquences : ${label}`);
  assert.ok(!keys.has(word), `Clé en double : ${label}`);
  const textKey = definition.normalize('NFC').toLocaleLowerCase('fr');
  assert.ok(!definitions.has(textKey), `Texte identique : ${label}`);
  keys.add(word); definitions.add(textKey);
  const frequencies = {};
  for (const mode of modes) {
    const row = rows.get(`${mode.key}:${word}`);
    const hits = row?.hits ?? 0;
    assert.ok(Number.isInteger(hits) && hits >= 0 && hits <= mode.grids);
    if (row) {
      assert.equal(row.grids, mode.grids);
      assert.ok(Math.abs(row.frequencyPercent - hits * 100 / mode.grids) < 1e-9);
    }
    frequencies[mode.key] = {hits, grids: mode.grids, percent: hits * 100 / mode.grids};
  }
  entries.push({word, label, definition, frequencies});
}
assert.ok(entries.length >= 5000, `Seulement ${entries.length} entrées : objectif minimum 5 000.`);
entries.sort((a,b) => a.label.localeCompare(b.label, 'fr'));
const sha256 = text => createHash('sha256').update(text).digest('hex');
const catalog = {
  schemaVersion: 1, language: 'fr', status: 'editorial-draft',
  count: entries.length, minimumWordLength: 3,
  purpose: 'Propositions de définitions humoristiques ; ne remplacent pas les définitions lexicales du jeu.',
  provenance: {source: 'data/humor/definitions.fr.txt', sourceSha256: sha256(source),
    frequencyReportSha256: sha256(reportText), sampleStartedAt: report.startedAt,
    sampleOptions: report.options, sampleInputs: report.inputs},
  modes,
  frequencyNote: 'Présence parmi les grilles simulées, pas fréquence de découverte par les joueurs. Zéro signifie non observé. Les types sont distincts et leurs taux ne s’additionnent pas.',
  entries,
};
assert.ok(template.includes('/*__CATALOG__*/'), 'Emplacement des données absent du modèle HTML.');
const embedded = JSON.stringify(catalog).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
await fs.mkdir(outputDir, {recursive: true});
await fs.writeFile(path.join(outputDir, 'catalog.fr.json'), JSON.stringify(catalog, null, 2) + '\n');
await fs.writeFile(path.join(outputDir, 'index.html'), template.replace('/*__CATALOG__*/', embedded));
// The server loads this compact artifact once. Neither the 38 MB simulation
// report nor the editorial viewer is needed at runtime or sent to clients.
const runtime = {
  schemaVersion: 1, provenance: catalog.provenance, modes,
  entries: entries.map(({ word, label, definition, frequencies }) => ({
    word, label, definition,
    hits: Object.fromEntries(modeKeys.map(mode => [mode, frequencies[mode].hits])),
  })),
};
const lemmaRows = await readHumorLemmaRows(path.join(root, 'data/definitions-fr.sqlite'));
runtime.forms = buildHumorLemmaForms(lemmaRows, {
  entries: runtime.entries, dictionary, minLength: report.options.minLength, maxLength: report.options.maxLength,
  hitsFor: word => Object.fromEntries(modeKeys.map(mode => [mode, rows.get(`${mode}:${word}`)?.hits ?? 0])),
});
runtime.provenance.lemmaSource = 'data/definitions-fr.sqlite';
await fs.writeFile(path.join(root, 'data/humor/runtime.fr.json'), JSON.stringify(runtime) + '\n');
console.log(JSON.stringify({entries: entries.length, additionalForms: runtime.forms.length, distinctWords: keys.size, distinctTexts: definitions.size,
  allInGameDictionary: true,
  unobserved: entries.filter(entry => modeKeys.every(mode => entry.frequencies[mode].hits === 0)).length,
  definitionCharacters: {min: Math.min(...entries.map(e=>e.definition.length)), max: Math.max(...entries.map(e=>e.definition.length))},
  outputDir}, null, 2));
