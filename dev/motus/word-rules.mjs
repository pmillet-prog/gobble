export const WORD_LENGTH = 6;

export function normalizeWord(value) {
  return String(value ?? "").trim().replace(/œ/gi, "oe").replace(/æ/gi, "ae")
    .normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
}

const NON_VERBAL = new Set([
  "nom", "adjectif", "adverbe", "interjection", "pronom", "determinant",
  "article", "preposition", "conjonction", "onomatopee", "numeral",
  "adjectif indefini", "adjectif numeral", "adjectif possessif", "adjectif demonstratif",
]);
const plain = value => normalizeWord(value).toLowerCase();

// Inspect every French grammatical section, including accented homographs.
// Definitions/examples outside the current POS section cannot admit a word.
export function classifyFrenchPage({ title, text }) {
  const evidence = new Set();
  if (!title || title !== title.toLocaleLowerCase("fr")) return [];
  let inFrench = false;
  let section = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^==(?!=)/.test(line)) {
      inFrench = /\{\{\s*langue\s*\|\s*fr\s*\}\}/i.test(line);
      section = null;
      continue;
    }
    if (!inFrench) continue;
    const heading = line.match(/^(={3,})\s*\{\{\s*S\s*\|([^}]+)\}\}/i);
    if (heading) {
      const parts = heading[2].split("|").map(part => plain(part).trim());
      // Subsections (examples, synonyms, translations...) are never lexical evidence.
      section = parts.includes("fr") ? { pos: parts[0], inflected: parts.includes("flexion") } : null;
      continue;
    }
    if (!section) continue;
    if (/^#(?![*:#])/.test(line)) {
      if (NON_VERBAL.has(section.pos)) evidence.add("non-verbal");
      if (section.pos === "verbe") {
        const definition = plain(line).replace(/['\[\]]/g, "");
        if (/participe\s+passe\b/.test(definition)) evidence.add("past-participle");
        else if (section.inflected || /personne|participe\s+present|forme\s+conjuguee/.test(definition)) {
          evidence.add("conjugated");
        } else {
          evidence.add("infinitive");
        }
      }
    }
    if (section.pos === "verbe" && /\{\{fr-verbe-flexion\b/i.test(line)) {
      if (/\|\s*pp(?:ms|mp|fs|fp)\s*=\s*(?:oui|1)\b/i.test(line)) evidence.add("past-participle");
      evidence.add("conjugated");
    }
  }
  return [...evidence].sort();
}

export function targetEligibility(evidence) {
  if (evidence.some(kind => ["non-verbal", "past-participle", "infinitive"].includes(kind))) return "allowed";
  return evidence.includes("conjugated") ? "conjugated-only" : "unclassified";
}
