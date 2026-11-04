import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compileInfortuneFinalePool, inspectInfortuneFinalePool } from "./lib/infortuneFinalePool.mjs";

const root = new URL("../", import.meta.url);
const source = new URL("data/infortune-finale/", root);
const manifest = JSON.parse(await readFile(new URL("manifest.json", source), "utf8"));
const packs = await Promise.all(manifest.packs.map(async name => {
  if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error(`infortune_pool_invalid_path: ${name}`);
  return JSON.parse(await readFile(new URL(name, source), "utf8"));
}));
const bank = compileInfortuneFinalePool(manifest, packs);
const report = inspectInfortuneFinalePool(bank);
const outputs = [
  [new URL("data/infortune-finale-bank.json", root), bank],
  [new URL("data/infortune-finale-pool.report.json", root), report],
];
const check = process.argv.includes("--check");
for (const [file, value] of outputs) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (check) {
    if (await readFile(file, "utf8") !== text) throw new Error(`infortune_pool_outdated: ${fileURLToPath(file)}`);
  } else await writeFile(file, text, "utf8");
}
console.log(JSON.stringify({ ...report.summary, repeatedAnswers: report.repeatedAnswers.length,
  similarClues: report.similarClues.length, warnings: report.warnings.length, mode: check ? "check" : "build" }, null, 2));
