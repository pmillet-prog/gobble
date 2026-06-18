function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TERM_PATTERN_CACHE = new Map();

function termPattern(clean) {
  if (!clean) return null;
  const hit = TERM_PATTERN_CACHE.get(clean);
  if (hit) return hit;
  const pattern = new RegExp(`(^|[^a-z])${escapeRegExp(clean)}s?([^a-z]|$)`);
  TERM_PATTERN_CACHE.set(clean, pattern);
  return pattern;
}

function hasAny(text, words) {
  return words.some((word) => {
    const clean = normalizeText(word);
    const pattern = termPattern(clean);
    return !!pattern && pattern.test(text);
  });
}

function matchingTerms(text, words, max = 8) {
  const matches = [];
  for (const word of words || []) {
    if (matches.length >= max) break;
    if (hasAny(text, [word])) matches.push(normalizeText(word));
  }
  return matches;
}

const THEME_RULES = Object.freeze([
  {
    id: "animaux",
    label: "animaux",
    domains: ["zoologie", "ornithologie", "entomologie", "ichtyologie", "mammalogie", "veterinaire"],
    categories: [
      "animaux",
      "zoologie",
      "oiseaux",
      "insectes",
      "poissons",
      "mammiferes",
      "reptiles",
      "amphibiens",
      "mollusques",
      "crustaces",
    ],
    strong: [
      "animal",
      "oiseau",
      "poisson",
      "mammifere",
      "insecte",
      "reptile",
      "amphibien",
      "carnivore",
      "herbivore",
      "cetace",
      "batracien",
      "crustace",
      "mollusque",
      "larve",
      "chien",
      "chat",
      "cheval",
      "serpent",
      "papillon",
      "mouche",
      "oiselet",
      "coquille",
      "nageoire",
    ],
  },
  {
    id: "plantes",
    label: "plantes",
    domains: ["botanique", "horticulture", "agriculture", "sylviculture", "jardinage"],
    categories: ["botanique", "plantes", "arbres", "fleurs", "fruits", "legumes", "cereales"],
    strong: [
      "plante",
      "vegetal",
      "arbre",
      "arbuste",
      "fleur",
      "fruit",
      "feuille",
      "racine",
      "tige",
      "graine",
      "pollen",
      "cereale",
      "herbe",
      "graminee",
      "champignon",
      "algue",
    ],
  },
  {
    id: "navigation",
    label: "navigation",
    domains: ["marine", "navigation", "peche", "sports nautiques", "nautisme"],
    categories: ["marine", "navigation", "bateaux", "navires", "peche"],
    strong: [
      "navire",
      "bateau",
      "embarcation",
      "voilier",
      "marin",
      "maritime",
      "nautique",
      "port",
      "ancre",
      "voile",
      "cordage",
      "mat",
      "coque",
      "pont",
      "gouvernail",
      "chalut",
      "peche",
      "mer",
      "rivage",
      "amarre",
    ],
  },
  {
    id: "cuisine",
    label: "cuisine",
    domains: ["cuisine", "gastronomie", "alimentation", "boucherie", "patisserie", "boisson"],
    categories: ["cuisine", "aliments", "gastronomie", "boissons", "fromages", "patisseries"],
    strong: [
      "aliment",
      "plat",
      "recette",
      "cuisine",
      "cuire",
      "cuisson",
      "sauce",
      "viande",
      "legume",
      "fromage",
      "boisson",
      "gateau",
      "patisserie",
      "farine",
      "sucre",
      "four",
      "poele",
      "manger",
    ],
  },
  {
    id: "medecine",
    label: "médecine",
    domains: ["medecine", "anatomie", "chirurgie", "pathologie", "pharmacie", "psychiatrie", "dentisterie"],
    categories: ["medecine", "anatomie", "maladies", "chirurgie", "pharmacie", "symptomes"],
    strong: [
      "maladie",
      "symptome",
      "patient",
      "medecin",
      "medical",
      "medicament",
      "traitement",
      "organe",
      "muscle",
      "os",
      "sang",
      "nerf",
      "chirurgie",
      "infection",
      "douleur",
      "diagnostic",
      "therapie",
    ],
  },
  {
    id: "corps",
    label: "corps humain",
    domains: ["anatomie", "physiologie"],
    categories: ["anatomie", "parties du corps", "organes"],
    strong: [
      "corps",
      "organe",
      "tete",
      "bras",
      "jambe",
      "main",
      "pied",
      "doigt",
      "oeil",
      "oreille",
      "bouche",
      "dent",
      "peau",
      "muscle",
      "os",
      "nerf",
      "sang",
      "coeur",
      "poumon",
    ],
  },
  {
    id: "musique",
    label: "musique",
    domains: ["musique"],
    categories: ["musique", "instruments de musique", "chant"],
    strong: [
      "musique",
      "musical",
      "instrument de musique",
      "melodie",
      "rythme",
      "chant",
      "chanson",
      "orchestre",
      "piano",
      "violon",
      "guitare",
      "flute",
      "tambour",
      "tonalite",
      "accord musical",
    ],
  },
  {
    id: "mathematiques",
    label: "mathématiques",
    domains: ["mathematiques", "geometrie", "arithmetique", "algebre", "statistiques"],
    categories: ["mathematiques", "geometrie", "arithmetique", "algebre", "statistiques"],
    strong: [
      "nombre",
      "calcul",
      "equation",
      "fonction mathematique",
      "geometrie",
      "angle",
      "triangle",
      "cercle",
      "matrice",
      "vecteur",
      "probabilite",
      "theoreme",
      "algebre",
      "derivee",
      "integrale",
    ],
  },
  {
    id: "informatique",
    label: "informatique",
    domains: ["informatique", "internet", "programmation", "telecommunications"],
    categories: ["informatique", "internet", "programmation", "logiciels"],
    strong: [
      "ordinateur",
      "logiciel",
      "programme informatique",
      "algorithme",
      "fichier",
      "serveur",
      "reseau",
      "internet",
      "donnee",
      "code",
      "clavier",
      "ecran",
      "numerique",
      "base de donnees",
    ],
  },
  {
    id: "batiment",
    label: "bâtiment",
    domains: ["architecture", "construction", "maconnerie", "menuiserie", "urbanisme"],
    categories: ["architecture", "construction", "batiments", "maconnerie"],
    strong: [
      "batiment",
      "maison",
      "mur",
      "toit",
      "pierre",
      "brique",
      "charpente",
      "colonne",
      "facade",
      "fenetre",
      "porte",
      "chantier",
      "architecte",
      "construction",
    ],
  },
  {
    id: "meubles",
    label: "meubles",
    domains: ["ameublement", "mobilier", "menuiserie"],
    categories: ["meubles", "mobilier", "ameublement"],
    strong: [
      "meuble",
      "mobilier",
      "table",
      "chaise",
      "fauteuil",
      "canape",
      "armoire",
      "commode",
      "bureau",
      "lit",
      "etagere",
      "tabouret",
      "tiroir",
    ],
  },
  {
    id: "vetements",
    label: "vêtements",
    domains: ["habillement", "vetement", "couture", "mode", "textile"],
    categories: ["vetements", "habillement", "mode", "textile"],
    strong: [
      "vetement",
      "habit",
      "tissu",
      "textile",
      "robe",
      "chemise",
      "pantalon",
      "manteau",
      "chaussure",
      "chapeau",
      "gant",
      "jupe",
      "couture",
      "porter",
    ],
  },
  {
    id: "outils",
    label: "outils",
    domains: ["outil", "bricolage", "menuiserie", "mecanique", "jardinage"],
    categories: ["outils", "bricolage", "mecanique"],
    strong: [
      "outil",
      "instrument",
      "marteau",
      "scie",
      "tournevis",
      "cle",
      "pince",
      "lime",
      "rabot",
      "foret",
      "machine",
      "appareil",
      "ustensile",
    ],
  },
  {
    id: "vehicules",
    label: "véhicules",
    domains: ["automobile", "transport", "chemin de fer", "aviation", "aeronautique"],
    categories: ["vehicules", "automobile", "transport", "aviation", "chemins de fer"],
    strong: [
      "vehicule",
      "voiture",
      "camion",
      "train",
      "wagon",
      "avion",
      "moteur",
      "roue",
      "route",
      "conducteur",
      "transport",
      "automobile",
      "aeronef",
      "locomotive",
    ],
  },
  {
    id: "meteo",
    label: "météo",
    domains: ["meteorologie", "climatologie"],
    categories: ["meteorologie", "climat", "vents"],
    strong: [
      "temps qu'il fait",
      "meteo",
      "climat",
      "pluie",
      "vent",
      "orage",
      "neige",
      "nuage",
      "temperature",
      "soleil",
      "brouillard",
      "gel",
      "canicule",
    ],
  },
  {
    id: "geographie",
    label: "géographie",
    domains: ["geographie", "toponymie", "geologie"],
    categories: ["geographie", "toponymes", "relief", "cours d'eau"],
    strong: [
      "pays",
      "ville",
      "region",
      "montagne",
      "fleuve",
      "riviere",
      "ile",
      "continent",
      "vallee",
      "plaine",
      "littoral",
      "territoire",
      "geographique",
    ],
  },
  {
    id: "arts",
    label: "arts",
    domains: ["art", "peinture", "sculpture", "cinema", "theatre", "photographie"],
    categories: ["art", "peinture", "sculpture", "cinema", "theatre"],
    strong: [
      "art",
      "artiste",
      "peinture",
      "tableau",
      "sculpture",
      "dessin",
      "cinema",
      "film",
      "theatre",
      "scene",
      "photo",
      "image",
    ],
  },
  {
    id: "litterature",
    label: "littérature",
    domains: ["litterature", "poesie", "edition", "imprimerie"],
    categories: ["litterature", "poesie", "livres", "ecriture"],
    strong: [
      "livre",
      "roman",
      "poeme",
      "poesie",
      "auteur",
      "ecrivain",
      "texte",
      "recit",
      "vers",
      "edition",
      "imprimerie",
      "manuscrit",
    ],
  },
  {
    id: "sciences",
    label: "sciences",
    domains: ["physique", "chimie", "biologie", "astronomie", "geologie", "mineralogie"],
    categories: ["physique", "chimie", "biologie", "astronomie", "geologie", "sciences"],
    strong: [
      "molecule",
      "atome",
      "element chimique",
      "energie",
      "force",
      "planete",
      "etoile",
      "roche",
      "mineral",
      "cellule",
      "experience",
      "laboratoire",
      "scientifique",
      "reaction chimique",
    ],
  },
  {
    id: "droit",
    label: "droit",
    domains: ["droit", "justice", "administration"],
    categories: ["droit", "justice", "juridique"],
    strong: [
      "loi",
      "juridique",
      "tribunal",
      "juge",
      "justice",
      "contrat",
      "delit",
      "crime",
      "peine",
      "procedure",
      "avocat",
      "legal",
    ],
  },
  {
    id: "religion",
    label: "religion",
    domains: ["religion", "christianisme", "islam", "judaisme", "bouddhisme", "theologie"],
    categories: ["religion", "christianisme", "islam", "judaisme", "bouddhisme"],
    strong: [
      "dieu",
      "religion",
      "religieux",
      "eglise",
      "priere",
      "rite",
      "culte",
      "sacre",
      "saint",
      "pretre",
      "moine",
      "temple",
      "mosquee",
      "synagogue",
    ],
  },
  {
    id: "sport",
    label: "sport",
    domains: ["sport", "football", "tennis", "rugby", "cyclisme", "athletisme"],
    categories: ["sport", "football", "tennis", "rugby", "cyclisme"],
    strong: [
      "sport",
      "joueur",
      "match",
      "ballon",
      "equipe",
      "course",
      "stade",
      "but",
      "entrainement",
      "athlete",
      "tennis",
      "football",
      "rugby",
      "cyclisme",
    ],
  },
  {
    id: "militaire",
    label: "militaire",
    domains: ["militaire", "armement", "guerre"],
    categories: ["militaire", "armes", "guerre"],
    strong: [
      "militaire",
      "armee",
      "soldat",
      "arme",
      "guerre",
      "combat",
      "bataille",
      "canon",
      "fusil",
      "regiment",
      "officier",
      "fortification",
    ],
  },
  {
    id: "metiers",
    label: "métiers",
    domains: ["metier", "profession"],
    categories: ["metiers", "professions", "noms de metiers"],
    strong: [
      "metier",
      "profession",
      "personne qui exerce",
      "ouvrier",
      "artisan",
      "employe",
      "specialiste",
      "celui qui fabrique",
      "celle qui fabrique",
      "celui qui vend",
      "celle qui vend",
    ],
  },
  {
    id: "economie",
    label: "économie",
    domains: ["economie", "finance", "commerce", "comptabilite"],
    categories: ["economie", "finance", "commerce"],
    strong: [
      "argent",
      "prix",
      "vente",
      "achat",
      "commerce",
      "banque",
      "monnaie",
      "impot",
      "salaire",
      "capital",
      "marche",
      "entreprise",
      "financier",
    ],
  },
]);

function sourceLabel(kind, value) {
  const clean = normalizeText(value);
  return clean ? `${kind}:${clean}` : kind;
}

function scoreRule(rule, texts) {
  const sources = [];
  let score = 0;

  const domainHits = matchingTerms(texts.domainText, rule.domains, 6);
  if (domainHits.length) {
    score += 7 + Math.min(4, domainHits.length - 1);
    domainHits.forEach((hit) => sources.push(sourceLabel("domain", hit)));
  }

  const categoryHits = matchingTerms(texts.categoryText, rule.categories, 6);
  if (categoryHits.length) {
    score += 5 + Math.min(3, categoryHits.length - 1);
    categoryHits.forEach((hit) => sources.push(sourceLabel("category", hit)));
  }

  const definitionHits = matchingTerms(texts.definitionText, rule.strong, 8);
  if (definitionHits.length) {
    score += Math.min(10, definitionHits.length * 4);
    definitionHits.forEach((hit) => sources.push(sourceLabel("definition", hit)));
  }

  const relationHits = matchingTerms(texts.relationText, [...(rule.strong || []), ...(rule.domains || [])], 5);
  if (relationHits.length) {
    score += Math.min(4, relationHits.length * 2);
    relationHits.forEach((hit) => sources.push(sourceLabel("relation", hit)));
  }

  if (domainHits.length && definitionHits.length) score += 2;
  if (categoryHits.length && definitionHits.length) score += 1;

  const hasReliableSignal = domainHits.length || categoryHits.length || definitionHits.length;
  if (!hasReliableSignal || score < 6) return null;

  const uniqueSources = Array.from(new Set(sources)).slice(0, 10);
  return {
    id: rule.id,
    label: rule.label,
    score,
    confidence: score >= 11 || domainHits.length ? "high" : score >= 8 ? "medium" : "low",
    sources: uniqueSources,
  };
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

export function buildGameSemanticThemes(entry) {
  const definitions = Array.isArray(entry?.definitions)
    ? entry.definitions
    : entry?.definition
    ? [entry.definition]
    : [];
  const texts = {
    definitionText: normalizeText(definitions.join(" ")),
    domainText: normalizeText((Array.isArray(entry?.lexicalDomains) ? entry.lexicalDomains : []).join(" ")),
    categoryText: normalizeText((Array.isArray(entry?.categories) ? entry.categories : []).join(" ")),
    relationText: normalizeText(flattenRelations(entry?.semanticRelations).join(" ")),
  };

  return THEME_RULES.map((rule) => scoreRule(rule, texts))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"))
    .slice(0, 5);
}

export function normalizeGameSemanticThemes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const id = String(entry.id || "").trim();
        const label = String(entry.label || id).trim();
        const score = Math.max(0, Math.trunc(Number(entry.score) || 0));
        const confidence = String(entry.confidence || "").trim();
        const sources = Array.isArray(entry.sources)
          ? entry.sources.map((source) => String(source || "").trim()).filter(Boolean).slice(0, 10)
          : [];
        return id && label ? { id, label, score, confidence, sources } : null;
      }
      const label = String(entry || "").trim();
      return label ? { id: normalizeText(label).replace(/\s+/g, "_"), label, score: 0, confidence: "", sources: [] } : null;
    })
    .filter(Boolean);
}
