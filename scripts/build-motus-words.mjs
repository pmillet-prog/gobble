import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readWiktionaryPages } from "./lib/readWiktionaryPages.mjs";
import { normalizeWord, WORD_LENGTH, classifyFrenchPage, targetEligibility } from "../dev/motus/word-rules.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const options = {
  dictionary: path.join(root, "public/dico.txt"),
  dump: path.join(root, "data/frwiktionary-latest-pages-articles.xml"),
  output: path.join(root, "dev/motus/data"),
  report: path.join(root, ".tmp/motus/word-report.json"),
};
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index].replace(/^--/, "");
  if (!(name in options) || !process.argv[index + 1]) throw new Error(`Option invalide : ${process.argv[index]}`);
  options[name] = path.resolve(process.argv[index + 1]);
}

const dictionary = await readFile(options.dictionary, "utf8");
const accepted = [...new Set(dictionary.split(/\r?\n/).map(normalizeWord).filter(word => /^[A-Z]{6}$/.test(word)))].sort();
const acceptedSet = new Set(accepted);
const records = new Map();
const dumpInfo = await stat(options.dump);
let pages = 0;
for await (const page of readWiktionaryPages(options.dump)) {
  pages += 1;
  if (pages % 500000 === 0) console.log(`[motus] ${pages.toLocaleString("fr")} pages analysées…`);
  const word = normalizeWord(page.title);
  if (!acceptedSet.has(word)) continue;
  const evidence = classifyFrenchPage(page);
  if (!evidence.length) continue;
  const record = records.get(word) || { evidence: new Set(), sources: [] };
  evidence.forEach(kind => record.evidence.add(kind));
  record.sources.push({ title: page.title, evidence, url: `https://fr.wiktionary.org/wiki/${encodeURIComponent(page.title)}` });
  records.set(word, record);
}
const targets = [];
const excluded = { "conjugated-only": [], unclassified: [] };
const details = {};
for (const word of accepted) {
  const record = records.get(word);
  const evidence = [...(record?.evidence || [])].sort();
  const decision = targetEligibility(evidence);
  if (decision === "allowed") targets.push(word);
  else excluded[decision].push(word);
  details[word] = { decision, evidence, sources: record?.sources || [] };
}
if (!targets.length) throw new Error("Aucun mot à trouver : vérifier le dump et les rubriques françaises.");
const metadata = {
  schemaVersion: 1, wordLength: WORD_LENGTH, generatedAt: new Date().toISOString(),
  source: "Wiktionnaire français — dump local", sourceUrl: "https://fr.wiktionary.org/",
  sourceLicense: "CC BY-SA / GFDL (Wiktionnaire)",
  dictionarySha256: createHash("sha256").update(dictionary).digest("hex"),
  dump: { filename: path.basename(options.dump), bytes: dumpInfo.size, modifiedAt: dumpInfo.mtime.toISOString() },
  counts: { accepted: accepted.length, targets: targets.length, conjugatedOnly: excluded["conjugated-only"].length, unclassified: excluded.unclassified.length },
  policy: "Infinitifs, participes passés et emplois non verbaux attestés admis. Homographes fusionnés après retrait des accents. Conjugaisons seules et formes non classées exclues des cibles, conservées dans les propositions.",
};
await mkdir(options.output, { recursive: true });
await mkdir(path.dirname(options.report), { recursive: true });
await writeFile(path.join(options.output, "words.json"), JSON.stringify({ ...metadata, accepted, targets }) + "\n");
await writeFile(path.join(options.output, "word-summary.json"), JSON.stringify({ ...metadata, excluded }, null, 2) + "\n");
await writeFile(options.report, JSON.stringify({ ...metadata, words: details }, null, 2) + "\n");
console.log(JSON.stringify(metadata.counts, null, 2));
console.log(`Rapport détaillé : ${options.report}`);
