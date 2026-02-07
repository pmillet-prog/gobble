import https from "https";

const WIKI_USER_AGENT = "Gobble/1.0 (https://gobble.fr; contact: contact@gobble.fr)";
const CACHE_MAX = 500;
const CACHE_TTL_OK_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_NOT_FOUND_MS = 2 * 60 * 60 * 1000;
const MAX_FETCH_ATTEMPTS = 12;
const GLOBAL_CONCURRENCY = 6;

const cache = new Map();
const inflight = new Map();
let activeCount = 0;
const queue = [];

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return match || null;
}

const hasNativeFetch = typeof fetch === "function";

function fetchPolyfill(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const requestUrl = new URL(url);
      const headers = options.headers || {};
      const req = https.request(
        {
          method: options.method || "GET",
          hostname: requestUrl.hostname,
          path: requestUrl.pathname + requestUrl.search,
          port: requestUrl.port || (requestUrl.protocol === "https:" ? 443 : 80),
          protocol: requestUrl.protocol,
          headers,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            const bodyText = buffer.toString("utf8");
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              json: async () => JSON.parse(bodyText || "null"),
              text: async () => bodyText,
            });
          });
        }
      );
      req.on("error", reject);
      if (options.signal) {
        const onAbort = () => {
          req.destroy(new Error("AbortError"));
        };
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
        req.on("close", () => options.signal.removeEventListener("abort", onAbort));
      }
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

const fetchImpl = hasNativeFetch ? fetch.bind(globalThis) : fetchPolyfill;

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": WIKI_USER_AGENT,
        Accept: "application/json",
      },
    },
    timeoutMs
  );
  if (!res?.ok) return null;
  return res.json();
}

async function fetchSummary(baseUrl, title, timeoutMs, attempts) {
  if (attempts.value >= MAX_FETCH_ATTEMPTS) return null;
  attempts.value++;
  const url = `${baseUrl}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetchJson(url, timeoutMs);
  if (!res || !res.extract) return null;
  return {
    title: res.title || title,
    extract: res.extract,
    source: baseUrl.includes("wiktionary") ? "wiktionary" : "wikipedia",
    url: `${baseUrl}/wiki/${encodeURIComponent(res.title || title)}`,
  };
}

async function fetchWiktionaryDefinition(title, timeoutMs, attempts) {
  return fetchSummary("https://fr.wiktionary.org", title, timeoutMs, attempts);
}

async function fetchOpensearchTitles(baseUrl, search, limit, timeoutMs, attempts) {
  if (attempts.value >= MAX_FETCH_ATTEMPTS) return null;
  attempts.value++;
  const url = `${baseUrl}/w/api.php?action=opensearch&limit=${limit}&namespace=0&format=json&search=${encodeURIComponent(
    search
  )}`;
  const data = await fetchJson(url, timeoutMs);
  if (!Array.isArray(data) || data.length < 2) return [];
  const titles = Array.isArray(data[1]) ? data[1] : [];
  return titles.filter(Boolean);
}

function pickStrictTitle(titles, rawWord) {
  const normWord = normalizeLookup(rawWord);
  if (!normWord) return null;
  for (const title of titles || []) {
    if (normalizeLookup(title) === normWord) return title;
  }
  return null;
}

function pickBestTitle(titles, rawWord) {
  const normWord = normalizeLookup(rawWord);
  if (!normWord) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const title of titles || []) {
    const normTitle = normalizeLookup(title);
    if (!normTitle) continue;
    let score = 0;
    if (normTitle === normWord) score += 100;
    if (title === rawWord) score += 25;
    if (normalizeLookup(title.replace(/\s*\(.+\)\s*$/, "")) === normWord) score += 10;
    if (normTitle.startsWith(normWord)) score += 2;
    if (normTitle.endsWith(normWord)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = title;
    }
  }
  return best;
}

async function fetchAccentCandidates(word, timeoutMs, attempts) {
  const raw = String(word || "").trim();
  if (!raw || hasDiacritics(raw)) return [];
  const titles = await fetchOpensearchTitles(
    "https://fr.wiktionary.org",
    raw,
    5,
    timeoutMs,
    attempts
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

function guessLemmasFR(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized || normalized.length < 6) return [];
  const candidates = new Set();
  const suffixes = [
    ["mes", "me"],
    ["res", "re"],
    ["ses", "s"],
    ["ees", "ee"],
    ["es", ""],
    ["s", ""],
  ];
  for (const [suffix, repl] of suffixes) {
    if (normalized.endsWith(suffix)) {
      candidates.add(normalized.slice(0, -suffix.length) + repl);
    }
  }
  return Array.from(candidates);
}

function looksLikeVerbForm(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized) return false;
  const suffixes = [
    "ais",
    "ait",
    "ant",
    "asses",
    "assent",
    "ates",
    "era",
    "erai",
    "erais",
    "erait",
    "eras",
    "erez",
    "eriez",
    "erions",
    "erons",
    "eront",
    "iez",
    "ions",
    "ons",
    "rent",
    "rait",
    "ras",
    "rez",
    "rons",
    "ront",
  ];
  return suffixes.some((s) => normalized.endsWith(s));
}

function guessInflectionsFR(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized || normalized.length < 4) return [];
  if (!looksLikeVerbForm(rawWord)) return [];
  const candidates = [];
  const suffixes = [
    ["ais", "er", "1re pers. imparfait"],
    ["ait", "er", "3e pers. imparfait"],
    ["ant", "er", "participe présent"],
    ["ees", "er", "participe passé f.pl"],
    ["ee", "er", "participe passé f.sg"],
    ["es", "er", "2e pers. impératif"],
    ["erai", "er", "futur 1re pers."],
    ["erais", "er", "cond. 1re pers."],
    ["erait", "er", "cond. 3e pers."],
    ["eras", "er", "futur 2e pers."],
    ["erez", "er", "futur 2e pers."],
    ["erons", "er", "futur 1re pers. pl"],
    ["eront", "er", "futur 3e pers. pl"],
    ["rait", "er", "cond. 3e pers."],
    ["ras", "er", "futur 2e pers."],
    ["rez", "er", "futur 2e pers."],
    ["rons", "er", "futur 1re pers. pl"],
    ["ront", "er", "futur 3e pers. pl"],
    ["iez", "er", "subjonctif/impératif"],
    ["ions", "er", "subjonctif"],
    ["ons", "er", "présent nous"],
    ["rent", "er", "subjonctif 3e pl"],
  ];
  for (const [suffix, repl, label] of suffixes) {
    if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 3) {
      const stem = normalized.slice(0, -suffix.length);
      const add = repl === "er" && stem.endsWith("e") ? "r" : repl;
      candidates.push({
        base: stem + add,
        label,
      });
    }
  }
  return candidates;
}

function guessParticiplesFR(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized || normalized.length < 4) return [];
  const candidates = [];
  const suffixes = [
    ["ant", "er", "participe present"],
    ["e", "er", "participe passe"],
    ["ee", "er", "participe passe f."],
    ["ees", "er", "participe passe f.pl"],
    ["i", "ir", "participe passe"],
    ["ie", "ir", "participe passe f."],
    ["ies", "ir", "participe passe f.pl"],
  ];
  for (const [suffix, repl, label] of suffixes) {
    if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 3) {
      const stem = normalized.slice(0, -suffix.length);
      const add = repl === "er" && stem.endsWith("e") ? "r" : repl;
      candidates.push({
        base: stem + add,
        label,
      });
    }
  }
  return candidates;
}

function guessVerbBaseSimple(rawWord) {
  const normalized = normalizeLookup(rawWord);
  if (!normalized || normalized.length < 4) return [];
  const suffixes = [
    ["ais", "er"],
    ["ait", "er"],
    ["ant", "er"],
    ["ees", "er"],
    ["ee", "er"],
    ["es", "er"],
    ["erai", "er"],
    ["erais", "er"],
    ["erait", "er"],
    ["eras", "er"],
    ["erez", "er"],
    ["erions", "er"],
    ["erons", "er"],
    ["eront", "er"],
    ["iez", "er"],
    ["ions", "er"],
    ["ons", "er"],
    ["rent", "er"],
    ["rait", "er"],
    ["ras", "er"],
    ["rez", "er"],
    ["rons", "er"],
    ["ront", "er"],
  ];
  const bases = new Set();
  for (const [suffix, repl] of suffixes) {
    if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 3) {
      const stem = normalized.slice(0, -suffix.length);
      const add = repl === "er" && stem.endsWith("e") ? "r" : repl;
      bases.add(stem + add);
    }
  }
  return Array.from(bases);
}

async function fetchDictionaryApi(word, timeoutMs, attempts) {
  if (attempts.value >= MAX_FETCH_ATTEMPTS) return null;
  attempts.value++;
  const url = `https://api.dictionaryapi.dev/api/v2/entries/fr/${encodeURIComponent(word)}`;
  const res = await fetchJson(url, timeoutMs);
  if (!Array.isArray(res) || !res.length) return null;
  const meanings = Array.isArray(res[0]?.meanings) ? res[0].meanings : [];
  const definitions = meanings.flatMap((m) => m?.definitions || []);
  if (!definitions.length) return null;
  const text = definitions.map((d) => d?.definition).filter(Boolean).join(" ");
  return text || null;
}

function setCache(key, value, ttlMs) {
  cache.delete(key);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

async function resolveDefinition(word, timeoutMs) {
  const attempts = { value: 0 };
  const baseCandidates = buildDefineCandidates(word);
  const accentCandidates = await fetchAccentCandidates(word, timeoutMs, attempts);
  const displayWord = pickDisplayWord(word, accentCandidates);
  const verbBases = guessVerbBaseSimple(word);
  const candidates = accentCandidates.length
    ? [...accentCandidates, ...baseCandidates.filter((c) => !accentCandidates.includes(c))]
    : baseCandidates;

  let payload = null;
  const suggestions = [];

  // Try verb bases early
  if (!payload && verbBases.length) {
    for (const base of verbBases) {
      const summary = await fetchWiktionaryDefinition(base, timeoutMs, attempts);
      const wikiSummary =
        summary?.extract
          ? summary
          : await fetchSummary("https://fr.wikipedia.org", base, timeoutMs, attempts);
      if (wikiSummary?.extract) {
        payload = {
          ok: true,
          word,
          lemma: base,
          lemmaGuess: true,
          title: wikiSummary.title || base,
          definition: wikiSummary.extract,
          extract: wikiSummary.extract,
          source: wikiSummary.source || "wikipedia",
          url: wikiSummary.url,
        };
        break;
      }
      if (attempts.value >= MAX_FETCH_ATTEMPTS) break;
    }
  }

  for (const candidate of candidates) {
    const summary = await fetchWiktionaryDefinition(candidate, timeoutMs, attempts);
    if (summary?.extract) {
      payload = {
        ok: true,
        word,
        title: summary.title || candidate,
        definition: summary.extract,
        extract: summary.extract,
        source: "wiktionary",
        url: summary.url,
      };
      break;
    }
    if (attempts.value >= MAX_FETCH_ATTEMPTS) break;
  }

  if (!payload && attempts.value < MAX_FETCH_ATTEMPTS) {
    for (const candidate of candidates) {
      const summary = await fetchSummary(
        "https://fr.wikipedia.org",
        candidate,
        timeoutMs,
        attempts
      );
      if (summary?.extract) {
        payload = {
          ok: true,
          word,
          title: summary.title || candidate,
          definition: summary.extract,
          extract: summary.extract,
          source: "wikipedia",
          url: summary.url,
        };
        break;
      }
      if (attempts.value >= MAX_FETCH_ATTEMPTS) break;
    }
  }

  if (!payload && attempts.value < MAX_FETCH_ATTEMPTS) {
    for (const candidate of candidates) {
      const titles = await fetchOpensearchTitles(
        "https://fr.wiktionary.org",
        candidate,
        5,
        timeoutMs,
        attempts
      );
      if (!titles || titles.length === 0) continue;
      const strict = pickStrictTitle(titles, candidate) || pickBestTitle(titles, candidate);
      if (!strict) continue;
      const summary = await fetchWiktionaryDefinition(strict, timeoutMs, attempts);
      if (summary?.extract) {
        payload = {
          ok: true,
          word,
          matchedTitle: summary.title || strict,
          title: summary.title || strict,
          definition: summary.extract,
          extract: summary.extract,
          source: "wiktionary",
          url: summary.url,
        };
        break;
      }
      if (attempts.value >= MAX_FETCH_ATTEMPTS) break;
    }
  }

  if (!payload && attempts.value < MAX_FETCH_ATTEMPTS) {
    const lemmaCandidates = guessLemmasFR(word);
    if (lemmaCandidates.length) attempts.value = 0;
    for (const lemma of lemmaCandidates) {
      const summary = await fetchWiktionaryDefinition(lemma, timeoutMs, attempts);
      const wikiSummary =
        summary?.extract
          ? summary
          : await fetchSummary("https://fr.wikipedia.org", lemma, timeoutMs, attempts);
      const dict = summary?.extract ? null : await fetchDictionaryApi(lemma, timeoutMs, attempts);
      if (wikiSummary?.extract || dict) {
        payload = {
          ok: true,
          word,
          lemma,
          lemmaGuess: true,
          title: wikiSummary?.title || lemma,
          definition: wikiSummary?.extract || dict,
          extract: wikiSummary?.extract || dict,
          source: wikiSummary?.source || (dict ? "dictionaryapi.dev" : "wikipedia"),
          url: wikiSummary?.url,
        };
        break;
      }
      if (attempts.value >= MAX_FETCH_ATTEMPTS) break;
    }
  }

  if (!payload && attempts.value < MAX_FETCH_ATTEMPTS) {
    const inflections = guessInflectionsFR(word);
    if (inflections.length) attempts.value = 0;
    for (const inflection of inflections) {
      const summary = await fetchWiktionaryDefinition(inflection.base, timeoutMs, attempts);
      const wikiSummary =
        summary?.extract
          ? summary
          : await fetchSummary("https://fr.wikipedia.org", inflection.base, timeoutMs, attempts);
      const dict =
        summary?.extract && wikiSummary?.extract
          ? null
          : await fetchDictionaryApi(inflection.base, timeoutMs, attempts);
      if (wikiSummary?.extract || dict) {
        payload = {
          ok: true,
          word,
          inflectionBase: inflection.base,
          inflectionLabel: inflection.label,
          inflectionGuess: true,
          title: wikiSummary?.title || inflection.base,
          definition: wikiSummary?.extract || dict,
          extract: wikiSummary?.extract || dict,
          source: wikiSummary?.source || (dict ? "dictionaryapi.dev" : "wikipedia"),
          url: wikiSummary?.url,
        };
        break;
      }
      if (attempts.value >= MAX_FETCH_ATTEMPTS) break;
    }
  }

  if (!payload && attempts.value < MAX_FETCH_ATTEMPTS) {
    const participles = guessParticiplesFR(word);
    if (participles.length) attempts.value = 0;
    for (const participle of participles) {
      const summary = await fetchWiktionaryDefinition(participle.base, timeoutMs, attempts);
      const wikiSummary =
        summary?.extract
          ? summary
          : await fetchSummary("https://fr.wikipedia.org", participle.base, timeoutMs, attempts);
      const dict =
        summary?.extract && wikiSummary?.extract
          ? null
          : await fetchDictionaryApi(participle.base, timeoutMs, attempts);
      if (wikiSummary?.extract || dict) {
        payload = {
          ok: true,
          word,
          participleBase: participle.base,
          participleLabel: participle.label,
          participleGuess: true,
          title: wikiSummary?.title || participle.base,
          definition: wikiSummary?.extract || dict,
          extract: wikiSummary?.extract || dict,
          source: wikiSummary?.source || (dict ? "dictionaryapi.dev" : "wikipedia"),
          url: wikiSummary?.url,
        };
        break;
      }
      if (attempts.value >= MAX_FETCH_ATTEMPTS) break;
    }
  }

  if (!payload && attempts.value < MAX_FETCH_ATTEMPTS) {
    const definition = await fetchDictionaryApi(
      candidates[candidates.length - 1] || word.toLowerCase(),
      timeoutMs,
      attempts
    );
    if (definition) {
      payload = {
        ok: true,
        word,
        title: word,
        definition,
        extract: definition,
        source: "dictionaryapi.dev",
      };
    }
  }

  if (!payload && verbBases.length) {
    for (const base of verbBases) {
      if (!base || normalizeLookup(base) === normalizeLookup(word)) continue;
      const summary = await fetchWiktionaryDefinition(base, timeoutMs, attempts);
      const wikiSummary =
        summary?.extract
          ? summary
          : await fetchSummary("https://fr.wikipedia.org", base, timeoutMs, attempts);
      const dict = summary?.extract ? null : await fetchDictionaryApi(base, timeoutMs, attempts);
      if (wikiSummary?.extract || dict) {
        payload = {
          word,
          lemma: base,
          lemmaGuess: true,
          title: wikiSummary?.title || base,
          definition: wikiSummary?.extract || dict,
          extract: wikiSummary?.extract || dict,
          source: wikiSummary?.source || (dict ? "dictionaryapi.dev" : "wikipedia"),
          url: wikiSummary?.url,
        };
        break;
      }
    }
  }

  if (!payload) {
    payload = {
      ok: false,
      word,
      error: "not_found",
      suggestions: suggestions.length ? suggestions.slice(0, 8) : undefined,
    };
  }

  const surfaceWord = displayWord && payload ? displayWord : null;
  if (payload && surfaceWord) {
    payload.displayWord = surfaceWord;
  }

  return payload;
}

function processQueue() {
  while (activeCount < GLOBAL_CONCURRENCY && queue.length > 0) {
    const job = queue.shift();
    activeCount++;
    job
      .task()
      .then((res) => job.resolve(res))
      .catch((err) => job.reject(err))
      .finally(() => {
        activeCount--;
        processQueue();
      });
  }
}

export function getDefinition(word, { timeoutMs = 2500, skipCache = false } = {}) {
  const key = normalizeLookup(word);
  if (!key) return Promise.resolve({ ok: false, error: "bad_word", word });
  if (!skipCache) {
    const cached = getCache(key);
    if (cached) return Promise.resolve(cached);
  } else {
    cache.delete(key);
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const task = () =>
    resolveDefinition(word, timeoutMs)
      .then((result) => {
        const ttl = result?.ok ? CACHE_TTL_OK_MS : CACHE_TTL_NOT_FOUND_MS;
        setCache(key, result, ttl);
        inflight.delete(key);
        return result;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });

  const promise = new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  }).catch((err) => {
    if (err?.name === "AbortError") {
      return { ok: false, word, error: "timeout" };
    }
    return { ok: false, word, error: "unavailable" };
  });
  inflight.set(key, promise);
  return promise;
}

export function clearDefinitionCache(word) {
  const key = normalizeLookup(word);
  if (key) cache.delete(key);
}

export function peekDefinitionCache(word) {
  const key = normalizeLookup(word);
  if (!key) return null;
  const entry = getCache(key);
  return entry;
}
