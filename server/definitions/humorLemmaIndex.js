import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";
import { extractFormOfHint } from "./definitionService.js";

// Read dictionary descriptions, not guessed suffixes or the unreliable form_of
// column (which can contain "l'imparfait" instead of the infinitive).
export function getHumorLemmaLink(row) {
  const texts = [...new Set([row.definition, ...(row.definitions || [])].filter(Boolean))];
  let selected = null;
  for (const text of texts) {
    const clean = String(text).replace(/\([^()]*\)/gu, "").trim().replace(/\bd[’']/gu, "de ");
    const normalized = clean.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (!/^(?:(?:premiere|deuxieme|troisieme) personne du (?:singulier|pluriel)\b|participe (?:passe|present)\b|(?:feminin|masculin|pluriel)(?: (?:singulier|pluriel))? de\b|forme (?:conjuguee|flechie) (?:de|du verbe)\b)/u.test(normalized)) return null;
    const hint = extractFormOfHint(clean);
    const lemma = normalizeWord(hint?.base || "");
    if (!/^[a-z]{3,}$/u.test(lemma) || (selected && selected.lemma !== lemma)) return null;
    const label = /personne|conjuguée/u.test(clean) ? "forme conjuguée de"
      : hint.kind === "inflection" ? hint.label.replace(/ probable|\s*:/gu, "").toLocaleLowerCase("fr")
      : hint.kind === "participle" ? "participe de" : "forme de";
    selected = { lemma, label };
  }
  return selected;
}

export function buildHumorLemmaForms(rows, { entries, dictionary, minLength = 3, maxLength = 32, hitsFor }) {
  const direct = new Set(entries.map(entry => entry.word));
  const links = new Map();
  for (const row of rows) {
    const word = normalizeWord(row.key || row.word);
    const link = getHumorLemmaLink(row);
    if (link && link.lemma !== word) links.set(word, { ...link, word });
  }
  const forms = [];
  for (const [word, link] of links) {
    if (direct.has(word) || !dictionary.has(word) || word.length < Math.max(3, minLength) || word.length > maxLength) continue;
    const seen = new Set([word]);
    let lemma = link.lemma, label = link.label;
    while (!direct.has(lemma) && links.has(lemma) && !seen.has(lemma)) {
      seen.add(lemma);
      lemma = links.get(lemma).lemma;
      label = "forme de";
    }
    if (!direct.has(lemma) || seen.has(lemma)) continue;
    if (word.startsWith(lemma)) continue; // Its complete lemma is already playable on the same path.
    forms.push({ word, lemma, formLabel: label, hits: hitsFor(word) });
  }
  return forms.sort((a, b) => a.word < b.word ? -1 : a.word > b.word ? 1 : 0);
}

export async function readHumorLemmaRows(filename) {
  const db = await open({ filename, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    const rows = await db.all("SELECT key, definition, definitions_json FROM definitions");
    return rows.map(row => ({ ...row, definitions: JSON.parse(row.definitions_json || "[]") }));
  } finally { await db.close(); }
}
