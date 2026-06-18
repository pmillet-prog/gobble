const MAX_FACTS = 4;
const MAX_DOUBLE_DEFINITIONS = 4;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function uniqueBy(list, keyOf, limit = MAX_FACTS) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (limit > 0 && out.length >= limit) break;
  }
  return out;
}

function normalizeName(value) {
  return cleanText(value)
    .replace(/^[,;:.\s-]+|[,;:.\s-]+$/g, "")
    .replace(/\s+(?:qui|dont|et|en|au|aux|avec|pour|par|du|de la|de l').*$/i, "")
    .trim();
}

function looksLikePersonOrNamedEntity(value) {
  const clean = normalizeName(value);
  if (!clean || clean.length < 3 || clean.length > 80) return false;
  if (!/[A-ZÀ-Þ]/.test(clean.charAt(0))) return false;
  if (/^(?:Dieu|France|Paris|Europe|Gaura)$/i.test(clean)) return false;
  if (/\b(?:scientifique|genre|espece|espèce|famille|ordre|tribu)\b/i.test(clean)) return false;
  return true;
}

function pickNamedEntity(value) {
  const clean = cleanText(value);
  if (!clean) return "";
  const blocked = new Set(["De", "Du", "Des", "Le", "La", "Les", "Nom", "Composé", "Compose"]);
  const matches = Array.from(
    clean.matchAll(
      /\b([A-ZÀ-Þ][\p{L}À-ÿ'’.-]+(?:\s+(?:d[’']|de|du|des|le|la|l[’']|al|Al|ben|Ben|ibn|Ibn|[A-ZÀ-Þ][\p{L}À-ÿ'’.-]+)){0,5})/gu
    )
  )
    .map((match) => normalizeName(match[1]))
    .filter((name) => {
      const first = name.split(/\s+/)[0];
      return first && !blocked.has(first) && looksLikePersonOrNamedEntity(name);
    });
  if (!matches.length) return "";
  return matches
    .sort((a, b) => {
      const aWords = a.split(/\s+/).length;
      const bWords = b.split(/\s+/).length;
      return bWords - aWords || b.length - a.length;
    })[0];
}

function clipFactText(value, maxLen = 220) {
  const clean = cleanText(value)
    .replace(/\.\s*:.*$/g, ".")
    .replace(/\s+:[\s:;*#-]*$/g, "")
    .trim();
  if (!clean || clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const boundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("; "),
    slice.lastIndexOf(", "),
    slice.lastIndexOf(" et "),
    slice.lastIndexOf(" ou ")
  );
  const cut = boundary >= 80 ? slice.slice(0, boundary) : slice.replace(/\s+\S*$/, "");
  return `${cut.replace(/[«“(,;:\s]+$/g, "").trim()}...`;
}

function extractInventorFactsFromText(text) {
  const raw = cleanText(text);
  if (!raw) return [];

  const facts = [];
  const add = (kind, name, evidence) => {
    const cleanName = normalizeName(name);
    if (!looksLikePersonOrNamedEntity(cleanName)) return;
    const cleanEvidence = clipFactText(evidence || raw);
    if (!cleanEvidence) return;
    facts.push({
      kind,
      name: cleanName,
      text: cleanEvidence,
      source: "wiktionary",
    });
  };

  const namePattern =
    "([A-ZÀ-Þ][\\p{L}À-ÿ'’.-]+(?:\\s+(?:de|du|des|d'|d’|le|la|von|van|al|Al|ibn|Ibn|ben|Ben|[A-ZÀ-Þ][\\p{L}À-ÿ'’.-]+)){0,5})";
  const inventorPatterns = [
    {
      kind: "inventor",
      re: new RegExp(
        `\\b(?:invent[eé]|cr[eé][eé]|mis au point|imagin[eé]|con[cç]u|propos[eé]|introduit|d[eé]couvert)\\s+(?:en\\s+\\d{3,4}\\s+)?par\\s+${namePattern}`,
        "giu"
      ),
    },
    {
      kind: "named_after",
      re: new RegExp(
        `\\b(?:du|d['’]apr[eè]s|nomm[eé]\\s+d['’]apr[eè]s|baptis[eé]\\s+d['’]apr[eè]s)\\s+(?:nom\\s+)?(?:du|de la|de l['’]|d['’])?(?:\\s+(?:math[eé]maticien|physicien|chimiste|botaniste|naturaliste|inventeur|cr[eé]ateur|savant|astronome|m[eé]decin|ing[eé]nieur|scientifique|persan|perse|fran[cç]ais|anglais|allemand|italien|russe))*\\s+${namePattern}`,
        "giu"
      ),
    },
    {
      kind: "dedication",
      re: new RegExp(
        `\\b(?:en\\s+l['’]honneur\\s+de|d[eé]di[eé]\\s+[aà])\\s+${namePattern}`,
        "giu"
      ),
    },
  ];

  for (const { kind, re } of inventorPatterns) {
    for (const match of raw.matchAll(re)) {
      const name = match[1] || "";
      const start = Math.max(0, match.index - 80);
      const end = Math.min(raw.length, match.index + match[0].length + 120);
      const evidence = raw.slice(start, end);
      if (/\bnom scientifique\b/i.test(evidence)) continue;
      add(kind, name, evidence);
    }
  }

  const tailPatterns = [
    {
      kind: "inventor",
      re: /\bnom\s+(?:de\s+famille\s+)?(?:de\s+son|du|de la|de l[’']|d[’'])?\s*inventeur\b([^.;:]{0,180})/giu,
    },
    {
      kind: "named_after",
      re: /\bnom\s+(?:du|de la|de l[’']|d[’'])?([^.;:]{0,160})/giu,
    },
    {
      kind: "named_after",
      re: /\bcompos[eé]\s+du\s+nom\s+de\s+([^.;:]{0,140})/giu,
    },
    {
      kind: "inventor",
      re: /\b([A-ZÀ-Þ][\p{L}À-ÿ'’.-]{2,})\s*,\s+nom\s+de\s+famille\s+de\s+son\s+inventeur\b/giu,
    },
  ];

  for (const { kind, re } of tailPatterns) {
    for (const match of raw.matchAll(re)) {
      const tail = match[1] || "";
      const start = Math.max(0, match.index - 80);
      const end = Math.min(raw.length, match.index + match[0].length + 120);
      const evidence = raw.slice(start, end);
      if (/\bnom scientifique\b/i.test(evidence)) continue;
      const name = pickNamedEntity(tail);
      add(kind, name, evidence);
    }
  }

  const kindRank = new Map([
    ["inventor", 0],
    ["named_after", 1],
    ["dedication", 2],
  ]);
  return uniqueBy(
    facts.sort((a, b) => (kindRank.get(a.kind) ?? 9) - (kindRank.get(b.kind) ?? 9)),
    (fact) => normalizeText(fact.name)
  );
}

function definitionTokens(value) {
  const normalized = normalizeText(value)
    .replace(/\([^)]{0,80}\)/g, " ")
    .replace(/[^a-z0-9' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stop = new Set([
    "des",
    "dans",
    "avec",
    "pour",
    "par",
    "une",
    "les",
    "qui",
    "que",
    "est",
    "sont",
    "etre",
    "être",
    "celui",
    "celle",
    "ceux",
    "forme",
  ]);
  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stop.has(token));
}

function similarity(a, b) {
  const left = new Set(definitionTokens(a));
  const right = new Set(definitionTokens(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / Math.max(left.size, right.size);
}

function extractDefinitionLabel(value) {
  const clean = cleanText(value);
  const paren = clean.match(/^\(([^)]{2,45})\)/);
  if (paren) return cleanText(paren[1]).toLowerCase();
  const domain = clean.match(/^(?:en\s+)?([A-ZÀ-Þa-zà-ÿ -]{3,35})\s*[:;]/);
  return domain ? cleanText(domain[1]).toLowerCase() : "";
}

function isUsefulSenseDefinition(value) {
  const clean = cleanText(value);
  const normalized = normalizeText(clean).replace(/[’`]/g, "'");
  if (clean.length < 22) return false;
  if (/^(?:forme|feminin|masculin|pluriel|participe|premiere|deuxieme|troisieme|variante|graphie|orthographe)\b/.test(normalized)) {
    return false;
  }
  if (/\b(?:indicatif|subjonctif|conditionnel|imperatif|infinitif)\b/.test(normalized)) return false;
  return true;
}

export function buildDoubleDefinitions(definitions) {
  const rawDefinitions = Array.isArray(definitions)
    ? definitions.map((definition) => cleanText(definition)).filter(isUsefulSenseDefinition)
    : [];
  const distinct = [];
  for (const definition of rawDefinitions) {
    const normalized = normalizeText(definition);
    if (!normalized || distinct.some((entry) => normalizeText(entry.definition) === normalized)) continue;
    if (distinct.some((entry) => similarity(entry.definition, definition) > 0.72)) continue;
    distinct.push({
      definition: clipFactText(definition, 260),
      label: extractDefinitionLabel(definition),
    });
    if (distinct.length >= MAX_DOUBLE_DEFINITIONS) break;
  }
  return distinct.length >= 2 ? distinct : [];
}

export function buildWordLinguisticFacts(entry) {
  const definitions = Array.isArray(entry?.definitions)
    ? entry.definitions
    : entry?.definition
    ? [entry.definition]
    : [];
  const sourceTexts = [
    entry?.etymology || "",
    ...definitions.slice(0, 4),
  ].filter(Boolean);
  const inventorFacts = uniqueBy(
    sourceTexts.flatMap((text) => extractInventorFactsFromText(text)),
    (fact) => `${fact.kind}:${normalizeText(fact.name)}`
  );
  const doubleDefinitions = buildDoubleDefinitions(definitions);
  return { inventorFacts, doubleDefinitions };
}
