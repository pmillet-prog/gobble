import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractGotusFamiliarity, GOTUS_FAMILIARITY_POLICY, selectGotusTargets } from "./lib/gotusWordSelection.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const options = {
  bank: path.join(root, "dev/motus/data/words.json"),
  familiarity: path.join(root, "data/gotus-word-familiarity.json"),
  output: path.join(root, "public/gotus/words.json"),
  report: path.join(root, "data/gotus-word-selection.report.json"),
  lexique: null,
};
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index].replace(/^--/, "");
  if (!(name in options) || !process.argv[index + 1]) throw new Error(`Option invalide : ${process.argv[index]}`);
  options[name] = path.resolve(process.argv[index + 1]);
}
const sha256 = value => createHash("sha256").update(value).digest("hex");
const rawBank = await readFile(options.bank, "utf8");
const bank = JSON.parse(rawBank);
// Ignore checkout-specific CRLF/LF differences without ignoring data changes.
const candidateBankSha256 = sha256(JSON.stringify(bank));
let familiarity;
if (options.lexique) {
  const tsv = await readFile(options.lexique, "utf8");
  familiarity = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    candidateBankSha256,
    source: {
      name: "Lexique 4.10", url: "https://www.lexique.org/",
      downloadUrl: "https://www.lexique.org/databases/Lexique410/Lexique4.1.zip",
      authors: "Boris New, Christophe Pallier, Gauvain Schalchli, Jessica Bourgin et Manuel Gimenes",
      license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      filename: path.basename(options.lexique), sha256: sha256(tsv),
    },
    columns: ["frequencyPerMillion", "knownPercent"],
    ...extractGotusFamiliarity(tsv, bank.targets),
  };
} else familiarity = JSON.parse(await readFile(options.familiarity, "utf8"));
if (familiarity.schemaVersion !== 1 || familiarity.candidateBankSha256 !== candidateBankSha256) {
  throw new Error("La banque grammaticale a changé : réimporter Lexique avec --lexique <fichier.tsv>.");
}
const { targets, excluded } = selectGotusTargets(bank, familiarity);
const selection = {
  policyVersion: 1, policy: GOTUS_FAMILIARITY_POLICY,
  source: familiarity.source, candidateBankSha256,
  originalTargets: bank.targets.length,
  description: `Cibles grammaticalement admises, connues par au moins ${GOTUS_FAMILIARITY_POLICY.minKnownPercent} % des répondants Lexique ; en l’absence de mesure de familiarité, fréquence orthographique d’au moins ${String(GOTUS_FAMILIARITY_POLICY.minFrequencyPerMillion).replace(".", ",")} occurrence par million. Mots sans mesure exclus des cibles. Toutes les propositions du dictionnaire restent admises.`,
};
const counts = { ...bank.counts, targets: targets.length, difficultyExcluded: bank.targets.length - targets.length };
const filtered = {
  ...bank, generatedAt: familiarity.generatedAt,
  counts, policy: `${bank.policy} ${selection.description}`, selection, targets,
};
const report = {
  generatedAt: familiarity.generatedAt, counts, selection, invalidSourceRows: familiarity.invalidRows,
  excludedCounts: Object.fromEntries(Object.entries(excluded).map(([reason, words]) => [reason, words.length])),
  excluded,
};
// Rebuilding the checked-in bank requires no download and does not run a backend.
for (const [filename, data] of [
  ...(options.lexique ? [[options.familiarity, familiarity]] : []),
  [options.output, filtered], [options.report, report],
]) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(data) + "\n");
}
console.log(JSON.stringify({ ...counts, excluded: report.excludedCounts }, null, 2));
