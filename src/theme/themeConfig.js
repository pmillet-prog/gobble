function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const TILE_LETTER_SCALE_MIN = 0.8;
const TILE_LETTER_SCALE_MAX = 1.45;
const TILE_LETTER_SCALE_DEFAULT = 1.2;

function normalizeTileLetterScale(value, fallback = TILE_LETTER_SCALE_DEFAULT) {
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : TILE_LETTER_SCALE_DEFAULT;
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return clampValue(base, TILE_LETTER_SCALE_MIN, TILE_LETTER_SCALE_MAX);
  }
  return clampValue(raw, TILE_LETTER_SCALE_MIN, TILE_LETTER_SCALE_MAX);
}

function getThemeCategoryValue(theme, category) {
  if (!theme || typeof theme !== "object") return undefined;
  if (category === "tileColor") return theme.tileColor;
  if (category === "font") return theme.font;
  if (category === "letterScale")
    return normalizeTileLetterScale(theme.letterScale, TILE_LETTER_SCALE_DEFAULT);
  if (category === "letterColor") return theme.letterColor;
  if (category === "background") return theme.background;
  if (category === "material") return theme.material;
  if (category === "specialIndicator") return theme.specialIndicator;
  if (category === "uiContrast") return theme.uiContrast;
  if (category === "darkMode") return !!theme.darkMode;
  return undefined;
}

function getTileMaterialClass(materialPreset) {
  if (materialPreset === "native") return "";
  if (materialPreset === "bubble") return "theme-material-bubble";
  if (materialPreset === "rounded-square") return "theme-material-rounded-square";
  if (materialPreset === "square") return "theme-material-square";
  return "theme-material-classic";
}

function getTileColorTextureStyle(index, size, tileColorPreset) {
  const tileColorMeta = TILE_COLOR_MAP[tileColorPreset];
  if (!tileColorMeta?.texture) return null;
  const safeSize = Number.isInteger(size) && size > 0 ? size : 4;
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
  const row = Math.floor(safeIndex / safeSize);
  const col = safeIndex % safeSize;
  const denom = Math.max(1, safeSize - 1);
  const x = (col / denom) * 100;
  const y = (row / denom) * 100;
  return {
    backgroundImage: `url("${tileColorMeta.texture}")`,
    backgroundSize: `${safeSize * 100}% ${safeSize * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: "no-repeat",
    backgroundBlendMode: "multiply",
  };
}

function getTileColorSwatchStyle(tileColorOption) {
  if (!tileColorOption || typeof tileColorOption !== "object") return {};
  const borderColor = "rgba(0, 0, 0, 0.22)";
  if (tileColorOption.texture) {
    return {
      backgroundColor: tileColorOption.bg || "#ffffff",
      backgroundImage: `url("${tileColorOption.texture}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      borderColor,
    };
  }
  return {
    background: tileColorOption.bg || "#ffffff",
    borderColor,
  };
}

const THEME_UNLOCK_COST_DEFAULT = 500;
const THEME_LOCKABLE_CATEGORIES = [
  "tileColor",
  "font",
  "letterColor",
  "background",
  "material",
  "specialIndicator",
];
const TILE_COLOR_OPTIONS = [
  { id: "native", label: "Classique", bg: "#fed7aa", border: "#f97316" },
  { id: "white", label: "Blanc", bg: "#ffffff", border: "#d1d5db" },
  { id: "amber", label: "Ambre", bg: "#fdba74", border: "#f97316" },
  { id: "sand", label: "Sable", bg: "#f3d9b1", border: "#c69253" },
  { id: "ivory", label: "Ivoire", bg: "#f8f5e9", border: "#cabf9f" },
  { id: "mint", label: "Menthe", bg: "#b7e4c7", border: "#52b788" },
  { id: "ocean", label: "Océan", bg: "#8ecae6", border: "#219ebc" },
  { id: "lavender", label: "Lavande", bg: "#cdb4db", border: "#9d4edd" },
  { id: "rose", label: "Rose", bg: "#ffc8dd", border: "#ff7096" },
  { id: "slate", label: "Ardoise", bg: "#94a3b8", border: "#475569" },
  { id: "charcoal", label: "Charbon", bg: "#334155", border: "#0f172a" },
  { id: "neon", label: "Néon", bg: "#99f6e4", border: "#0d9488" },
  { id: "wood", label: "Bois", bg: "#d8b68a", border: "#8b5a2b", texture: "/textures/bois.png" },
  { id: "marble", label: "Marbre", bg: "#f3f4f6", border: "#9ca3af", texture: "/textures/marbre.jpg" },
  { id: "jeans", label: "Jeans", bg: "#9bb3d6", border: "#355c9a", texture: "/textures/jeans.jpg" },
  { id: "concrete", label: "Béton", bg: "#d1d5db", border: "#6b7280", texture: "/textures/beton.jpg" },
];
const FONT_OPTIONS = [
  {
    id: "classic",
    label: "Classique",
    family: "\"Avenir Next\", \"Trebuchet MS\", \"Segoe UI\", \"Roboto\", sans-serif",
  },
  {
    id: "serif",
    label: "Serif",
    family: "\"Georgia\", \"Times New Roman\", serif",
  },
  {
    id: "rounded",
    label: "Arrondie",
    family:
      "\"Chalkboard SE\", \"Comic Sans MS\", ui-rounded, \"SF Pro Rounded\", \"Nunito\", \"Quicksand\", \"Arial Rounded MT Bold\", \"Segoe UI\", sans-serif",
  },
  { id: "mono", label: "Monospace", family: "\"Consolas\", \"Courier New\", monospace" },
  {
    id: "kgp",
    label: "KGP",
    family:
      "\"GobblePerfectPen\", \"KGPerfectPenmanship\", \"Segoe Print\", cursive",
  },
  {
    id: "display",
    label: "Display",
    family:
      "\"GobbleMinecraft\", \"Bebas Neue\", \"Arial Black\", \"Franklin Gothic Heavy\", \"Impact\", \"Roboto Condensed\", \"Haettenschweiler\", sans-serif",
  },
  {
    id: "draft",
    label: "Draft",
    family: "\"GobbleDraft\", \"GobbleColleged\", \"Georgia\", serif",
  },
  {
    id: "starwars",
    label: "star wars",
    family: "\"GobbleStarWars\", \"GobbleMinecraft\", \"Arial Black\", sans-serif",
  },
];
const LETTER_COLOR_OPTIONS = [
  { id: "slate", label: "Ardoise", value: "#0f172a" },
  { id: "white", label: "Blanc", value: "#ffffff" },
  { id: "ink", label: "Encre", value: "#111827" },
  { id: "navy", label: "Bleu nuit", value: "#1e3a8a" },
  { id: "emerald", label: "Vert pin", value: "#065f46" },
  { id: "choco", label: "Brun", value: "#4a2c0d" },
  { id: "burgundy", label: "Bordeaux", value: "#7f1d1d" },
  { id: "violet", label: "Violet", value: "#6d28d9" },
  { id: "teal", label: "Canard", value: "#0f766e" },
  { id: "coral", label: "Corail", value: "#c2410c" },
  { id: "gold", label: "Or", value: "#a16207" },
];
const BACKGROUND_OPTIONS = [
  { id: "app-default", label: "Interface actuelle", style: {}, native: true },
  { id: "solid-white", label: "Blanc", style: { color: "#ffffff", image: "none", size: "auto" } },
  { id: "solid-sky", label: "Ciel", style: { color: "#dbeafe", image: "none", size: "auto" } },
  { id: "solid-forest", label: "Forêt", style: { color: "#dcfce7", image: "none", size: "auto" } },
  { id: "solid-night", label: "Nuit", style: { color: "#1e293b", image: "none", size: "auto" } },
  { id: "solid-sand", label: "Sable", style: { color: "#fef3c7", image: "none", size: "auto" } },
  { id: "solid-rose", label: "Rose", style: { color: "#ffe4e6", image: "none", size: "auto" } },
  {
    id: "paper-letters",
    label: "Papier lettres",
    style: {
      color: "#fff7ed",
      image:
        "radial-gradient(circle at 12px 12px, rgba(15,23,42,0.07) 1px, transparent 1px), radial-gradient(circle at 32px 32px, rgba(15,23,42,0.06) 1px, transparent 1px)",
      size: "44px 44px",
    },
  },
  {
    id: "paper-hearts",
    label: "Papier coeurs",
    style: {
      color: "#fff1f2",
      image:
        "radial-gradient(circle at 10px 10px, rgba(244,63,94,0.18) 2px, transparent 3px), radial-gradient(circle at 28px 20px, rgba(244,63,94,0.15) 2px, transparent 3px)",
      size: "40px 40px",
    },
  },
  {
    id: "paper-stars",
    label: "Papier étoiles",
    style: {
      color: "#eef2ff",
      image:
        "radial-gradient(circle at 6px 6px, rgba(99,102,241,0.22) 1.5px, transparent 2px), radial-gradient(circle at 20px 24px, rgba(99,102,241,0.16) 1.5px, transparent 2px)",
      size: "32px 32px",
    },
  },
  {
    id: "paper-bubbles",
    label: "Papier bulles",
    style: {
      color: "#ecfeff",
      image:
        "radial-gradient(circle at 18px 18px, rgba(6,182,212,0.14) 8px, transparent 9px), radial-gradient(circle at 46px 30px, rgba(6,182,212,0.1) 6px, transparent 7px)",
      size: "64px 64px",
    },
  },
  {
    id: "paper-confetti",
    label: "Papier confettis",
    style: {
      color: "#fff7ed",
      image:
        "radial-gradient(circle at 12px 8px, rgba(217,119,6,0.25) 2px, transparent 2px), radial-gradient(circle at 28px 20px, rgba(5,150,105,0.25) 2px, transparent 2px), radial-gradient(circle at 42px 12px, rgba(220,38,38,0.25) 2px, transparent 2px)",
      size: "56px 32px",
    },
  },
];
const MATERIAL_OPTIONS = [
  { id: "native", label: "Classique" },
  { id: "bubble", label: "Bulle" },
  { id: "rounded-square", label: "Carré arrondi" },
  { id: "square", label: "Carré plein" },
];
const SPECIAL_INDICATOR_OPTIONS = [
  { id: "fill", label: "Tuile colorée" },
  { id: "ring", label: "Lettre" },
  { id: "badge", label: "Pastille" },
];
const UI_CONTRAST_OPTIONS = [
  { id: "normal", label: "Normal" },
  { id: "soft", label: "Doux" },
  { id: "strong", label: "Fort" },
];
const GRID_SURFACE_OPTIONS = [
  { id: "white", label: "Blanc", value: "#ffffff" },
  { id: "cream", label: "Crème", value: "#fff7ed" },
  { id: "sky", label: "Bleu clair", value: "#e0f2fe" },
  { id: "mint", label: "Menthe", value: "#ecfdf5" },
  { id: "sand", label: "Sable", value: "#fef3c7" },
  { id: "slate", label: "Ardoise", value: "#e2e8f0" },
];
const DEFAULT_THEME_PRESET = {
  darkMode: false,
  tileColor: "native",
  font: "classic",
  letterScale: TILE_LETTER_SCALE_DEFAULT,
  letterColor: "slate",
  background: "app-default",
  gridSurface: "white",
  material: "native",
  specialIndicator: "fill",
  uiContrast: "normal",
};
const TILE_COLOR_MAP = Object.fromEntries(TILE_COLOR_OPTIONS.map((entry) => [entry.id, entry]));
const FONT_MAP = Object.fromEntries(FONT_OPTIONS.map((entry) => [entry.id, entry]));
const LETTER_COLOR_MAP = Object.fromEntries(LETTER_COLOR_OPTIONS.map((entry) => [entry.id, entry]));
const BACKGROUND_MAP = Object.fromEntries(BACKGROUND_OPTIONS.map((entry) => [entry.id, entry]));
const MATERIAL_MAP = Object.fromEntries(MATERIAL_OPTIONS.map((entry) => [entry.id, entry]));
const SPECIAL_INDICATOR_MAP = Object.fromEntries(
  SPECIAL_INDICATOR_OPTIONS.map((entry) => [entry.id, entry])
);
const UI_CONTRAST_MAP = Object.fromEntries(UI_CONTRAST_OPTIONS.map((entry) => [entry.id, entry]));
const GRID_SURFACE_MAP = Object.fromEntries(GRID_SURFACE_OPTIONS.map((entry) => [entry.id, entry]));
const THEME_PRESET_CATEGORIES = [
  "darkMode",
  "tileColor",
  "font",
  "letterScale",
  "letterColor",
  "background",
  "gridSurface",
  "material",
  "specialIndicator",
  "uiContrast",
];
const THEME_PICKER_OPTIONS = {
  tileColor: TILE_COLOR_OPTIONS,
  font: FONT_OPTIONS,
  letterColor: LETTER_COLOR_OPTIONS,
  background: BACKGROUND_OPTIONS,
  gridSurface: GRID_SURFACE_OPTIONS,
  material: MATERIAL_OPTIONS,
  specialIndicator: SPECIAL_INDICATOR_OPTIONS,
  uiContrast: UI_CONTRAST_OPTIONS,
};
const THEME_PICKER_LABELS = {
  tileColor: "Couleur de tuile",
  font: "Police",
  letterScale: "Taille des lettres",
  letterColor: "Couleur de lettre",
  background: "Couleur de fond",
  gridSurface: "Fond de grille",
  material: "Forme",
  specialIndicator: "Indicateur spécial",
  uiContrast: "Contraste",
};

function getThemeUnlockItemKey(category, optionId) {
  return `${String(category || "").trim()}:${String(optionId || "").trim()}`;
}

function isThemeCategoryLockableGlobal(category) {
  return THEME_LOCKABLE_CATEGORIES.includes(String(category || "").trim());
}

function isThemeOptionIdKnown(category, optionId) {
  const key = String(category || "").trim();
  const target = String(optionId || "").trim();
  const options = THEME_PICKER_OPTIONS[key];
  if (!Array.isArray(options)) return false;
  return options.some((entry) => String(entry?.id || "") === target);
}

function isThemeOptionLockableGlobal(category, optionId) {
  const key = String(category || "").trim();
  const target = String(optionId || "").trim();
  if (!isThemeCategoryLockableGlobal(key)) return false;
  if (!isThemeOptionIdKnown(key, target)) return false;
  return String(DEFAULT_THEME_PRESET[key] || "") !== target;
}

function isThemeOptionUnlockedFromMap(unlocks, category, optionId) {
  if (!isThemeOptionLockableGlobal(category, optionId)) return true;
  const unlockKey = getThemeUnlockItemKey(category, optionId);
  return !!unlocks?.[unlockKey];
}
function normalizeThemePreset(rawTheme = {}) {
  const source = rawTheme && typeof rawTheme === "object" ? rawTheme : {};
  const migratedFont =
    source.font === "script" ||
    source.font === "warning" ||
    source.font === "danger" ||
    source.font === "bubble"
      ? "draft"
      : source.font;
  const legacyMaterial = String(source.material || "");
  const migratedTileColor =
    TILE_COLOR_MAP[source.tileColor]
      ? source.tileColor
      : legacyMaterial === "wood"
      ? "wood"
      : DEFAULT_THEME_PRESET.tileColor;
  const migratedMaterial =
    legacyMaterial === "bubble" ||
    legacyMaterial === "square" ||
    legacyMaterial === "rounded-square" ||
    legacyMaterial === "native"
      ? legacyMaterial
      : legacyMaterial === "classic"
      ? "native"
      : DEFAULT_THEME_PRESET.material;
  const out = {
    darkMode:
      typeof source.darkMode === "boolean" ? source.darkMode : DEFAULT_THEME_PRESET.darkMode,
    tileColor: migratedTileColor,
    font: FONT_MAP[migratedFont] ? migratedFont : DEFAULT_THEME_PRESET.font,
    letterScale: normalizeTileLetterScale(source.letterScale, DEFAULT_THEME_PRESET.letterScale),
    letterColor: LETTER_COLOR_MAP[source.letterColor]
      ? source.letterColor
      : DEFAULT_THEME_PRESET.letterColor,
    background: BACKGROUND_MAP[source.background]
      ? source.background
      : DEFAULT_THEME_PRESET.background,
    gridSurface: GRID_SURFACE_MAP[source.gridSurface]
      ? source.gridSurface
      : DEFAULT_THEME_PRESET.gridSurface,
    material: MATERIAL_MAP[migratedMaterial] ? migratedMaterial : DEFAULT_THEME_PRESET.material,
    specialIndicator: SPECIAL_INDICATOR_MAP[source.specialIndicator]
      ? source.specialIndicator
      : DEFAULT_THEME_PRESET.specialIndicator,
    uiContrast: UI_CONTRAST_MAP[source.uiContrast]
      ? source.uiContrast
      : DEFAULT_THEME_PRESET.uiContrast,
  };
  return out;
}

function normalizeThemeUnlocks(rawUnlocks = {}, rawTheme = {}) {
  const source = rawUnlocks && typeof rawUnlocks === "object" ? rawUnlocks : {};
  const safeTheme = normalizeThemePreset(rawTheme);
  const out = {};
  const sourceItems =
    source.items && typeof source.items === "object" ? source.items : source;
  for (const category of THEME_LOCKABLE_CATEGORIES) {
    if (source[category] === true) {
      const optionId = String(
        safeTheme?.[category] ?? DEFAULT_THEME_PRESET[category] ?? ""
      ).trim();
      if (isThemeOptionLockableGlobal(category, optionId)) {
        out[getThemeUnlockItemKey(category, optionId)] = true;
      }
    }
  }
  for (const [rawKey, rawVal] of Object.entries(sourceItems)) {
    if (!rawVal) continue;
    const key = String(rawKey || "").trim();
    const sep = key.indexOf(":");
    if (sep <= 0 || sep >= key.length - 1) continue;
    const category = key.slice(0, sep);
    const optionId = key.slice(sep + 1);
    if (!isThemeOptionLockableGlobal(category, optionId)) continue;
    out[getThemeUnlockItemKey(category, optionId)] = true;
  }
  return out;
}

function hasAnyThemeUnlock(unlocks = {}) {
  return Object.values(unlocks || {}).some(Boolean);
}

function coerceThemeToLegacyNativeDefault(rawTheme = {}, rawUnlocks = {}) {
  let safeTheme = normalizeThemePreset(rawTheme);
  const safeUnlocks = normalizeThemeUnlocks(rawUnlocks, safeTheme);
  const hasUnlocks = hasAnyThemeUnlock(safeUnlocks);
  const looksLikeOldDefault =
    safeTheme.tileColor === "amber" &&
    safeTheme.background === "solid-sky" &&
    (safeTheme.material === "classic" || safeTheme.material === "native") &&
    safeTheme.specialIndicator === "fill" &&
    safeTheme.font === "classic" &&
    safeTheme.letterColor === "slate" &&
    safeTheme.uiContrast === "normal";
  if (!hasUnlocks && looksLikeOldDefault) {
    safeTheme = {
      ...safeTheme,
      tileColor: "native",
      background: "app-default",
      material: "native",
    };
  }
  // Hard guard: a locked option must stay on default applied value.
  const enforcedTheme = { ...safeTheme };
  for (const category of THEME_LOCKABLE_CATEGORIES) {
    const selectedOptionId = enforcedTheme[category];
    if (!isThemeOptionUnlockedFromMap(safeUnlocks, category, selectedOptionId)) {
      enforcedTheme[category] = DEFAULT_THEME_PRESET[category];
    }
  }
  return normalizeThemePreset(enforcedTheme);
}

export {
  TILE_LETTER_SCALE_MIN,
  TILE_LETTER_SCALE_MAX,
  TILE_LETTER_SCALE_DEFAULT,
  normalizeTileLetterScale,
  getThemeCategoryValue,
  getTileMaterialClass,
  getTileColorTextureStyle,
  getTileColorSwatchStyle,
  THEME_UNLOCK_COST_DEFAULT,
  THEME_LOCKABLE_CATEGORIES,
  TILE_COLOR_OPTIONS,
  FONT_OPTIONS,
  LETTER_COLOR_OPTIONS,
  BACKGROUND_OPTIONS,
  MATERIAL_OPTIONS,
  SPECIAL_INDICATOR_OPTIONS,
  UI_CONTRAST_OPTIONS,
  GRID_SURFACE_OPTIONS,
  DEFAULT_THEME_PRESET,
  TILE_COLOR_MAP,
  FONT_MAP,
  LETTER_COLOR_MAP,
  BACKGROUND_MAP,
  MATERIAL_MAP,
  SPECIAL_INDICATOR_MAP,
  UI_CONTRAST_MAP,
  GRID_SURFACE_MAP,
  THEME_PRESET_CATEGORIES,
  THEME_PICKER_OPTIONS,
  THEME_PICKER_LABELS,
  getThemeUnlockItemKey,
  isThemeCategoryLockableGlobal,
  isThemeOptionIdKnown,
  isThemeOptionLockableGlobal,
  isThemeOptionUnlockedFromMap,
  normalizeThemePreset,
  normalizeThemeUnlocks,
  hasAnyThemeUnlock,
  coerceThemeToLegacyNativeDefault,
};
