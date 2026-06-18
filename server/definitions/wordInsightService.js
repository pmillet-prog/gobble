import { normalizeWord } from "../../shared/gameLogic.js";
import { buildGameSemanticThemes, normalizeGameSemanticThemes } from "./gameSemanticThemes.js";
import { mergeSemanticThemes } from "./semanticEmbeddingThemes.js";
import { getLocalDefinitionEntry } from "./localDefinitionStore.js";

const DEFAULT_MAX_LOOKUPS = 450;
const BATCH_SIZE = 40;
const GENERIC_THEME_WORDS = new Set([
  "autre",
  "celle",
  "celui",
  "cellule",
  "comme",
  "deux",
  "dire",
  "elle",
  "faire",
  "grand",
  "groupe",
  "meme",
  "même",
  "note",
  "partie",
  "pied",
  "seconde",
  "seul",
  "seule",
  "temps",
  "tout",
  "toute",
  "tous",
  "une",
  "voix",
]);

const PLURAL_DOMAIN_LABELS = new Set([
  "animaux",
  "mathématiques",
  "sciences",
  "plantes",
  "meubles",
  "vêtements",
  "vetements",
  "outils",
  "véhicules",
  "vehicules",
  "métiers",
  "metiers",
]);

const DOMAIN_SENTENCE_LABELS = new Map([
  ["bâtiment", "au bâtiment"],
  ["batiment", "au bâtiment"],
  ["corps humain", "au corps humain"],
  ["droit", "au droit"],
  ["sport", "au sport"],
  ["militaire", "au domaine militaire"],
  ["informatique", "à l'informatique"],
  ["économie", "à l'économie"],
  ["economie", "à l'économie"],
  ["météo", "à la météo"],
  ["meteo", "à la météo"],
  ["géographie", "à la géographie"],
  ["geographie", "à la géographie"],
]);

const ANIMAL_CATEGORY_RE =
  /\b(?:animaux|zoologie|oiseaux|insectes|poissons|mammiferes|mammifères|chiens|chats|passereaux|gallinaces|gallinacés|mouches|mustelines|mustélinés|mustelides|mustélidés|coleopteres|coléoptères|dipteres|diptères|amphibiens|reptiles|mollusques|crustaces|crustacés)\b/i;
const ANIMAL_DOMAIN_RE =
  /\b(?:zoologie|ornithologie|entomologie|ichtyologie|mammalogie)\b/i;
const ANIMAL_NAME_RE =
  /\b(?:animal|oiseau|passereau|insecte|coleoptere|coléoptère|diptere|diptère|poisson|mammifere|mammifère|carnivore|mustelide|mustélidé|reptile|amphibien|batracien|mollusque|crustace|crustacé|chien|chat|cheval|vache|boeuf|bœuf|taureau|dindon|serpent|papillon|mouche|crapaud|grenouille|scarabee|scarabée|corvide|gallinace|gallinacé)\b/i;
const ANIMAL_DEFINITION_RE =
  /^(?:(?:espece|espèce|genre|race|famille|ordre)\s+(?:de|d'|des)\s+|(?:petit|petite|grand|grande|gros|grosse|jeune|vieux|vieil|vieille)\s+)?[\s\S]{0,80}\b(?:oiseau|passereau|insecte|coleoptere|coléoptère|diptere|diptère|poisson|mammifere|mammifère|reptile|amphibien|batracien|mollusque|crustace|crustacé|chien|chat|cheval|dindon|serpent|papillon|mouche|crapaud|grenouille|scarabee|scarabée|corvide|gallinace|gallinacé)\b/i;
const ANIMAL_RELATED_BUT_NOT_NAME_RE =
  /\b(?:nourrit|nourrir|alimentaire|nourriture|manger|donne a manger|donne à manger|transporter|contenir|contient|organe|ouverture|branchie|sabot|articulation|fiente|moule|rouste|correction)\b/i;
const PLANT_CATEGORY_RE =
  /\b(?:plantes?|botanique|arbres?|fleurs?|fruits?|legumes|légumes|cereales|céréales|graminees|graminées|champignons?|algues?|plantes toxiques)\b/i;
const PLANT_NAME_RE =
  /\b(?:plante|vegetal|végétal|arbre|arbuste|fleur|fruit|feuille|racine|tige|graine|pollen|cereale|céréale|herbe|graminee|graminée|champignon|algue|rosier|rose|taxacee|taxacée)\b/i;
const PLANT_RELATED_BUT_NOT_NAME_RE =
  /\b(?:couleur|teinte|ornement heraldique|ornement héraldique|forme de|support pour)\b/i;

function normalizeThemeKey(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function increment(map, key, word) {
  const clean = String(key || "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  const entry = map.get(clean) || { key: clean, count: 0, words: [] };
  entry.count += 1;
  if (word && !entry.words.includes(word)) entry.words.push(word);
  map.set(clean, entry);
}

function sortedCounts(map, minCount = 2, maxWords = 12) {
  return Array.from(map.values())
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "fr"))
    .map((entry) => ({
      key: entry.key,
      count: entry.count,
      words: entry.words.slice(0, maxWords),
    }));
}

function mergeCountMaps(...maps) {
  const merged = new Map();
  for (const source of maps) {
    if (!(source instanceof Map)) continue;
    for (const [rawKey, rawEntry] of source.entries()) {
      const key = String(rawEntry?.key || rawKey || "").replace(/\s+/g, " ").trim();
      if (!key) continue;
      const entry = merged.get(key) || { key, count: 0, words: [] };
      for (const word of Array.isArray(rawEntry?.words) ? rawEntry.words : []) {
        if (word && !entry.words.includes(word)) {
          entry.words.push(word);
        }
      }
      entry.count = entry.words.length || Math.max(entry.count, Number(rawEntry?.count) || 0);
      merged.set(key, entry);
    }
  }
  return merged;
}

function isThemeChallengeCandidate(word, entry, domain) {
  const norm = normalizeWord(word);
  const domainLabel = String(domain || "").trim().toLowerCase();
  if (domainLabel === "animaux") {
    return isAnimalThemeChallengeCandidate(word, entry);
  }
  if (domainLabel === "plantes") {
    return isPlantThemeChallengeCandidate(word, entry);
  }
  if (!norm || norm.length < 5) return false;
  if (GENERIC_THEME_WORDS.has(norm)) return false;
  const pos = Array.isArray(entry?.partOfSpeech) ? entry.partOfSpeech : [];
  if (pos.length && !pos.some((item) => /^nom(?:\s|$)/i.test(String(item || "")))) {
    return false;
  }

  const mostlyGrammatical =
    pos.length > 0 &&
    pos.every((item) =>
      /^(?:adjectif|adverbe|pronom|déterminant|determinant|article|préposition|preposition|conjonction)$/.test(
        String(item || "").toLowerCase()
      )
    );
  if (mostlyGrammatical) return false;

  return !!domainLabel;
}

function hasThemeChallengePartOfSpeech(entry) {
  const pos = Array.isArray(entry?.partOfSpeech) ? entry.partOfSpeech : [];
  if (pos.length && !pos.some((item) => /^nom(?:\s|$)/i.test(String(item || "")))) {
    return false;
  }
  const mostlyGrammatical =
    pos.length > 0 &&
    pos.every((item) =>
      /^(?:adjectif|adverbe|pronom|déterminant|determinant|article|préposition|preposition|conjonction)$/.test(
        String(item || "").toLowerCase()
      )
    );
  return !mostlyGrammatical;
}

function getThemeEmbeddingSignal(theme) {
  const sources = Array.isArray(theme?.sources) ? theme.sources : [];
  const cosine = sources.reduce((best, source) => {
    const match = String(source || "").match(/^embedding:cosine:(0\.\d+)/);
    return match ? Math.max(best, Number(match[1]) || 0) : best;
  }, 0);
  const featureCount = sources.filter((source) => /^embedding:feature:/.test(String(source || ""))).length;
  return { cosine, featureCount };
}

function hasStrongThemeEvidence(theme) {
  const sources = Array.isArray(theme?.sources) ? theme.sources : [];
  if (sources.some((source) => /^(?:definition|category):/.test(String(source || "")))) return true;
  const embedding = getThemeEmbeddingSignal(theme);
  return (
    Number(theme?.score) >= 13 &&
    (embedding.cosine >= 0.38 || (embedding.cosine >= 0.3 && embedding.featureCount >= 2))
  );
}

function isSemanticThemeChallengeCandidate(word, entry, theme) {
  const label = String(theme?.label || theme?.id || "").trim();
  const norm = normalizeWord(word);
  if (!norm || norm.length < 2) return false;
  if (GENERIC_THEME_WORDS.has(norm)) return false;
  if (!hasThemeChallengePartOfSpeech(entry)) return false;
  if (label.toLowerCase() === "animaux") return isAnimalThemeChallengeCandidate(word, entry);
  if (label.toLowerCase() === "plantes") return isPlantThemeChallengeCandidate(word, entry);
  if (norm.length >= 5) return isThemeChallengeCandidate(word, entry, label);
  return hasStrongThemeEvidence(theme);
}

function normalizeForThemeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[œ]/g, "oe")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAnimalThemeChallengeCandidate(word, entry) {
  const norm = normalizeWord(word);
  if (!norm || norm.length < 3) return false;
  if (GENERIC_THEME_WORDS.has(norm)) return false;

  const pos = Array.isArray(entry?.partOfSpeech) ? entry.partOfSpeech : [];
  if (pos.length && !pos.some((item) => /^nom(?:\s|$)/i.test(String(item || "")))) return false;

  const domains = normalizeForThemeText((Array.isArray(entry?.lexicalDomains) ? entry.lexicalDomains : []).join(" "));
  const categories = normalizeForThemeText((Array.isArray(entry?.categories) ? entry.categories : []).join(" "));
  if (ANIMAL_CATEGORY_RE.test(categories)) return true;

  const definitions = Array.isArray(entry?.definitions) ? entry.definitions : [];
  const firstDefinitions = definitions
    .slice(0, 2)
    .map((definition) => normalizeForThemeText(definition))
    .filter(Boolean);
  if (!firstDefinitions.length) return false;

  return firstDefinitions.some((definition) => {
    if (ANIMAL_RELATED_BUT_NOT_NAME_RE.test(definition)) return false;
    if (/nom d.amitie[\s\S]{0,80}\bchats?\b/i.test(definition)) return true;
    if (/\banimal\b/i.test(definition) && ANIMAL_NAME_RE.test(definition)) return true;
    return ANIMAL_DEFINITION_RE.test(definition);
  });
}

function isPlantThemeChallengeCandidate(word, entry) {
  const norm = normalizeWord(word);
  if (!norm || norm.length < 2) return false;
  if (GENERIC_THEME_WORDS.has(norm)) return false;

  const pos = Array.isArray(entry?.partOfSpeech) ? entry.partOfSpeech : [];
  if (pos.length && !pos.some((item) => /^nom(?:\s|$)/i.test(String(item || "")))) return false;

  const categories = normalizeForThemeText((Array.isArray(entry?.categories) ? entry.categories : []).join(" "));
  if (PLANT_CATEGORY_RE.test(categories)) return true;

  const definitions = Array.isArray(entry?.definitions) ? entry.definitions : [];
  const firstDefinitions = definitions
    .slice(0, 3)
    .map((definition) => normalizeForThemeText(definition))
    .filter(Boolean);
  if (!firstDefinitions.length) return false;

  return firstDefinitions.some((definition) => {
    if (PLANT_RELATED_BUT_NOT_NAME_RE.test(definition) && !/\b(?:plante|arbre|arbuste|fleur)\b/i.test(definition)) {
      return false;
    }
    return PLANT_NAME_RE.test(definition);
  });
}

async function readEntries(words) {
  const entries = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    const resolved = await Promise.all(
      batch.map(async (word) => {
        const entry = await getLocalDefinitionEntry(word);
        if (!entry) return null;
        const formOf = normalizeWord(entry.formOf || "");
        const baseEntry =
          entry.isFormOf && formOf && formOf !== word && shouldInheritThemeFromBase(entry, formOf)
            ? await getLocalDefinitionEntry(formOf)
            : null;
        return entry ? { word, entry, baseEntry } : null;
      })
    );
    entries.push(...resolved.filter(Boolean));
  }
  return entries;
}

function shouldInheritThemeFromBase(entry, base) {
  const definitions = Array.isArray(entry?.definitions) ? entry.definitions : [];
  const cleanBase = normalizeWord(base);
  const escapedBase = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escapedBase) return false;
  const basePattern = new RegExp(`\\b(?:${escapedBase})\\b`, "i");
  return definitions.some((definition) => {
    const text = String(definition || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!basePattern.test(text)) return false;
    if (/\b(?:verbe|participe|indicatif|subjonctif|imperatif|conditionnel|infinitif)\b/i.test(text)) {
      return false;
    }
    return /\b(?:pluriel|feminin|masculin)\s+(?:singulier\s+|pluriel\s+)?de\b/i.test(text);
  });
}

function getThemeSourceEntry(entry, baseEntry) {
  if (baseEntry && Array.isArray(baseEntry.definitions) && baseEntry.definitions.length) {
    return baseEntry;
  }
  return entry;
}

function getCurrentSemanticThemes(entry) {
  const computed = buildGameSemanticThemes(entry);
  return mergeSemanticThemes(computed, normalizeGameSemanticThemes(entry?.gameSemanticThemes));
}

function isSemanticThemeReliableForChallenge(theme, allThemes) {
  const sources = Array.isArray(theme?.sources) ? theme.sources : [];
  if (sources.some((source) => /^(?:definition|category):/.test(String(source || "")))) {
    return true;
  }
  if (Array.isArray(allThemes) && allThemes.length > 3) return false;
  const embedding = getThemeEmbeddingSignal(theme);
  if (
    (embedding.cosine >= 0.38 || (embedding.cosine >= 0.3 && embedding.featureCount >= 2)) &&
    Number(theme?.score) >= 13
  ) {
    return true;
  }
  const domainSources = sources.filter((source) => /^domain:/.test(String(source || "")));
  return domainSources.length >= 2 && Number(theme?.score) >= 10;
}

function addFamilyEdges(edges, word, relations, foundSet) {
  const related = [
    ...(Array.isArray(relations?.derived) ? relations.derived : []),
    ...(Array.isArray(relations?.related) ? relations.related : []),
  ];
  for (const raw of related) {
    const other = normalizeWord(raw);
    if (!other || other === word || !foundSet.has(other)) continue;
    if (!edges.has(word)) edges.set(word, new Set());
    if (!edges.has(other)) edges.set(other, new Set());
    edges.get(word).add(other);
    edges.get(other).add(word);
  }
}

function connectedComponents(edges) {
  const components = [];
  const seen = new Set();
  for (const word of edges.keys()) {
    if (seen.has(word)) continue;
    const stack = [word];
    const component = [];
    seen.add(word);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const next of edges.get(current) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (component.length >= 3) components.push(component.sort((a, b) => a.localeCompare(b, "fr")));
  }
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0], "fr"));
}

export async function buildWordInsightSummary(rawWords, options = {}) {
  const maxLookups = Number(options.maxLookups) || DEFAULT_MAX_LOOKUPS;
  const words = Array.from(
    new Set(
      (Array.isArray(rawWords) ? rawWords : [])
        .map((word) => normalizeWord(word))
        .filter(Boolean)
    )
  ).slice(0, maxLookups);
  const foundSet = new Set(words);
  const rows = await readEntries(words);

  const domains = new Map();
  const lexicalChallengeDomains = new Map();
  const semanticChallengeThemes = new Map();
  const origins = new Map();
  const partsOfSpeech = new Map();
  const curiosityTags = new Map();
  const relationEdges = new Map();

  for (const { word, entry, baseEntry } of rows) {
    const themeEntry = getThemeSourceEntry(entry, baseEntry);
    for (const domain of Array.isArray(entry.lexicalDomains) ? entry.lexicalDomains : []) {
      increment(domains, domain, word);
      if (isThemeChallengeCandidate(word, entry, domain)) {
        increment(lexicalChallengeDomains, domain, word);
      }
    }
    const semanticThemes = getCurrentSemanticThemes(themeEntry);
    for (const theme of semanticThemes) {
      const label = String(theme?.label || theme?.id || "").trim();
      const score = Number(theme?.score) || 0;
      const minScore = normalizeThemeKey(label) === "animaux" ? 5 : 7;
      const challengeCandidate = isSemanticThemeChallengeCandidate(word, themeEntry, theme);
      const reliableTheme =
        (normalizeThemeKey(label) === "animaux" && challengeCandidate) ||
        isSemanticThemeReliableForChallenge(theme, semanticThemes);
      if (score >= minScore && reliableTheme && challengeCandidate) {
        increment(semanticChallengeThemes, label, word);
      }
    }
    for (const origin of Array.isArray(entry.etymologyLangs) ? entry.etymologyLangs : []) {
      increment(origins, origin, word);
    }
    for (const pos of Array.isArray(entry.partOfSpeech) ? entry.partOfSpeech : []) {
      increment(partsOfSpeech, pos, word);
    }
    for (const tag of Array.isArray(entry.curiosityTags) ? entry.curiosityTags : []) {
      increment(curiosityTags, tag, word);
    }
    addFamilyEdges(relationEdges, word, entry.semanticRelations, foundSet);
  }

  return {
    wordsChecked: words.length,
    entriesFound: rows.length,
    domains: sortedCounts(domains, 2),
    gameSemanticThemes: sortedCounts(semanticChallengeThemes, 2, 40),
    lexicalChallengeDomains: sortedCounts(lexicalChallengeDomains, 2, 40),
    challengeDomains: sortedCounts(mergeCountMaps(semanticChallengeThemes, lexicalChallengeDomains), 2, 40),
    origins: sortedCounts(origins, 2),
    partsOfSpeech: sortedCounts(partsOfSpeech, 3),
    curiosityTags: sortedCounts(curiosityTags, 2),
    familyClusters: connectedComponents(relationEdges).map((wordsInCluster) => ({
      count: wordsInCluster.length,
      words: wordsInCluster.slice(0, 12),
    })),
  };
}

function formatDomainForSentence(domain) {
  const clean = String(domain || "").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  if (DOMAIN_SENTENCE_LABELS.has(lower)) return DOMAIN_SENTENCE_LABELS.get(lower);
  if (PLURAL_DOMAIN_LABELS.has(lower)) return `aux ${clean}`;
  if (/^les /i.test(clean)) return clean.replace(/^les /i, "aux ");
  if (/^(?:l'|la |le )/i.test(clean)) return `à ${clean}`;
  if (/^[aeiouhàâéèêëîïôùûü]/i.test(clean)) return `à l'${clean}`;
  return `à la ${clean}`;
}

function formatOriginAdjective(origin) {
  const clean = String(origin || "").trim().toLowerCase();
  const map = new Map([
    ["latin", "latine"],
    ["latin populaire", "latine populaire"],
    ["grec ancien", "grecque ancienne"],
    ["grec", "grecque"],
    ["germanique", "germanique"],
    ["francique", "francique"],
    ["anglais", "anglaise"],
    ["allemand", "allemande"],
    ["néerlandais", "néerlandaise"],
    ["arabe", "arabe"],
    ["italien", "italienne"],
    ["espagnol", "espagnole"],
    ["occitan", "occitane"],
    ["ancien français", "d'ancien français"],
    ["moyen français", "de moyen français"],
    ["gaulois", "gauloise"],
    ["sanskrit", "sanskrite"],
    ["persan", "persane"],
    ["russe", "russe"],
    ["japonais", "japonaise"],
  ]);
  return map.get(clean) || clean;
}

export function buildWordInsightChatLines(summary, options = {}) {
  const lines = [];
  const minDomainCount = Number(options.minDomainCount) || 4;
  const minOriginCount = Number(options.minOriginCount) || 3;
  const minFamilyCount = Number(options.minFamilyCount) || 3;

  const domain = summary?.domains?.find((entry) => entry.count >= minDomainCount);
  if (domain) {
    lines.push(`Cette grille contient ${domain.count} termes liés ${formatDomainForSentence(domain.key)}.`);
  }

  const origin = summary?.origins?.find((entry) => entry.count >= minOriginCount);
  if (origin) {
    lines.push(`${origin.count} mots de cette grille ont une origine ${formatOriginAdjective(origin.key)}.`);
  }

  const family = summary?.familyClusters?.find((entry) => entry.count >= minFamilyCount);
  if (family) {
    lines.push(`${family.count} mots trouvables semblent appartenir à une même famille lexicale.`);
  }

  return lines.slice(0, 3);
}

export function pickWordThemeChallenge(summary, options = {}) {
  const minWords = Number(options.minWords) || 3;
  const maxWords = Number(options.maxWords) || 30;
  const completionRatio = Math.min(1, Math.max(0.1, Number(options.completionRatio) || 0.7));
  const excludedThemes = new Set(
    (Array.isArray(options.excludedThemes) ? options.excludedThemes : [])
      .map((theme) => normalizeThemeKey(theme))
      .filter(Boolean)
  );
  const usageSource = options.themeUsageCounts instanceof Map
    ? options.themeUsageCounts
    : options.themeUsageCounts && typeof options.themeUsageCounts === "object"
    ? new Map(Object.entries(options.themeUsageCounts))
    : new Map();
  const usageCountFor = (theme) => Number(usageSource.get(normalizeThemeKey(theme))) || 0;
  const seed = Number.isFinite(options.selectionSeed) ? Math.trunc(options.selectionSeed) : 0;
  const domains = Array.isArray(summary?.challengeDomains) ? summary.challengeDomains : [];
  const allCandidates = domains
    .filter((entry) => entry.count >= minWords)
    .sort((a, b) => {
      const usageDelta = usageCountFor(a.key) - usageCountFor(b.key);
      if (usageDelta) return usageDelta;
      return b.count - a.count || String(a.key || "").localeCompare(String(b.key || ""), "fr");
    });
  const nonExcludedCandidates = allCandidates.filter((entry) => !excludedThemes.has(normalizeThemeKey(entry.key)));
  const candidates = nonExcludedCandidates.length ? nonExcludedCandidates : allCandidates;
  const lowestUsage = candidates.length ? usageCountFor(candidates[0].key) : 0;
  const lowestUsageCandidates = candidates.filter((entry) => usageCountFor(entry.key) === lowestUsage);
  const picked = lowestUsageCandidates.length
    ? lowestUsageCandidates[Math.abs(seed) % lowestUsageCandidates.length]
    : null;
  if (!picked?.key || picked.count < minWords) return null;
  const words = Array.isArray(picked.words) ? picked.words.slice(0, maxWords) : [];
  if (words.length < minWords) return null;
  const requiredCount = Math.min(words.length, Math.max(2, Math.ceil(words.length * completionRatio)));
  return {
    type: "lexical_domain",
    theme: picked.key,
    count: words.length,
    requiredCount,
    completionRatio,
    words,
    line: `Cette grille contient ${words.length} termes liés ${formatDomainForSentence(picked.key)}.`,
  };
}
