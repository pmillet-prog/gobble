import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { repairDefinitionEtymologies } from "../scripts/repair-definition-etymologies.mjs";

const xmlEscape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function page(title, etymology) {
  return `<page><title>${title}</title><revision><text>${xmlEscape(`== {{langue|fr}} ==\n=== {{S|étymologie}} ===\n: ${etymology}\n\n=== {{S|nom|fr}} ===\n# Une définition.`)}</text></revision></page>`;
}

async function fixture(t) {
  const root = path.resolve(".tmp");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "etymology-test-"));
  t.after(async () => {
    assert.ok(directory.startsWith(root + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const input = path.join(directory, "source.sqlite");
  const output = path.join(directory, "result.sqlite");
  const dump = path.join(directory, "dump.xml");
  const db = await open({ filename: input, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE definitions (key TEXT PRIMARY KEY, title TEXT, definition TEXT, etymology TEXT, source TEXT,
    embedding_semantic_themes_json TEXT, inventor_facts_json TEXT, custom_enrichment BLOB);
    CREATE INDEX by_title ON definitions(title);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO metadata VALUES ('backfilledAt', 'preserve-this');`);
  for (const [key, title, etymology, source] of [
    ["ECOLE", "école", "Du grec ancien.", "wiktionary"],
    ["AA", "aa", "Une origine conservée.", "wiktionary"],
    ["LOCAL", "local", "Une correction manuelle.", "supplement"],
  ]) {
    await db.run("INSERT INTO definitions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      key, title, "Définition conservée.", etymology, source, '["enseignement"]', '[{"name":"exemple"}]', Buffer.from([0, 255, 15]));
  }
  await db.close();
  await fs.writeFile(dump, `<mediawiki>${page("école", "Du {{étyl|grc|fr|σχολή|skholế|loisir}}.")}${page("aa", "")}${page("local", "Une autre origine à ignorer.")}</mediawiki>`);
  return { db: input, output, dump };
}

test("repairs only etymologies in a separate copy, preserving all enrichment and the source", async (t) => {
  const options = await fixture(t);
  const before = createHash("sha256").update(await fs.readFile(options.db)).digest("hex");
  const summary = await repairDefinitionEtymologies(options);
  assert.equal(summary.ok, true);
  assert.equal(summary.changed, 1);
  assert.equal(summary.emptyKept, 1);
  assert.deepEqual(summary.preservedData.counts, { definitions: 3, metadata: 1 });
  assert.equal(createHash("sha256").update(await fs.readFile(options.db)).digest("hex"), before);
  const db = await open({ filename: options.output, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    const school = await db.get("SELECT * FROM definitions WHERE key='ECOLE'");
    assert.equal(school.etymology, "Du grec ancien σχολή, skholế (« loisir »).");
    assert.equal(school.definition, "Définition conservée.");
    assert.equal(school.embedding_semantic_themes_json, '["enseignement"]');
    assert.deepEqual(school.custom_enrichment, Buffer.from([0, 255, 15]));
    assert.equal((await db.get("SELECT etymology FROM definitions WHERE key='AA'")).etymology, "Une origine conservée.");
    assert.equal((await db.get("SELECT etymology FROM definitions WHERE key='LOCAL'")).etymology, "Une correction manuelle.");
    assert.equal((await db.get("SELECT value FROM metadata")).value, "preserve-this");
  } finally { await db.close(); }
  const changes = JSON.parse((await fs.readFile(`${options.output}.changes.jsonl`, "utf8")).trim());
  assert.equal(changes.key, "ECOLE");
});

test("refuses to overwrite a source or an existing result", async (t) => {
  const options = await fixture(t);
  await assert.rejects(repairDefinitionEtymologies({ ...options, output: options.db }), /distincts/);
  await fs.writeFile(options.output, "keep");
  await assert.rejects(repairDefinitionEtymologies(options), /existe déjà/);
  assert.equal(await fs.readFile(options.output, "utf8"), "keep");
});

test("rejects partial dumps and never erases entries missing from them", async (t) => {
  const options = await fixture(t);
  await fs.writeFile(options.dump, `<mediawiki>${page("école", "Du latin et du grec ancien.")}</mediawiki>`);
  await assert.rejects(repairDefinitionEtymologies(options), /incompatible ou incomplet/);
  await assert.rejects(fs.access(options.output), { code: "ENOENT" });
});

test("requires a consistent source without uncheckpointed WAL data", async (t) => {
  const options = await fixture(t);
  await fs.writeFile(`${options.db}-wal`, "active-wal");
  await assert.rejects(repairDefinitionEtymologies(options), /WAL actif/);
  await assert.rejects(fs.access(options.output), { code: "ENOENT" });
});

test("rejects a truncated XML file even when all expected titles were already read", async (t) => {
  const options = await fixture(t);
  const complete = await fs.readFile(options.dump, "utf8");
  await fs.writeFile(options.dump, complete.replace("</mediawiki>", ""));
  await assert.rejects(repairDefinitionEtymologies(options), /XML incomplet/);
  await assert.rejects(fs.access(options.output), { code: "ENOENT" });
});

test("retains the old entry when the source introduces malformed quotation or parentheses", async (t) => {
  const options = await fixture(t);
  await fs.writeFile(options.dump, `<mediawiki>${page("école", "Du {{étyl|grc|fr|σχολή|skholế|loisir}}).")} ${page("aa", "")}</mediawiki>`);
  const result = await repairDefinitionEtymologies(options);
  assert.equal(result.changed, 0);
  assert.equal(result.rejected[0].key, "ECOLE");
  const db = await open({ filename: options.output, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try { assert.equal((await db.get("SELECT etymology FROM definitions WHERE key='ECOLE'")).etymology, "Du grec ancien."); }
  finally { await db.close(); }
});

test("reports remaining defects even when the repair leaves those texts unchanged", async (t) => {
  const options = await fixture(t);
  const source = await open({ filename: options.db, driver: sqlite3.Database });
  await source.run("UPDATE definitions SET etymology=? WHERE key='AA'", "Origine de la racine ().");
  await source.close();
  await fs.writeFile(options.dump, `<mediawiki>${page("école", "Du latin {{modèle-inconnu|perdu}} et du grec ancien.")}${page("aa", "")}</mediawiki>`);
  const result = await repairDefinitionEtymologies(options);
  assert.equal(result.quality.remainingTextIssues[0].key, "AA");
  assert.deepEqual(result.quality.remainingTextIssues[0].issues, ["empty-delimiters"]);
  assert.equal(result.quality.unsupportedTemplates[0].name, "modele-inconnu");
  assert.equal(result.quality.unsupportedTemplates[0].entries, 1);
});
