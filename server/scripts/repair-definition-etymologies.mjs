#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { cleanEtymologyText, extractRawFrenchEtymologyBlock } from "../../scripts/build-wiktionary-definitions.mjs";
import { readWiktionaryPages } from "../../scripts/lib/readWiktionaryPages.mjs";
import { getEtymologyTextIssues, hasUnbalancedEtymologyDelimiters } from "../../scripts/lib/etymologyText.mjs";

const quoteIdentifier = (value) => `"${value.replace(/"/g, '""')}"`;

async function hashFile(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function assertMissing(filename) {
  try { await fs.access(filename); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error(`Le fichier existe déjà : ${filename}`);
}

// Hash every field other than the one this repair is allowed to change.
async function preservedDataFingerprint(db) {
  const schema = await db.all("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
  const hash = createHash("sha256").update(JSON.stringify(schema));
  const counts = {};
  for (const table of schema.filter((entry) => entry.type === "table")) {
    const columns = (await db.all(`PRAGMA table_info(${quoteIdentifier(table.name)})`))
      .map((column) => column.name)
      .filter((column) => table.name !== "definitions" || column !== "etymology");
    const selected = columns.map(quoteIdentifier).join(", ");
    const ordering = table.name === "definitions" ? '"key"' : selected;
    const count = (await db.get(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(table.name)}`)).n;
    counts[table.name] = count;
    hash.update(JSON.stringify({ table: table.name, columns, count }));
    for (let offset = 0; offset < count; offset += 2000) {
      const rows = await db.all(`SELECT ${selected} FROM ${quoteIdentifier(table.name)} ORDER BY ${ordering} LIMIT 2000 OFFSET ?`, offset);
      for (const row of rows) hash.update(`${JSON.stringify(row)}\n`);
    }
  }
  return { sha256: hash.digest("hex"), counts };
}

export async function repairDefinitionEtymologies({ db: sourcePath, dump, output, report, changes, onProgress = () => {} }) {
  sourcePath = path.resolve(sourcePath);
  dump = path.resolve(dump);
  output = path.resolve(output);
  report = path.resolve(report || `${output}.report.json`);
  changes = path.resolve(changes || `${output}.changes.jsonl`);
  if (new Set([sourcePath, dump, output, report, changes]).size !== 5) {
    throw new Error("Les chemins source, dump, copie, rapport et modifications doivent être distincts.");
  }
  for (const filename of [output, report, changes]) await assertMissing(filename);
  const wal = await fs.stat(`${sourcePath}-wal`).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (wal?.size) throw new Error("La source contient un journal WAL actif : utiliser une sauvegarde SQLite cohérente.");
  const sourceSha256 = await hashFile(sourcePath);
  const source = await open({ filename: sourcePath, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  let target;
  try {
    await source.exec("PRAGMA query_only=ON");
    const preservedBefore = await preservedDataFingerprint(source);
    const rows = await source.all("SELECT key, title, etymology FROM definitions WHERE source='wiktionary'");
    const byTitle = new Map(rows.map((row) => [row.title, row]));
    if (byTitle.size !== rows.length) throw new Error("Plusieurs entrées ont le même titre source.");
    const pending = [];
    const rejected = [];
    const unsupportedTemplates = new Map();
    let pagesRead = 0;
    let matched = 0;
    let emptyKept = 0;
    const startedAt = new Date().toISOString();
    for await (const page of readWiktionaryPages(dump)) {
      pagesRead += 1;
      if (pagesRead % 250000 === 0) onProgress({ pagesRead, matched, changed: pending.length });
      const previous = byTitle.get(page.title);
      if (!previous) continue;
      byTitle.delete(page.title);
      matched += 1;
      const raw = extractRawFrenchEtymologyBlock(page.text);
      const etymology = cleanEtymologyText(raw, undefined, {
        onUnsupportedTemplate: ({ name, body }) => {
          const item = unsupportedTemplates.get(name) || { name, occurrences: 0, entries: new Set(), examples: [] };
          item.occurrences += 1;
          item.entries.add(previous.key);
          if (item.examples.length < 3) item.examples.push({ key: previous.key, template: Buffer.from(body).toString() });
          unsupportedTemplates.set(name, item);
        },
      });
      if (!etymology) { emptyKept += 1; continue; }
      if (etymology === previous.etymology) continue;
      if (hasUnbalancedEtymologyDelimiters(etymology)) {
        rejected.push({ key: previous.key, title: previous.title, reason: "unbalanced-source-text", proposed: etymology });
        continue;
      }
      pending.push({ key: previous.key, title: previous.title, before: previous.etymology, after: etymology });
    }
    if (!matched) throw new Error("Aucune entrée de la base ne correspond au dump fourni.");
    if (matched < rows.length * 0.99) throw new Error(`Dump incompatible ou incomplet : ${matched}/${rows.length} titres retrouvés.`);
    onProgress({ pagesRead, matched, changed: pending.length, stage: "copy-and-update" });
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.copyFile(sourcePath, output, fs.constants.COPYFILE_EXCL);
    if (await hashFile(output) !== sourceSha256) throw new Error("La source a changé pendant la copie.");
    target = await open({ filename: output, driver: sqlite3.Database, mode: sqlite3.OPEN_READWRITE });
    await target.exec("PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE");
    const update = await target.prepare("UPDATE definitions SET etymology=? WHERE key=? AND etymology=?");
    try {
      for (const entry of pending) {
        const result = await update.run(entry.after, entry.key, entry.before);
        if (result.changes !== 1) throw new Error(`Entrée modifiée entre-temps : ${entry.key}`);
      }
      await target.exec("COMMIT");
    } catch (error) {
      await target.exec("ROLLBACK");
      throw error;
    } finally { await update.finalize(); }
    const integrity = await target.all("PRAGMA integrity_check");
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error(`Intégrité SQLite invalide : ${JSON.stringify(integrity)}`);
    }
    onProgress({ stage: "verify-preserved-data" });
    const preservedAfter = await preservedDataFingerprint(target);
    if (preservedAfter.sha256 !== preservedBefore.sha256) throw new Error("Une donnée hors étymologie a changé.");
    const remainingTextIssues = (await target.all("SELECT key, title, etymology FROM definitions WHERE etymology<>''"))
      .flatMap((row) => {
        const issues = getEtymologyTextIssues(row.etymology);
        return issues.length ? [{ ...row, issues }] : [];
      });
    await target.close();
    target = null;
    if (await hashFile(sourcePath) !== sourceSha256) throw new Error("La base source a changé pendant le traitement.");
    const summary = {
      ok: true, startedAt, finishedAt: new Date().toISOString(),
      sourcePath, sourceSha256, dump, dumpBytes: (await fs.stat(dump)).size,
      output, outputSha256: await hashFile(output), outputBytes: (await fs.stat(output)).size,
      pagesRead, matched, changed: pending.length, emptyKept,
      missingTitles: Array.from(byTitle.keys()),
      rejected,
      quality: {
        remainingTextIssues,
        unsupportedTemplates: Array.from(unsupportedTemplates.values(), (item) => ({
          ...item, entries: item.entries.size,
        })).sort((a, b) => b.occurrences - a.occurrences),
      },
      preservedData: preservedAfter, integrity: "ok", changedColumns: ["definitions.etymology"],
    };
    await fs.mkdir(path.dirname(changes), { recursive: true });
    await fs.writeFile(changes, pending.map((entry) => JSON.stringify(entry)).join("\n") + "\n", { flag: "wx" });
    await fs.mkdir(path.dirname(report), { recursive: true });
    await fs.writeFile(report, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
    return summary;
  } finally {
    await target?.close();
    await source.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("node server/scripts/repair-definition-etymologies.mjs --db source.sqlite --dump dump.xml --output copie.sqlite [--report rapport.json] [--changes changements.jsonl]");
  } else {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const name = args[i].replace(/^--/, "");
      if (!["db", "dump", "output", "report", "changes"].includes(name) || !args[i + 1]) {
        throw new Error(`Argument invalide : ${args[i]}`);
      }
      options[name] = args[i + 1];
    }
    if (!options.db || !options.dump || !options.output) throw new Error("--db, --dump et --output sont obligatoires.");
    repairDefinitionEtymologies({ ...options, onProgress: (state) => console.error(JSON.stringify(state)) })
      .then((summary) => console.log(JSON.stringify(summary, null, 2)))
      .catch((error) => { console.error(error); process.exitCode = 1; });
  }
}
