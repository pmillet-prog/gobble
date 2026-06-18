import {
  GAME_SEMANTIC_THEME_RULES,
  normalizeGameSemanticText,
  normalizeGameSemanticThemes,
} from "./gameSemanticThemes.js";

export const EMBEDDING_SEMANTIC_THEMES_SCHEMA_VERSION = "1";

const DIMENSIONS = 512;
const MAX_FEATURES_PER_TEXT = 90;
const MIN_COSINE = 0.24;
const STRONG_COSINE = 0.34;
const MAX_THEMES = 4;

const STOPWORDS = new Set(
  [
    "afin",
    "ainsi",
    "alors",
    "apres",
    "assez",
    "action",
    "aucun",
    "aussi",
    "autre",
    "avant",
    "avec",
    "avoir",
    "beaucoup",
    "bien",
    "ceci",
    "cela",
    "celle",
    "celui",
    "ces",
    "cette",
    "chez",
    "comme",
    "dans",
    "des",
    "deux",
    "dont",
    "elle",
    "elles",
    "entre",
    "etre",
    "fait",
    "faire",
    "forme",
    "genre",
    "leur",
    "leurs",
    "lors",
    "maniere",
    "mais",
    "meme",
    "moins",
    "objet",
    "partie",
    "personne",
    "plus",
    "pour",
    "qualifie",
    "quels",
    "qui",
    "quand",
    "quel",
    "quelle",
    "quelque",
    "relatif",
    "resultat",
    "sans",
    "selon",
    "seul",
    "sorte",
    "sous",
    "sur",
    "terme",
    "tout",
    "toute",
    "tres",
    "une",
    "vers",
    "voie",
    "voir",
    "vous",
  ].map((word) => normalizeGameSemanticText(word))
);

function hashFeature(value) {
  const str = String(value || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeToken(token) {
  let clean = normalizeGameSemanticText(token).replace(/'/g, "");
  if (!clean || clean.length < 3 || STOPWORDS.has(clean)) return "";
  if (clean.endsWith("ement") && clean.length > 8) clean = clean.slice(0, -5);
  else if (clean.endsWith("ation") && clean.length > 8) clean = clean.slice(0, -5);
  else if (clean.endsWith("ique") && clean.length > 7) clean = clean.slice(0, -4);
  else if (clean.endsWith("euses") && clean.length > 7) clean = clean.slice(0, -5) + "eur";
  else if (clean.endsWith("euse") && clean.length > 6) clean = clean.slice(0, -4) + "eur";
  else if (clean.endsWith("aux") && clean.length > 5) clean = clean.slice(0, -3) + "al";
  else if (clean.endsWith("es") && clean.length > 5) clean = clean.slice(0, -2);
  else if (clean.endsWith("s") && clean.length > 5) clean = clean.slice(0, -1);
  return clean.length >= 3 && !STOPWORDS.has(clean) ? clean : "";
}

function tokensFromText(text, maxTokens = MAX_FEATURES_PER_TEXT) {
  const raw = normalizeGameSemanticText(text).split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const token of raw) {
    if (tokens.length >= maxTokens) break;
    const clean = normalizeToken(token);
    if (clean) tokens.push(clean);
  }
  return tokens;
}

function addFeature(features, feature, weight = 1) {
  if (!feature || !Number.isFinite(weight) || weight <= 0) return;
  features.set(feature, (features.get(feature) || 0) + weight);
}

function addTextFeatures(features, text, weight = 1, maxTokens = MAX_FEATURES_PER_TEXT) {
  const tokens = tokensFromText(text, maxTokens);
  let previous = "";
  for (const token of tokens) {
    addFeature(features, token, weight);
    if (previous) addFeature(features, `${previous}_${token}`, weight * 0.55);
    previous = token;
  }
}

function flattenRelations(relations) {
  if (!relations || typeof relations !== "object") return [];
  const out = [];
  for (const values of Object.values(relations)) {
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value === "string") out.push(value);
      else if (value && typeof value === "object") out.push(value.word || value.term || value.title || "");
    }
  }
  return out.filter(Boolean);
}

function buildEntryFeatures(entry) {
  const features = new Map();
  const definitions = Array.isArray(entry?.definitions)
    ? entry.definitions
    : entry?.definition
    ? [entry.definition]
    : [];
  addTextFeatures(features, definitions.join(" "), 1.25, 140);
  addTextFeatures(features, (Array.isArray(entry?.lexicalDomains) ? entry.lexicalDomains : []).join(" "), 4.5, 40);
  addTextFeatures(features, (Array.isArray(entry?.categories) ? entry.categories : []).join(" "), 3.75, 50);
  addTextFeatures(features, flattenRelations(entry?.semanticRelations).join(" "), 1.1, 70);
  addTextFeatures(features, [entry?.title, entry?.word].filter(Boolean).join(" "), 0.45, 8);
  return features;
}

function buildRuleFeatures(rule) {
  const features = new Map();
  addTextFeatures(features, [rule.label, rule.id].filter(Boolean).join(" "), 3.5, 12);
  addTextFeatures(features, (rule.domains || []).join(" "), 5.5, 80);
  addTextFeatures(features, (rule.categories || []).join(" "), 4.5, 80);
  addTextFeatures(features, (rule.strong || []).join(" "), 3.25, 140);
  return features;
}

function vectorize(features) {
  const vector = new Map();
  for (const [feature, weight] of features.entries()) {
    const hash = hashFeature(feature);
    const index = hash % DIMENSIONS;
    const sign = hash & 0x80000000 ? -1 : 1;
    vector.set(index, (vector.get(index) || 0) + sign * weight);
  }
  let norm = 0;
  for (const value of vector.values()) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (const [index, value] of vector.entries()) {
    const normalized = value / norm;
    if (Math.abs(normalized) < 0.0001) vector.delete(index);
    else vector.set(index, normalized);
  }
  return vector;
}

function addVector(target, vector, weight = 1) {
  for (const [index, value] of vector.entries()) {
    target.set(index, (target.get(index) || 0) + value * weight);
  }
}

function normalizeVector(vector) {
  let norm = 0;
  for (const value of vector.values()) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (const [index, value] of vector.entries()) {
    vector.set(index, value / norm);
  }
  return vector;
}

function cosine(left, right) {
  if (!left?.size || !right?.size) return 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let dot = 0;
  for (const [index, value] of small.entries()) {
    dot += value * (large.get(index) || 0);
  }
  return dot;
}

function themeKey(theme) {
  return String(theme?.id || theme?.label || "").trim();
}

function directEvidenceFeatures(entryFeatures, rule, max = 5) {
  const seedFeatures = buildRuleFeatures(rule);
  const hits = [];
  for (const feature of seedFeatures.keys()) {
    if (hits.length >= max) break;
    if (entryFeatures.has(feature)) hits.push(feature);
  }
  return hits;
}

function confidenceFor(score, cos, directHits) {
  if (cos >= STRONG_COSINE || directHits >= 2 || score >= 13) return "high";
  if (cos >= MIN_COSINE + 0.04 || directHits >= 1 || score >= 10) return "medium";
  return "low";
}

export function createSemanticEmbeddingThemeModel(seedEntries = []) {
  const models = new Map();
  for (const rule of GAME_SEMANTIC_THEME_RULES) {
    models.set(rule.id, {
      rule,
      vector: vectorize(buildRuleFeatures(rule)),
      examples: 0,
    });
  }

  for (const item of Array.isArray(seedEntries) ? seedEntries : []) {
    const themes = normalizeGameSemanticThemes(item?.themes);
    if (!themes.length || themes.length > 3) continue;
    const docVector = vectorize(buildEntryFeatures(item.entry));
    if (!docVector.size) continue;
    for (const theme of themes) {
      const key = themeKey(theme);
      const model = models.get(key);
      if (!model) continue;
      const score = Number(theme.score) || 0;
      const sources = Array.isArray(theme.sources) ? theme.sources : [];
      const strongSource = sources.some((source) => /^(?:definition|category|domain):/.test(String(source || "")));
      if (score < 10 || !strongSource) continue;
      addVector(model.vector, docVector, 0.1);
      model.examples += 1;
    }
  }

  for (const model of models.values()) {
    normalizeVector(model.vector);
  }
  return {
    dimensions: DIMENSIONS,
    schemaVersion: EMBEDDING_SEMANTIC_THEMES_SCHEMA_VERSION,
    themes: Array.from(models.values()),
  };
}

const DEFAULT_MODEL = createSemanticEmbeddingThemeModel();

export function buildEmbeddingSemanticThemes(entry, model = DEFAULT_MODEL) {
  const entryFeatures = buildEntryFeatures(entry);
  const docVector = vectorize(entryFeatures);
  if (!docVector.size) return [];

  return (model?.themes || DEFAULT_MODEL.themes)
    .map(({ rule, vector, examples }) => {
      const cos = cosine(docVector, vector);
      const hits = directEvidenceFeatures(entryFeatures, rule, 5);
      const score = Math.round(cos * 36 + Math.min(5, hits.length * 2) + Math.min(3, Math.log10((examples || 0) + 1)));
      if (cos < MIN_COSINE && hits.length < 2) return null;
      if (!hits.length && cos < 0.32) return null;
      if (score < 9) return null;
      return {
        id: rule.id,
        label: rule.label,
        score,
        confidence: confidenceFor(score, cos, hits.length),
        sources: [
          `embedding:cosine:${cos.toFixed(3)}`,
          examples ? `embedding:examples:${examples}` : "embedding:prototype",
          ...hits.slice(0, 4).map((hit) => `embedding:feature:${hit}`),
        ],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"))
    .slice(0, MAX_THEMES);
}

function confidenceRank(value) {
  const clean = String(value || "").toLowerCase();
  if (clean === "high") return 3;
  if (clean === "medium") return 2;
  if (clean === "low") return 1;
  return 0;
}

export function mergeSemanticThemes(...themeLists) {
  const byId = new Map();
  for (const list of themeLists) {
    for (const theme of normalizeGameSemanticThemes(list)) {
      const id = themeKey(theme);
      if (!id) continue;
      const previous = byId.get(id);
      if (!previous) {
        byId.set(id, { ...theme });
        continue;
      }
      previous.score = Math.max(previous.score || 0, theme.score || 0);
      if (confidenceRank(theme.confidence) > confidenceRank(previous.confidence)) {
        previous.confidence = theme.confidence;
      }
      previous.sources = Array.from(
        new Set([...(previous.sources || []), ...(theme.sources || [])])
      ).slice(0, 12);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"))
    .slice(0, 5);
}
