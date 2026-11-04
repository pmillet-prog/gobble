import { normalizeWord } from "../../dev/motus/word-rules.mjs";

// A deliberately permissive first filter, not a promise that every word is easy.
export const GOTUS_FAMILIARITY_POLICY = Object.freeze({
  minKnownPercent: 50,
  minFrequencyPerMillion: 0.02,
});

function numberOrNull(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function extractGotusFamiliarity(tsv, candidates) {
  const lines = String(tsv).replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = lines.shift().split("\t");
  const columns = Object.fromEntries(["Mot", "FreqOrtho", "Preval", "PrevalNb"].map(name => {
    const index = header.findIndex(column => column === name || column.endsWith(`_${name}`));
    if (index < 0) throw new Error(`Colonne Lexique absente : ${name}`);
    return [name, index];
  }));
  const wanted = new Set(candidates);
  const words = new Map();
  let invalidRows = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    const word = normalizeWord(fields[columns.Mot]);
    if (!wanted.has(word)) continue;
    const frequency = numberOrNull(fields[columns.FreqOrtho]);
    const knownPercent = numberOrNull(fields[columns.Preval]);
    const respondents = numberOrNull(fields[columns.PrevalNb]);
    if (fields.length !== header.length || frequency == null || knownPercent > 100) {
      invalidRows += 1;
      continue;
    }
    const previous = words.get(word) || [0, null];
    // FreqOrtho already combines grammatical homographs. Never sum duplicate
    // rows. Gotus ignores accents, so the most familiar spelling can qualify it.
    words.set(word, [
      Math.max(previous[0], frequency),
      knownPercent != null && respondents > 0
        ? Math.max(previous[1] ?? 0, knownPercent)
        : previous[1],
    ]);
  }
  return { words: Object.fromEntries([...words].sort(([a], [b]) => a.localeCompare(b))), invalidRows };
}

export function selectGotusTargets(bank, familiarity, policy = GOTUS_FAMILIARITY_POLICY) {
  const { minKnownPercent, minFrequencyPerMillion } = policy;
  if (!Number.isFinite(minKnownPercent) || minKnownPercent < 0 || minKnownPercent > 100 ||
    !Number.isFinite(minFrequencyPerMillion) || minFrequencyPerMillion <= 0) {
    throw new Error("Seuils de familiarité Gotus invalides.");
  }
  if (bank?.wordLength !== 6 || !Array.isArray(bank.targets) || !Array.isArray(bank.accepted) ||
    !familiarity?.words) throw new Error("Sources Gotus invalides.");
  const accepted = new Set(bank.accepted);
  if (bank.targets.some(word => !/^[A-Z]{6}$/.test(word) || !accepted.has(word)) ||
    new Set(bank.targets).size !== bank.targets.length) throw new Error("Cibles Gotus incohérentes.");
  const targets = [];
  const excluded = { missingEvidence: [], lowFamiliarity: [], lowFrequency: [] };
  for (const word of bank.targets) {
    const measures = familiarity.words[word];
    if (!measures) { excluded.missingEvidence.push(word); continue; }
    const [frequency, knownPercent] = measures;
    if (!Number.isFinite(frequency) || frequency < 0 ||
      (knownPercent !== null && (!Number.isFinite(knownPercent) || knownPercent < 0 || knownPercent > 100))) {
      throw new Error(`Mesure de familiarité invalide : ${word}`);
    }
    // A familiar word can be rare in subtitles (e.g. ALEVIN). Conversely a
    // specialist word does not become easy just because a film mentions it.
    if (knownPercent !== null) {
      if (knownPercent >= minKnownPercent) targets.push(word);
      else excluded.lowFamiliarity.push(word);
    } else if (frequency >= minFrequencyPerMillion) targets.push(word);
    else excluded.lowFrequency.push(word);
  }
  if (!targets.length) throw new Error("Le filtre Gotus ne conserve aucune cible.");
  return { targets, excluded };
}
