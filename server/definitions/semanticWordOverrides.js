const OVERRIDES = new Map([
  [
    "LOUP",
    {
      word: "LOUP",
      key: "LOUP",
      title: "loup",
      definitions: [
        "Mammifère carnivore sauvage de la famille des canidés, proche du chien.",
      ],
      definition: "Mammifère carnivore sauvage de la famille des canidés, proche du chien.",
      partOfSpeech: ["nom"],
      lexicalDomains: ["zoologie"],
      categories: ["Loups en français", "Canidés en français", "Mammifères en français"],
      semanticRelations: {
        hypernyms: ["animal", "mammifère", "canidé", "carnivore"],
      },
      gameSemanticThemes: [
        {
          id: "animaux",
          label: "animaux",
          score: 24,
          confidence: "high",
          sources: ["override:homograph", "definition:mammifere", "definition:carnivore", "category:mammiferes"],
        },
      ],
    },
  ],
]);

function uniqueStrings(...lists) {
  const out = [];
  for (const list of lists) {
    for (const value of Array.isArray(list) ? list : []) {
      const clean = String(value || "").trim();
      if (clean && !out.includes(clean)) out.push(clean);
    }
  }
  return out;
}

function mergeRelations(base, override) {
  const merged = { ...(base && typeof base === "object" ? base : {}) };
  for (const [key, values] of Object.entries(override && typeof override === "object" ? override : {})) {
    merged[key] = uniqueStrings(merged[key], values);
  }
  return merged;
}

export function getSemanticWordOverride(key) {
  return OVERRIDES.get(String(key || "").trim().toUpperCase()) || null;
}

export function mergeSemanticWordOverride(entry, override) {
  if (!override) return entry;
  if (!entry) return { ...override };
  return {
    ...entry,
    title: override.title || entry.title,
    definition: override.definition || entry.definition,
    definitions: uniqueStrings(override.definitions, entry.definitions),
    partOfSpeech: uniqueStrings(override.partOfSpeech, entry.partOfSpeech),
    lexicalDomains: uniqueStrings(override.lexicalDomains, entry.lexicalDomains),
    categories: uniqueStrings(override.categories, entry.categories),
    semanticRelations: mergeRelations(entry.semanticRelations, override.semanticRelations),
    gameSemanticThemes: [...(override.gameSemanticThemes || []), ...(entry.gameSemanticThemes || [])],
    isFormOf: entry.isFormOf,
    formOf: entry.formOf,
  };
}
