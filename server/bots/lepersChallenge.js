import { normalizeWord } from "../../shared/gameLogic.js";

export const LEPERS_BONUS_POINTS = 2;
export const LEPERS_MIN_WORD_LENGTH = 5;
export const LEPERS_RESULT_DELAY_MS = 5600;
export const LEPERS_TOURNAMENT_ROUNDS = Object.freeze([1, 3, 5]);

const LEPERS_RARITY_BUCKETS = new Set([
  "rare",
  "very_rare",
  "extreme",
  "never_found",
]);
const MAX_DEFINITION_LENGTH = 220;
const MIN_DEFINITION_LENGTH = 28;
const MIN_DEFINITION_WORDS = 5;
const MAX_DEFINITION_LOOKUPS = 72;

const LEPERS_GRAMMATICAL_NATURES = new Map([
  ["nom", { article: "un", label: "nom" }],
  ["verbe", { article: "un", label: "verbe" }],
  ["adjectif", { article: "un", label: "adjectif" }],
  ["adverbe", { article: "un", label: "adverbe" }],
  ["interjection", { article: "une", label: "interjection" }],
  ["pronom", { article: "un", label: "pronom" }],
  ["déterminant", { article: "un", label: "déterminant" }],
  ["determinant", { article: "un", label: "déterminant" }],
  ["article", { article: "un", label: "article" }],
  ["préposition", { article: "une", label: "préposition" }],
  ["preposition", { article: "une", label: "préposition" }],
  ["conjonction", { article: "une", label: "conjonction" }],
  ["locution", { article: "une", label: "locution" }],
  ["locution nominale", { article: "une", label: "locution nominale" }],
  ["locution verbale", { article: "une", label: "locution verbale" }],
  ["locution adjectivale", { article: "une", label: "locution adjectivale" }],
  ["locution adverbiale", { article: "une", label: "locution adverbiale" }],
]);

const BUCKET_SCORE = Object.freeze({
  rare: 34,
  very_rare: 28,
  extreme: 20,
  never_found: 10,
});

function normalizeForText(value) {
  return String(value || "")
    .toLocaleLowerCase("fr")
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableHash(value) {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isCrossReferenceDefinition(normalized) {
  return [
    /^(?:synonyme|variante|graphie|orthographe|ancienne orthographe) de\b/,
    /^(?:feminin|masculin|pluriel|singulier) (?:de|d un|d une)\b/,
    /^(?:premiere|deuxieme|troisieme) personne\b/,
    /^(?:participe present|participe passe|forme conjuguee|conjugaison)\b/,
    /^(?:indicatif|subjonctif|imperatif|conditionnel)\b.*\b(?:personne|de)\b/,
    /^(?:forme|flexion)\b.*\bde\b/,
    /^voir\b/,
  ].some((pattern) => pattern.test(normalized));
}

function containsAnswer(definition, word) {
  const answer = normalizeForText(word).replace(/\s+/g, "");
  const haystack = normalizeForText(definition).replace(/\s+/g, "");
  if (!answer || !haystack) return true;
  if (haystack.includes(answer)) return true;
  if (answer.length >= 7) {
    const stem = answer.slice(0, Math.min(answer.length - 2, 7));
    if (stem.length >= 5 && haystack.includes(stem)) return true;
  }
  return false;
}

function getDefinitionWordCount(value) {
  return normalizeForText(value)
    .split(" ")
    .filter((token) => /[a-z]/.test(token)).length;
}

export function scoreLepersDefinition(definition, word) {
  const text = String(definition || "").replace(/\s+/g, " ").trim();
  const normalized = normalizeForText(text);
  if (!text || text.length < MIN_DEFINITION_LENGTH || text.length > MAX_DEFINITION_LENGTH) {
    return Number.NEGATIVE_INFINITY;
  }
  const wordCount = getDefinitionWordCount(text);
  if (wordCount < MIN_DEFINITION_WORDS || isCrossReferenceDefinition(normalized)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (containsAnswer(text, word)) return Number.NEGATIVE_INFINITY;
  if (
    /\b(?:commune francaise|ancienne commune|nom de famille|nom propre|patronyme|gentile|sigle|acronyme|code iso|code iata)\b/.test(
      normalized
    )
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (text.length >= 45 && text.length <= 155) score += 24;
  else if (text.length <= 190) score += 14;
  if (wordCount >= 8 && wordCount <= 25) score += 18;
  else if (wordCount <= 32) score += 9;
  if (/^(?:qui|dont|personne|animal|plante|objet|outil|action|fait|etat|maniere|ensemble|substance|science|art|terme|mot)\b/.test(normalized)) {
    score += 8;
  }
  if (/[,:;]/.test(text)) score += 3;
  return score;
}

export function pickLepersDefinition(entry, word) {
  if (!entry || entry.isFormOf || String(entry.formOf || "").trim()) return null;
  const lexicalMetadata = normalizeForText(
    [
      ...(Array.isArray(entry.partOfSpeech) ? entry.partOfSpeech : []),
      ...(Array.isArray(entry.categories) ? entry.categories : []),
    ].join(" ")
  );
  if (
    /\b(?:noms? propres?|patronymes?|prenoms?|gentiles?|toponymes?|sigles?|acronymes?)\b/.test(
      lexicalMetadata
    )
  ) {
    return null;
  }
  const definitions = [
    entry.definition,
    ...(Array.isArray(entry.definitions) ? entry.definitions : []),
  ];
  const seen = new Set();
  let best = null;
  for (const rawDefinition of definitions) {
    const definition = String(rawDefinition || "").replace(/\s+/g, " ").trim();
    if (!definition || seen.has(definition)) continue;
    seen.add(definition);
    const score = scoreLepersDefinition(definition, word);
    if (!Number.isFinite(score)) continue;
    if (!best || score > best.score) best = { definition, score };
  }
  if (!best) return null;
  const grammaticalNature = (Array.isArray(entry.partOfSpeech) ? entry.partOfSpeech : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr"))
    .find((value) => LEPERS_GRAMMATICAL_NATURES.has(value));
  return { ...best, partOfSpeech: grammaticalNature || "" };
}

export function buildLepersInterventionText(definition, partOfSpeech = "") {
  const clean = String(definition || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const natureKey = String(partOfSpeech || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr");
  const nature = LEPERS_GRAMMATICAL_NATURES.get(natureKey) || {
    article: "un",
    label: "mot",
  };
  const sentenceDefinition = clean.replace(/^(\p{Lu})(?=\p{Ll})/u, (letter) =>
    letter.toLocaleLowerCase("fr")
  );
  const punctuated = /[.!?…]$/u.test(sentenceDefinition)
    ? sentenceDefinition
    : `${sentenceDefinition}.`;
  return `TOP ! Je suis... ${nature.article} ${nature.label} signifiant ${punctuated} Je suis, JE SUIS... !`;
}

export function buildLepersSolvedIntervention(word) {
  const answer = normalizeWord(String(word || "")).toLocaleUpperCase("fr");
  if (!answer) return null;
  return {
    text: `Bravo ! C'était « ${answer} » !`,
    highlights: [answer],
  };
}

export function buildLepersResultIntervention(word) {
  const answer = normalizeWord(String(word || "")).toLocaleUpperCase("fr");
  if (!answer) return null;
  return {
    text: `« ${answer} », bien sûr !`,
    highlights: [answer],
  };
}

function scoreCandidate(word, rarityMeta, seed) {
  const bucket = String(rarityMeta?.rarityBucket || "");
  const length = word.length;
  const lengthScore = length <= 8 ? 24 : length <= 10 ? 14 : length <= 12 ? 6 : 0;
  const foundScore = Math.min(12, Math.max(0, Number(rarityMeta?.playersFound) || 0));
  const jitter = stableHash(`${seed}:${word}`) % 17;
  return (BUCKET_SCORE[bucket] || 0) + lengthScore + foundScore + jitter;
}

export async function pickLepersChallenge(
  solutions,
  { loadDefinitionEntry, rarityMetaMap, seed = Date.now() } = {}
) {
  if (!(rarityMetaMap instanceof Map) || typeof loadDefinitionEntry !== "function") return null;
  const candidates = [];
  const seen = new Set();
  for (const solution of Array.isArray(solutions) ? solutions : []) {
    const word = normalizeWord(solution?.word || "");
    if (!word || word.length < LEPERS_MIN_WORD_LENGTH || seen.has(word)) continue;
    const rarityMeta = rarityMetaMap.get(word);
    if (rarityMeta?.isFormOf) continue;
    if (!LEPERS_RARITY_BUCKETS.has(String(rarityMeta?.rarityBucket || ""))) continue;
    seen.add(word);
    candidates.push({
      word,
      rarityMeta,
      candidateScore: scoreCandidate(word, rarityMeta, seed),
    });
  }
  candidates.sort(
    (left, right) =>
      right.candidateScore - left.candidateScore || left.word.localeCompare(right.word, "fr")
  );

  const inspected = candidates.slice(0, MAX_DEFINITION_LOOKUPS);
  const resolved = await Promise.all(
    inspected.map(async (candidate) => {
      try {
        const entry = await loadDefinitionEntry(candidate.word);
        const picked = pickLepersDefinition(entry, candidate.word);
        if (!picked) return null;
        return {
          ...candidate,
          ...picked,
          totalScore: candidate.candidateScore + picked.score,
          source: String(entry?.source || "wiktionary"),
          sourceUrl: String(entry?.sourceUrl || ""),
        };
      } catch (_) {
        return null;
      }
    })
  );
  const usable = resolved.filter(Boolean).sort(
    (left, right) =>
      right.totalScore - left.totalScore ||
      (stableHash(`${seed}:pick:${left.word}`) % 1000) -
        (stableHash(`${seed}:pick:${right.word}`) % 1000)
  );
  if (!usable.length) return null;

  const shortlist = usable.slice(0, Math.min(8, usable.length));
  const picked = shortlist[stableHash(`${seed}:shortlist`) % shortlist.length];
  return {
    word: picked.word,
    definition: picked.definition,
    text: buildLepersInterventionText(picked.definition, picked.partOfSpeech),
    highlights: ["TOP !", "JE SUIS... !"],
    rarityBucket: String(picked.rarityMeta?.rarityBucket || ""),
    rarityScore: Number(picked.rarityMeta?.rarityScore) || 0,
    source: picked.source,
    sourceUrl: picked.sourceUrl,
  };
}

export function pickLepersTournamentRound(random = Math.random) {
  const sample = Math.min(0.999999, Math.max(0, Number(random?.()) || 0));
  return LEPERS_TOURNAMENT_ROUNDS[
    Math.floor(sample * LEPERS_TOURNAMENT_ROUNDS.length)
  ];
}

export function isLepersChallengeRound({ enabled, tournamentRound, training } = {}) {
  return (
    !training &&
    enabled === true &&
    LEPERS_TOURNAMENT_ROUNDS.includes(Number(tournamentRound))
  );
}

export function getLepersBonusForNick(challenge, nick) {
  const playerNick = String(nick || "").trim();
  if (!playerNick || !(challenge?.foundBy instanceof Set)) return 0;
  return challenge.foundBy.has(playerNick) ? LEPERS_BONUS_POINTS : 0;
}

export function buildLepersBonusAnnouncement(challenge, nick) {
  const playerNick = String(nick || "").trim();
  const bonus = getLepersBonusForNick(challenge, playerNick);
  if (!bonus) return null;
  return {
    id: `${challenge.id}:${playerNick}:bonus`,
    type: "lepers_bonus_awarded",
    nick: playerNick,
    bonus,
    text: `${playerNick} remporte la carte de Julien Lechéper (+${bonus} points au général) !`,
  };
}
