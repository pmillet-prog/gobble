
import { normalizeWord } from "../../shared/gameLogic.js";

const CACHE_MAX = 500;
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 10 * 60 * 1000;
const MAX_CONCURRENCY = 6;
const DEBUG = process.env.DEBUG_DEFINE === "1";
const USER_AGENT = "Gobble/1.0 (https://gobble.fr; contact: contact@gobble.fr)";
const ALLOW_WIKIPEDIA_DEFINITIONS = false;
const PROPER_NOUN_PATTERNS = [
  /\bnom propre\b/,
  /\bprenom\b/,
  /\bnom de famille\b/,
  /\bpatronyme\b/,
  /\btoponyme\b/,
  /\bgentile\b/,
  /\banthroponyme\b/,
  /\bethnie\b/,
  /\bgroupe ethnique\b/,
  /\bpeuple\b/,
  /\btribu\b/,
  /\bclan\b/,
  /\bdynastie\b/,
  /\bpersonnage\b/,
];
const COMMON_GRAMMAR_PATTERNS = [
  /\bnom commun\b/,
  /\badjectif\b/,
  /\bverbe\b/,
  /\badverbe\b/,
  /\bpronom\b/,
  /\bdeterminant\b/,
  /\bpreposition\b/,
  /\bconjonction\b/,
  /\binterjection\b/,
];

const cache = new Map();
const inflight = new Map();
const fetchQueue = [];
let activeFetches = 0;

function debugLog(message) {
  if (!DEBUG) return;
  console.log(message);
}

function enqueueFetch(task) {
  return new Promise((resolve, reject) => {
    fetchQueue.push({ task, resolve, reject });
    pumpFetchQueue();
  });
}

function pumpFetchQueue() {
  while (activeFetches < MAX_CONCURRENCY && fetchQueue.length > 0) {
    const job = fetchQueue.shift();
    activeFetches += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeFetches -= 1;
        pumpFetchQueue();
      });
  }
}

function normalizeNfc(value) {
  if (typeof value !== "string") return value;
  return value.normalize("NFC");
}

function clipDefinition(rawText, maxLen = 600) {
  const text = String(rawText || "").trim();
  if (!text) return "";
  const sanitized = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!sanitized) return "";
  if (sanitized.length <= maxLen) return normalizeNfc(sanitized);
  let cut = sanitized.slice(0, maxLen);
  const lastSentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? ")
  );
  if (lastSentence > 80) {
    cut = cut.slice(0, lastSentence + 1);
  } else {
    cut = cut.replace(/\s+\S*$/, "");
  }
  return normalizeNfc(`${cut.trimEnd()}...`);
}

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function normalizeForFormOf(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForTextMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeProperNoun(summary, rawWord, source) {
  if (!summary) return false;
  if (source === "wikipedia" && !ALLOW_WIKIPEDIA_DEFINITIONS) return true;
  const combined = [
    summary.title || "",
    summary.description || "",
    summary.extract || "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!combined) return false;
  const text = normalizeForTextMatch(combined);
  if (!text) return false;
  if (COMMON_GRAMMAR_PATTERNS.some((re) => re.test(text))) return false;
  if (PROPER_NOUN_PATTERNS.some((re) => re.test(text))) return true;
  const word = String(rawWord || "").trim();
  if (!word) return false;
  const lowerWord = normalizeForTextMatch(word);
  if (!lowerWord) return false;
  if (text.startsWith(`${lowerWord} est `)) return true;
  if (text.startsWith(`${lowerWord} est une `)) return true;
  if (text.startsWith(`${lowerWord} est un `)) return true;
  if (text.startsWith(`les ${lowerWord} sont `)) return true;
  return false;
}

function hasDiacritics(value) {
  return /[\u0300-\u036f]/.test(String(value || "").normalize("NFD"));
}

function buildDefineCandidates(rawWord) {
  const candidates = [];
  const push = (value) => {
    const v = String(value || "").trim();
    if (!v) return;
    if (!candidates.includes(v)) candidates.push(v);
  };
  const lower = rawWord.toLowerCase();
  const capitalized = rawWord
    ? rawWord[0].toUpperCase() + rawWord.slice(1).toLowerCase()
    : rawWord;
  const deaccent = rawWord
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  push(rawWord);
  push(lower);
  push(capitalized);
  push(deaccent);
  return candidates;
}

function getCacheKey(rawWord) {
  const raw = String(rawWord || "").trim();
  return raw ? raw.toLowerCase() : "";
}

function getCacheEntry(cacheKey) {
  if (!cacheKey) return null;
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  cache.delete(cacheKey);
  cache.set(cacheKey, entry);
  return entry.value;
}

function setCacheEntry(cacheKey, value, ttlMs) {
  if (!cacheKey) return;
  cache.delete(cacheKey);
  cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, value });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

function pickDisplayWord(rawWord, accentCandidates) {
  const raw = String(rawWord || "").trim();
  if (!raw) return null;
  if (!Array.isArray(accentCandidates) || accentCandidates.length === 0) return null;
  const normRaw = normalizeLookup(raw);
  const match = accentCandidates.find(
    (candidate) =>
      candidate &&
      candidate !== raw &&
      normalizeLookup(candidate) === normRaw &&
      hasDiacritics(candidate)
  );
  return match ? normalizeNfc(match) : null;
}

async function fetchJson(url, { timeoutMs = 2500 } = {}) {
  return enqueueFetch(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Accept-Charset": "utf-8",
          "Accept-Language": "fr",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      if (DEBUG && err?.name === "AbortError") {
        debugLog(`[define] timeout ${url}`);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
}

async function fetchOpensearchTitles(baseUrl, term, limit = 5, options) {
  const url = `${baseUrl}/w/api.php?action=opensearch&search=${encodeURIComponent(
    term
  )}&limit=${limit}&namespace=0&format=json`;
  const data = await fetchJson(url, options);
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  return titles
    .filter((t) => typeof t === "string" && t.trim())
    .map((t) => normalizeNfc(t.trim()));
}

async function fetchAccentCandidates(word, options) {
  const raw = String(word || "").trim();
  if (!raw || hasDiacritics(raw)) return [];
  const titles = await fetchOpensearchTitles(
    "https://fr.wiktionary.org",
    raw,
    5,
    options
  );
  if (!titles || titles.length === 0) return [];
  const normWord = normalizeLookup(raw);
  const matches = titles.filter((title) => normalizeLookup(title) === normWord);
  if (!matches.length) return [];
  matches.sort((a, b) => {
    const aAccent = hasDiacritics(a) ? 1 : 0;
    const bAccent = hasDiacritics(b) ? 1 : 0;
    if (aAccent !== bAccent) return bAccent - aAccent;
    const aDiff = Math.abs(a.length - raw.length);
    const bDiff = Math.abs(b.length - raw.length);
    if (aDiff !== bDiff) return aDiff - bDiff;
    return 0;
  });
  return matches;
}
function extractVerbBaseFromFormOf(normalized) {
  const verbMatch = normalized.match(/\bdu verbe ([a-z'-]+)/);
  if (verbMatch) return verbMatch[1];
  const tailMatch = normalized.match(/\bde ([a-z'-]+)$/);
  if (tailMatch) return tailMatch[1];
  return null;
}

function extractBaseFromRawForm(extract) {
  const raw = String(extract || "").trim();
  if (!raw) return null;
  const verbMatch = raw.match(/\bverbe\s+([\p{L}'-]+)/iu);
  if (verbMatch) return normalizeNfc(verbMatch[1]);
  const deMatch = raw.match(/\bde\s+([\p{L}'-]+)[\s.]*$/iu);
  if (deMatch) return normalizeNfc(deMatch[1]);
  return null;
}

function extractParticipleHint(normalized, rawBase) {
  if (!normalized) return null;
  const base = rawBase || extractVerbBaseFromFormOf(normalized);
  if (!base || base.length < 3) return null;
  const match = normalized.match(
    /\bparticipe (passe|present)(?: (masculin|feminin))?(?: (singulier|pluriel))?/
  );
  if (!match) return null;
  const tenseLabel = match[1] === "passe" ? "passé" : "présent";
  const genderLabel = match[2] === "feminin" ? "féminin" : match[2];
  const numberLabel = match[3] || "";
  let label = `Participe ${tenseLabel}`;
  if (genderLabel) label = `${label} ${genderLabel}`;
  if (numberLabel) label = `${label} ${numberLabel}`;
  label = `${label} de :`;
  return { base, label, kind: "participle" };
}

function extractConjugationHint(normalized, rawBase) {
  if (!normalized) return null;
  const personMatch = normalized.match(
    /^(premiere|deuxieme|troisieme) personne du (singulier|pluriel)\b/
  );
  if (!personMatch) return null;
  const base = rawBase || extractVerbBaseFromFormOf(normalized);
  if (!base || base.length < 3) return null;
  let detail = normalized.slice(personMatch[0].length).trim();
  if (detail) {
    const baseToken = normalizeForFormOf(base).split(" ")[0];
    if (baseToken) {
      const suffix = ` de ${baseToken}`;
      if (detail.endsWith(suffix)) {
        detail = detail.slice(0, -suffix.length).trim();
      } else {
        const lastDe = detail.lastIndexOf(" de ");
        if (lastDe >= 0) {
          detail = detail.slice(0, lastDe).trim();
        }
      }
    } else {
      const lastDe = detail.lastIndexOf(" de ");
      if (lastDe >= 0) {
        detail = detail.slice(0, lastDe).trim();
      }
    }
    detail = detail.replace(/\s+/g, " ").trim();
    if (detail === "de" || detail === "du" || detail === "des") {
      detail = "";
    }
  }
  const personLabel = {
    premiere: "Première",
    deuxieme: "Deuxième",
    troisieme: "Troisième",
  }[personMatch[1]];
  let label = `${personLabel || personMatch[1]} personne du ${personMatch[2]}`;
  if (detail) {
    label = `${label} ${detail}`;
  }
  label = `${label} de :`;
  return { base, label, kind: "lemma" };
}

function extractFormOfHint(extract) {
  const normalized = normalizeForFormOf(extract);
  if (!normalized) return null;
  const prefixRe =
    /^(forme|feminin|masculin|pluriel|participe|premiere|deuxieme|troisieme|mauvaise|variante|graphie|orthographe)\b/;
  if (!prefixRe.test(normalized)) return null;
  const rawBase = extractBaseFromRawForm(extract);
  const participleHint = extractParticipleHint(normalized, rawBase);
  if (participleHint) return participleHint;
  const conjugationHint = extractConjugationHint(normalized, rawBase);
  if (conjugationHint) return conjugationHint;
  const patterns = [
    {
      re: /\bmauvaise orthographe de ([a-z'-]+)/,
      label: "",
      kind: "orthography",
    },
    {
      re: /\bvariante orthographique de ([a-z'-]+)/,
      label: "",
      kind: "orthography",
    },
    {
      re: /\bgraphie alternative de ([a-z'-]+)/,
      label: "",
      kind: "orthography",
    },
    {
      re: /\borthographe de ([a-z'-]+)/,
      label: "",
      kind: "orthography",
    },
    {
      re: /\bfeminin pluriel de ([a-z'-]+)/,
      label: "Féminin pluriel probable de :",
      kind: "inflection",
    },
    {
      re: /\bfeminin singulier de ([a-z'-]+)/,
      label: "Féminin singulier probable de :",
      kind: "inflection",
    },
    { re: /\bfeminin de ([a-z'-]+)/, label: "Féminin probable de :", kind: "inflection" },
    {
      re: /\bmasculin pluriel de ([a-z'-]+)/,
      label: "Masculin pluriel probable de :",
      kind: "inflection",
    },
    {
      re: /\bmasculin singulier de ([a-z'-]+)/,
      label: "Masculin singulier probable de :",
      kind: "inflection",
    },
    { re: /\bmasculin de ([a-z'-]+)/, label: "Masculin probable de :", kind: "inflection" },
    { re: /\bpluriel de ([a-z'-]+)/, label: "Pluriel probable de :", kind: "inflection" },
    {
      re: /\bparticipe passe de ([a-z'-]+)/,
      label: "Participe passé probable de :",
      kind: "participle",
    },
    {
      re: /\bparticipe present de ([a-z'-]+)/,
      label: "Participe présent probable de :",
      kind: "participle",
    },
    {
      re: /\bforme conjuguee de ([a-z'-]+)/,
      label: "Forme conjuguée probable de :",
      kind: "lemma",
    },
    {
      re: /\bconjugaison de ([a-z'-]+)/,
      label: "Forme conjuguée probable de :",
      kind: "lemma",
    },
    {
      re: /\bforme du verbe ([a-z'-]+)/,
      label: "Forme conjuguée probable de :",
      kind: "lemma",
    },
    { re: /\bforme de ([a-z'-]+)/, label: "Forme probable de :", kind: "lemma" },
  ];
  const lemmaLabel =
    patterns.find((pattern) => pattern.kind === "lemma")?.label ||
    "Forme conjuguée probable de :";
  for (const pattern of patterns) {
    const match = normalized.match(pattern.re);
    if (!match) continue;
    const base = rawBase || match[1];
    if (!base || base.length < 3) continue;
    return { base, label: pattern.label, kind: pattern.kind };
  }
  const verbBase = extractVerbBaseFromFormOf(normalized);
  if (verbBase && verbBase.length >= 3) {
    return { base: rawBase || verbBase, label: lemmaLabel, kind: "lemma" };
  }
  if (/^(premiere|deuxieme|troisieme) personne/.test(normalized)) {
    const base = extractVerbBaseFromFormOf(normalized);
    if (base && base.length >= 3) {
      return { base: rawBase || base, label: lemmaLabel, kind: "lemma" };
    }
  }
  return null;
}
async function fetchSummary(baseUrl, title, options) {
  const url = `${baseUrl}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const data = await fetchJson(url, options);
  const extract = clipDefinition(data?.extract || "");
  if (!extract) return null;
  const urlOut =
    data?.content_urls?.desktop?.page ||
    data?.content_urls?.mobile?.page ||
    `${baseUrl}/wiki/${encodeURIComponent(title)}`;
  return {
    title: normalizeNfc(data?.title || title),
    extract,
    url: urlOut,
    description: data?.description || "",
    type: data?.type || "",
  };
}

function extractWiktionaryDefinition(wikitext) {
  if (!wikitext) return "";
  const lines = String(wikitext).split(/\r?\n/);
  let inFrench = false;
  for (const line of lines) {
    if (/^==\s*\{\{langue\|fr\}\}\s*==/i.test(line)) {
      inFrench = true;
      continue;
    }
    if (inFrench && /^==[^=]/.test(line)) break;
    if (!inFrench) continue;
    const match = line.match(/^#(?![#*:])\s*(.+)/);
    if (!match) continue;
    let text = match[1];
    text = text.replace(/\{\{[^}]+\}\}/g, "");
    text = text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
    text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
    text = text.replace(/'''+/g, "").replace(/''/g, "");
    text = text.replace(/\s+/g, " ").trim();
    if (text) return clipDefinition(text, 450);
  }
  return "";
}

async function fetchWiktionaryDefinition(title, options) {
  const summary = await fetchSummary("https://fr.wiktionary.org", title, options);
  if (summary && summary.extract) return summary;
  const url = `https://fr.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(
    title
  )}&prop=wikitext&format=json`;
  const data = await fetchJson(url, options);
  const wikitext = data?.parse?.wikitext?.["*"];
  const extract = extractWiktionaryDefinition(wikitext);
  if (!extract) return null;
  return {
    title: normalizeNfc(data?.parse?.title || title),
    extract,
    url: `https://fr.wiktionary.org/wiki/${encodeURIComponent(title)}`,
  };
}

function scoreTitle(title, rawWord) {
  const normTitle = normalizeLookup(title);
  const normWord = normalizeLookup(rawWord);
  if (!normTitle || !normWord) return 0;
  if (normTitle === normWord) return 100;
  if (title.toLowerCase() === rawWord.toLowerCase()) return 90;
  if (normTitle.startsWith(normWord)) {
    const tail = normTitle.slice(normWord.length);
    const hasParen = title.includes("(") && title.includes(")");
    if (hasParen || tail.length <= 3) return 70;
  }
  return 0;
}

function pickBestTitle(titles, rawWord) {
  if (!Array.isArray(titles) || titles.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const title of titles) {
    const score = scoreTitle(title, rawWord);
    if (score > bestScore) {
      bestScore = score;
      best = title;
    }
  }
  return bestScore >= 70 ? best : null;
}

function pickStrictTitle(titles, rawWord) {
  if (!Array.isArray(titles) || titles.length === 0) return null;
  const normWord = normalizeLookup(rawWord);
  if (!normWord) return null;
  for (const title of titles) {
    if (normalizeLookup(title) === normWord) return title;
  }
  return null;
}

function collectSuggestions(titles, rawWord, baseUrl, source, suggestions) {
  if (!Array.isArray(titles)) return;
  for (const title of titles) {
    if (scoreTitle(title, rawWord) < 70) continue;
    const key = `${source}|${title}`;
    if (suggestions.some((s) => `${s.source}|${s.title}` === key)) continue;
    suggestions.push({
      title,
      url: `${baseUrl}/wiki/${encodeURIComponent(title)}`,
      source,
    });
  }
}

async function lookupDefinitionForWord(term, options = {}) {
  const strict = Boolean(options.strict);
  const direct = await fetchWiktionaryDefinition(term, options);
  if (direct) {
    return { ...direct, source: "wiktionary" };
  }
  const titles = await fetchOpensearchTitles(
    "https://fr.wiktionary.org",
    term,
    5,
    options
  );
  const picked = titles
    ? strict
      ? pickStrictTitle(titles, term)
      : pickBestTitle(titles, term)
    : null;
  if (picked) {
    const summary = await fetchWiktionaryDefinition(picked, options);
    if (summary) {
      return { ...summary, source: "wiktionary" };
    }
  }
  const wikiDirect = await fetchSummary("https://fr.wikipedia.org", term, options);
  if (wikiDirect) {
    return { ...wikiDirect, source: "wikipedia" };
  }
  const wikiTitles = await fetchOpensearchTitles(
    "https://fr.wikipedia.org",
    term,
    5,
    options
  );
  const wikiPicked = wikiTitles
    ? strict
      ? pickStrictTitle(wikiTitles, term)
      : pickBestTitle(wikiTitles, term)
    : null;
  if (wikiPicked) {
    const summary = await fetchSummary("https://fr.wikipedia.org", wikiPicked, options);
    if (summary) {
      return { ...summary, source: "wikipedia" };
    }
  }
  return null;
}
function extractDictionaryApiDefinition(payload) {
  if (!Array.isArray(payload)) return null;
  for (const entry of payload) {
    const meanings = Array.isArray(entry?.meanings) ? entry.meanings : [];
    for (const meaning of meanings) {
      const pos = String(meaning?.partOfSpeech || "").toLowerCase();
      if (pos.includes("proper") || pos.includes("nom propre")) {
        continue;
      }
      const defs = Array.isArray(meaning?.definitions) ? meaning.definitions : [];
      for (const def of defs) {
        const text = String(def?.definition || "").trim();
        if (text) {
          const clipped = clipDefinition(text);
          if (clipped && PROPER_NOUN_PATTERNS.some((re) => re.test(normalizeForTextMatch(clipped)))) {
            continue;
          }
          return clipped;
        }
      }
    }
  }
  return null;
}

async function fetchDictionaryApi(word, options) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/fr/${encodeURIComponent(
    word
  )}`;
  const data = await fetchJson(url, options);
  const definition = extractDictionaryApiDefinition(data);
  if (!definition) return null;
  return definition;
}

function guessLemmasFR(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized || normalized.length < 6) return [];
  const candidates = new Set();
  const add = (value) => {
    if (!value || value.length < 6) return;
    if (value === normalized) return;
    if (candidates.size >= 12) return;
    candidates.add(value);
  };
  const fixSpelling = (value) => {
    if (value.endsWith("geer")) return value.slice(0, -4) + "ger";
    if (value.endsWith("ceer")) return value.slice(0, -4) + "cer";
    return value;
  };
  const addWithEndings = (stem, endings) => {
    for (const end of endings) {
      const next = fixSpelling(`${stem}${end}`);
      add(next);
      if (candidates.size >= 12) return;
    }
  };
  const rules = [
    {
      suffixes: [
        "erions",
        "eriez",
        "erais",
        "erait",
        "erons",
        "eront",
        "erez",
        "erai",
        "era",
      ],
      endings: ["er"],
    },
    {
      suffixes: [
        "irions",
        "iriez",
        "irais",
        "irait",
        "irons",
        "iront",
        "irez",
        "irai",
        "ira",
      ],
      endings: ["ir"],
    },
    {
      suffixes: [
        "issent",
        "isses",
        "isse",
        "issions",
        "issiez",
        "issais",
        "issait",
        "issaient",
      ],
      endings: ["ir"],
    },
    { suffixes: ["assent", "assiez", "asses", "asse", "at", "ates", "ions", "iez"], endings: ["er"] },
    { suffixes: ["ites"], endings: ["ir"] },
    { suffixes: ["aient", "ait"], endings: ["er", "ir", "re"] },
  ];
  for (const rule of rules) {
    for (const suffix of rule.suffixes) {
      if (!normalized.endsWith(suffix)) continue;
      const stem = normalized.slice(0, -suffix.length);
      if (!stem) continue;
      addWithEndings(stem, rule.endings);
      if (candidates.size >= 12) break;
    }
    if (candidates.size >= 12) break;
  }
  const participleRules = ["ees", "es", "e", "ent"];
  for (const suffix of participleRules) {
    if (normalized.endsWith(suffix)) {
      const stem = normalized.slice(0, -suffix.length);
      if (stem) addWithEndings(stem, ["er"]);
    }
    if (candidates.size >= 12) break;
  }
  return Array.from(candidates);
}

function looksLikeVerbForm(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized) return false;
  const suffixes = [
    "erais",
    "erait",
    "erions",
    "eriez",
    "erons",
    "eront",
    "erez",
    "erai",
    "era",
    "assent",
    "assiez",
    "asses",
    "asse",
    "ates",
    "at",
    "irais",
    "irait",
    "irions",
    "iriez",
    "irons",
    "iront",
    "irez",
    "irai",
    "ira",
    "issent",
    "isses",
    "isse",
    "issions",
    "issiez",
    "issais",
    "issait",
    "issaient",
    "issant",
  ];
  return suffixes.some((suffix) => normalized.endsWith(suffix));
}

function guessInflectionsFR(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized || normalized.length < 4) return [];
  if (looksLikeVerbForm(rawWord)) return [];
  const candidates = [];
  const seen = new Set();
  const add = (base, label) => {
    if (!base || base.length < 4) return;
    if (base === normalized) return;
    const key = `${label}|${base}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ base, label });
  };

  if (normalized.endsWith("ies") && normalized.length > 4) {
    add(normalized.slice(0, -3) + "ie", "Pluriel probable de :");
  }
  if (normalized.endsWith("eaux") && normalized.length > 5) {
    add(normalized.slice(0, -4) + "eau", "Pluriel probable de :");
  }
  if (normalized.endsWith("aux") && normalized.length > 4) {
    add(normalized.slice(0, -3) + "al", "Pluriel probable de :");
  }
  if (normalized.endsWith("s") && normalized.length > 3) {
    add(normalized.slice(0, -1), "Pluriel probable de :");
  }
  if (normalized.endsWith("x") && normalized.length > 3) {
    add(normalized.slice(0, -1), "Pluriel probable de :");
  }

  if (normalized.endsWith("es") && normalized.length > 3) {
    add(normalized.slice(0, -2), "Féminin pluriel probable de :");
  }
  if (normalized.endsWith("e") && normalized.length > 3) {
    add(normalized.slice(0, -1), "Féminin probable de :");
  }

  return candidates.slice(0, 12);
}

function guessParticiplesFR(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized || normalized.length < 4) return [];
  const candidates = [];
  const seen = new Set();
  const add = (base, label) => {
    if (!base || base.length < 4) return;
    if (base === normalized) return;
    const key = `${label}|${base}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ base, label });
  };
  const fixSpelling = (value) => {
    if (value.endsWith("geer")) return value.slice(0, -4) + "ger";
    if (value.endsWith("ceer")) return value.slice(0, -4) + "cer";
    return value;
  };
  const addWithEndings = (stem, endings, label) => {
    for (const end of endings) {
      add(fixSpelling(`${stem}${end}`), label);
      if (candidates.length >= 12) return;
    }
  };

  if (normalized.endsWith("ant") && normalized.length > 4) {
    const stem = normalized.slice(0, -3);
    addWithEndings(stem, ["er", "ir", "re"], "Participe présent probable de :");
  }

  const pastEr = ["ees", "ee", "es", "e"];
  const pastIr = ["ies", "ie", "is", "it", "its", "i"];
  const pastRe = ["ues", "ue", "us", "u"];
  for (const suffix of pastEr) {
    if (!normalized.endsWith(suffix) || normalized.length <= suffix.length + 2) continue;
    const stem = normalized.slice(0, -suffix.length);
    addWithEndings(stem, ["er"], "Participe passé probable de :");
  }
  for (const suffix of pastIr) {
    if (!normalized.endsWith(suffix) || normalized.length <= suffix.length + 2) continue;
    const stem = normalized.slice(0, -suffix.length);
    addWithEndings(stem, ["ir"], "Participe passé probable de :");
  }
  for (const suffix of pastRe) {
    if (!normalized.endsWith(suffix) || normalized.length <= suffix.length + 2) continue;
    const stem = normalized.slice(0, -suffix.length);
    addWithEndings(stem, ["re"], "Participe passé probable de :");
  }

  return candidates.slice(0, 12);
}
function isChemicalAdjective(word) {
  const normalized = normalizeLookup(word);
  return normalized.endsWith("oique") || normalized.endsWith("ique");
}

function buildAcidPhrases(word, inflections) {
  const phrases = [];
  const seen = new Set();
  const add = (base) => {
    const clean = String(base || "").trim();
    if (!clean) return;
    const phrase = `acide ${clean}`;
    const key = phrase.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    phrases.push({ phrase, base: clean });
  };
  add(word);
  const pluralBase = Array.isArray(inflections)
    ? inflections.find((inf) => String(inf.label || "").startsWith("Pluriel"))
        ?.base
    : null;
  if (pluralBase) add(pluralBase);
  return phrases.slice(0, 3);
}

function buildPayload(word, summary, source) {
  if (!summary) return null;
  if (looksLikeProperNoun(summary, word, source)) return null;
  const definition = clipDefinition(summary.extract || "");
  if (!definition) return null;
  return {
    ok: true,
    word,
    title: normalizeNfc(summary.title || word),
    definition,
    extract: definition,
    source,
    url: summary.url || "",
  };
}

export function peekDefinitionCache(word) {
  return getCacheEntry(getCacheKey(word));
}

export function clearDefinitionCache(word) {
  const key = getCacheKey(word);
  if (!key) return;
  cache.delete(key);
}

export async function getDefinition(rawWord, { timeoutMs = 2500, skipCache = false } = {}) {
  const input = String(rawWord || "").trim();
  if (!input) return { ok: false, word: "", error: "missing_word" };
  const normalized = normalizeWord(input);
  if (!normalized) return { ok: false, word: input, error: "bad_word" };

  const cacheKey = getCacheKey(input);
  if (!skipCache) {
    const cached = getCacheEntry(cacheKey);
    if (cached) {
      const hasInflection = cached.inflectionBase || cached.participleBase || cached.lemma;
      const looksFormOf =
        typeof cached.extract === "string" && !!extractFormOfHint(cached.extract);
      const needsFormLabel = looksFormOf && cached.lemma && !cached.lemmaLabel;
      if (!(looksFormOf && !hasInflection) && !needsFormLabel) {
        return cached;
      }
    }
  }

  const inFlight = inflight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    let payload = null;
    let formOfHint = null;
    let formOfSummary = null;
    let displayWord = null;
    const suggestions = [];
    const options = { timeoutMs };

    try {
      const baseCandidates = buildDefineCandidates(input);
      const accentCandidates = await fetchAccentCandidates(input, options);
      displayWord = pickDisplayWord(input, accentCandidates);
      const candidates = accentCandidates.length
        ? [
            ...accentCandidates,
            ...baseCandidates.filter((candidate) => !accentCandidates.includes(candidate)),
          ]
        : baseCandidates;

      for (const candidate of candidates) {
        const summary = await fetchWiktionaryDefinition(candidate, options);
        if (!summary) continue;
        const hint = extractFormOfHint(summary.extract);
        if (hint) {
          if (!formOfHint) {
            formOfHint = hint;
            formOfSummary = { ...summary, source: "wiktionary" };
          }
          continue;
        }
        payload = buildPayload(input, summary, "wiktionary");
        if (payload) break;
      }

      if (!payload) {
        for (const candidate of candidates) {
          const summary = await fetchSummary("https://fr.wikipedia.org", candidate, options);
          if (!summary) continue;
          const hint = extractFormOfHint(summary.extract);
          if (hint) {
            if (!formOfHint) {
              formOfHint = hint;
              formOfSummary = { ...summary, source: "wikipedia" };
            }
            continue;
          }
          payload = buildPayload(input, summary, "wikipedia");
          if (payload) break;
        }
      }

      if (!payload && formOfHint && formOfHint.base) {
        const baseDefinition = await lookupDefinitionForWord(formOfHint.base, {
          strict: true,
          ...options,
        });
        if (baseDefinition) {
          payload = buildPayload(input, baseDefinition, baseDefinition.source);
          if (payload) {
            if (formOfHint.kind === "inflection") {
              payload.inflectionBase = formOfHint.base;
              payload.inflectionLabel = formOfHint.label;
              payload.inflectionGuess = true;
            } else if (formOfHint.kind === "participle") {
              payload.participleBase = formOfHint.base;
              payload.participleLabel = formOfHint.label;
              payload.participleGuess = true;
            } else if (formOfHint.kind === "orthography") {
              // On affiche la definition de la forme correcte sans label.
            } else {
              payload.lemma = formOfHint.base;
              payload.lemmaLabel = formOfHint.label;
              payload.lemmaGuess = true;
            }
          }
        }
      }

      if (!payload) {
        const lemmaCandidates = guessLemmasFR(input);
        for (const lemma of lemmaCandidates) {
          const direct = await fetchWiktionaryDefinition(lemma, options);
          if (direct) {
            payload = buildPayload(input, direct, "wiktionary");
            if (payload) {
              payload.lemma = lemma;
              payload.lemmaGuess = true;
              debugLog(`define lemma guess: ${input} -> ${lemma}`);
              break;
            }
          }
          const titles = await fetchOpensearchTitles(
            "https://fr.wiktionary.org",
            lemma,
            5,
            options
          );
          const picked = titles ? pickStrictTitle(titles, lemma) : null;
          if (picked) {
            const summary = await fetchWiktionaryDefinition(picked, options);
            if (summary) {
              payload = buildPayload(input, summary, "wiktionary");
              if (payload) {
                payload.lemma = lemma;
                payload.lemmaGuess = true;
                debugLog(`define lemma guess: ${input} -> ${lemma}`);
                break;
              }
            }
          }
          const wikiDirect = await fetchSummary("https://fr.wikipedia.org", lemma, options);
          if (wikiDirect) {
            payload = buildPayload(input, wikiDirect, "wikipedia");
            if (payload) {
              payload.lemma = lemma;
              payload.lemmaGuess = true;
              debugLog(`define lemma guess: ${input} -> ${lemma}`);
              break;
            }
          }
          const wikiTitles = await fetchOpensearchTitles(
            "https://fr.wikipedia.org",
            lemma,
            5,
            options
          );
          const wikiPicked = wikiTitles ? pickStrictTitle(wikiTitles, lemma) : null;
          if (wikiPicked) {
            const summary = await fetchSummary(
              "https://fr.wikipedia.org",
              wikiPicked,
              options
            );
            if (summary) {
              payload = buildPayload(input, summary, "wikipedia");
              if (payload) {
                payload.lemma = lemma;
                payload.lemmaGuess = true;
                debugLog(`define lemma guess: ${input} -> ${lemma}`);
                break;
              }
            }
          }
        }
      }

      if (!payload) {
        const inflections = guessInflectionsFR(input);
        for (const inflection of inflections) {
          const direct = await fetchWiktionaryDefinition(inflection.base, options);
          if (direct) {
            payload = buildPayload(input, direct, "wiktionary");
            if (payload) {
              payload.inflectionBase = inflection.base;
              payload.inflectionLabel = inflection.label;
              payload.inflectionGuess = true;
              debugLog(`define inflection guess: ${input} -> ${inflection.base}`);
              break;
            }
          }
          const titles = await fetchOpensearchTitles(
            "https://fr.wiktionary.org",
            inflection.base,
            5,
            options
          );
          const picked = titles ? pickStrictTitle(titles, inflection.base) : null;
          if (picked) {
            const summary = await fetchWiktionaryDefinition(picked, options);
            if (summary) {
              payload = buildPayload(input, summary, "wiktionary");
              if (payload) {
                payload.inflectionBase = inflection.base;
                payload.inflectionLabel = inflection.label;
                payload.inflectionGuess = true;
                debugLog(`define inflection guess: ${input} -> ${inflection.base}`);
                break;
              }
            }
          }
          const wikiDirect = await fetchSummary(
            "https://fr.wikipedia.org",
            inflection.base,
            options
          );
          if (wikiDirect) {
            payload = buildPayload(input, wikiDirect, "wikipedia");
            if (payload) {
              payload.inflectionBase = inflection.base;
              payload.inflectionLabel = inflection.label;
              payload.inflectionGuess = true;
              debugLog(`define inflection guess: ${input} -> ${inflection.base}`);
              break;
            }
          }
          const wikiTitles = await fetchOpensearchTitles(
            "https://fr.wikipedia.org",
            inflection.base,
            5,
            options
          );
          const wikiPicked = wikiTitles ? pickStrictTitle(wikiTitles, inflection.base) : null;
          if (wikiPicked) {
            const summary = await fetchSummary(
              "https://fr.wikipedia.org",
              wikiPicked,
              options
            );
            if (summary) {
              payload = buildPayload(input, summary, "wikipedia");
              if (payload) {
                payload.inflectionBase = inflection.base;
                payload.inflectionLabel = inflection.label;
                payload.inflectionGuess = true;
                debugLog(`define inflection guess: ${input} -> ${inflection.base}`);
                break;
              }
            }
          }
        }
      }

      if (!payload) {
        const participles = guessParticiplesFR(input);
        for (const participle of participles) {
          const direct = await fetchWiktionaryDefinition(participle.base, options);
          if (direct) {
            payload = buildPayload(input, direct, "wiktionary");
            if (payload) {
              payload.participleBase = participle.base;
              payload.participleLabel = participle.label;
              payload.participleGuess = true;
              debugLog(`define participle guess: ${input} -> ${participle.base}`);
              break;
            }
          }
          const titles = await fetchOpensearchTitles(
            "https://fr.wiktionary.org",
            participle.base,
            5,
            options
          );
          const picked = titles ? pickStrictTitle(titles, participle.base) : null;
          if (picked) {
            const summary = await fetchWiktionaryDefinition(picked, options);
            if (summary) {
              payload = buildPayload(input, summary, "wiktionary");
              if (payload) {
                payload.participleBase = participle.base;
                payload.participleLabel = participle.label;
                payload.participleGuess = true;
                debugLog(`define participle guess: ${input} -> ${participle.base}`);
                break;
              }
            }
          }
          const wikiDirect = await fetchSummary(
            "https://fr.wikipedia.org",
            participle.base,
            options
          );
          if (wikiDirect) {
            payload = buildPayload(input, wikiDirect, "wikipedia");
            if (payload) {
              payload.participleBase = participle.base;
              payload.participleLabel = participle.label;
              payload.participleGuess = true;
              debugLog(`define participle guess: ${input} -> ${participle.base}`);
              break;
            }
          }
          const wikiTitles = await fetchOpensearchTitles(
            "https://fr.wikipedia.org",
            participle.base,
            5,
            options
          );
          const wikiPicked = wikiTitles ? pickStrictTitle(wikiTitles, participle.base) : null;
          if (wikiPicked) {
            const summary = await fetchSummary(
              "https://fr.wikipedia.org",
              wikiPicked,
              options
            );
            if (summary) {
              payload = buildPayload(input, summary, "wikipedia");
              if (payload) {
                payload.participleBase = participle.base;
                payload.participleLabel = participle.label;
                payload.participleGuess = true;
                debugLog(`define participle guess: ${input} -> ${participle.base}`);
                break;
              }
            }
          }
        }
      }

      if (!payload && formOfSummary) {
        payload = buildPayload(input, formOfSummary, formOfSummary.source);
        if (payload) {
          if (formOfHint?.kind === "inflection") {
            payload.inflectionBase = formOfHint.base;
            payload.inflectionLabel = formOfHint.label;
            payload.inflectionGuess = true;
          } else if (formOfHint?.kind === "participle") {
            payload.participleBase = formOfHint.base;
            payload.participleLabel = formOfHint.label;
            payload.participleGuess = true;
          } else if (formOfHint?.base) {
            payload.lemma = formOfHint.base;
            payload.lemmaGuess = true;
          }
        }
      }
      if (!payload) {
        for (const candidate of candidates) {
          const titles = await fetchOpensearchTitles(
            "https://fr.wiktionary.org",
            candidate,
            5,
            options
          );
          if (!titles || titles.length === 0) continue;
          collectSuggestions(
            titles,
            candidate,
            "https://fr.wiktionary.org",
            "wiktionary",
            suggestions
          );
          const picked = pickBestTitle(titles, candidate);
          if (!picked) continue;
          const summary = await fetchWiktionaryDefinition(picked, options);
          if (!summary) continue;
          payload = buildPayload(input, summary, "wiktionary");
          if (payload) break;
        }
      }

      if (!payload) {
        for (const candidate of candidates) {
          const titles = await fetchOpensearchTitles(
            "https://fr.wikipedia.org",
            candidate,
            5,
            options
          );
          if (!titles || titles.length === 0) continue;
          collectSuggestions(
            titles,
            candidate,
            "https://fr.wikipedia.org",
            "wikipedia",
            suggestions
          );
          const picked = pickBestTitle(titles, candidate);
          if (!picked) continue;
          const summary = await fetchSummary("https://fr.wikipedia.org", picked, options);
          if (!summary) continue;
          payload = buildPayload(input, summary, "wikipedia");
          if (payload) break;
        }
      }

      if (!payload && isChemicalAdjective(input)) {
        const inflections = guessInflectionsFR(input);
        const phrases = buildAcidPhrases(input, inflections);
        for (const entry of phrases) {
          const direct = await fetchSummary(
            "https://fr.wikipedia.org",
            entry.phrase,
            options
          );
          if (direct) {
            payload = buildPayload(input, direct, "wikipedia");
            if (payload) {
              payload.matchedTitle = direct.title || entry.phrase;
              payload.phraseGuess = true;
              break;
            }
          }
          const titles = await fetchOpensearchTitles(
            "https://fr.wikipedia.org",
            entry.phrase,
            5,
            options
          );
          if (!titles || titles.length === 0) continue;
          const targetNorm = normalizeLookup(entry.phrase);
          const strict = titles.find((t) => normalizeLookup(t) === targetNorm);
          if (!strict) continue;
          const summary = await fetchSummary("https://fr.wikipedia.org", strict, options);
          if (!summary) continue;
          payload = buildPayload(input, summary, "wikipedia");
          if (payload) {
            payload.matchedTitle = summary.title || strict;
            payload.phraseGuess = true;
            break;
          }
        }
      }

      if (!payload) {
        const fallbackDefinition = await fetchDictionaryApi(
          candidates[candidates.length - 1] || input.toLowerCase(),
          options
        );
        if (fallbackDefinition) {
          const fallbackIsProper = PROPER_NOUN_PATTERNS.some((re) =>
            re.test(normalizeForTextMatch(fallbackDefinition))
          );
          if (fallbackIsProper) {
            payload = null;
          } else {
          payload = {
            ok: true,
            word: input,
            title: input,
            definition: fallbackDefinition,
            extract: fallbackDefinition,
            source: "dictionaryapi.dev",
          };
          }
        }
      }

      if (
        payload &&
        payload.ok &&
        typeof payload.extract === "string" &&
        !payload.inflectionBase &&
        !payload.participleBase &&
        !payload.lemma
      ) {
        const hint = extractFormOfHint(payload.extract);
        if (hint && hint.base) {
          const baseDefinition = await lookupDefinitionForWord(hint.base, {
            strict: true,
            ...options,
          });
          const baseHint =
            baseDefinition && typeof baseDefinition.extract === "string"
              ? extractFormOfHint(baseDefinition.extract)
              : null;
          if (baseDefinition && !baseHint) {
            payload = buildPayload(input, baseDefinition, baseDefinition.source) || payload;
          }
          if (hint.kind === "inflection") {
            payload.inflectionBase = hint.base;
            payload.inflectionLabel = hint.label;
            payload.inflectionGuess = true;
          } else if (hint.kind === "participle") {
            payload.participleBase = hint.base;
            payload.participleLabel = hint.label;
            payload.participleGuess = true;
          } else if (hint.kind === "orthography") {
            // On affiche la definition de la forme correcte sans label.
          } else {
            payload.lemma = hint.base;
            payload.lemmaLabel = hint.label;
            payload.lemmaGuess = true;
          }
        }
      }
    } catch (err) {
      debugLog(`[define] error ${input}: ${err?.message || err}`);
      payload = null;
    }

    if (!payload) {
      payload = {
        ok: false,
        word: input,
        error: "not_found",
        suggestions: suggestions.length ? suggestions.slice(0, 8) : undefined,
      };
    }

    const surfaceWord =
      displayWord ||
      (formOfSummary?.title && formOfSummary.title !== input ? formOfSummary.title : null);
    if (payload && surfaceWord) {
      payload.displayWord = normalizeNfc(surfaceWord);
    }

    if (!skipCache) {
      const ttl = payload?.ok ? OK_TTL_MS : NOT_FOUND_TTL_MS;
      setCacheEntry(cacheKey, payload, ttl);
    }

    return payload;
  })();

  inflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(cacheKey);
  }
}
