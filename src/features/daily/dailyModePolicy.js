import {
  DAILY_FAKE_TWINS_MODE,
  DAILY_FUTURE_SECTION,
  DAILY_MONSTROUS_MODE,
  DAILY_OVERVIEW_SECTION,
  DAILY_SPECIAL_MODE,
} from "../../components/daily/dailyModes.js";

export const DAILY_MODE_DEFINITIONS = Object.freeze({
  [DAILY_MONSTROUS_MODE]: Object.freeze({
    accentClass: "from-blue-500 via-cyan-500 to-sky-600",
    alreadyPlayedLabel: "Grille monstrueuse déjà jouée",
    buttonClass: "bg-blue-600 hover:bg-blue-500 text-white",
    description: "La grille principale du jour, riche en volume et en gros scores.",
    key: DAILY_MONSTROUS_MODE,
    label: "Grille monstrueuse",
    playedField: "hasPlayedMonstrous",
    resultField: "myMonstrousResult",
    shortLabel: "Monstrueuse",
    summaryLabel: "Monstrueuse",
  }),
  [DAILY_SPECIAL_MODE]: Object.freeze({
    accentClass: "from-emerald-500 via-green-500 to-lime-500",
    alreadyPlayedLabel: "Déjà joué",
    buttonClass: "bg-emerald-600 hover:bg-emerald-500 text-white",
    description: "Trois cartouches, peu d'essais, lecture rapide de la grille.",
    hideDesktopHubScore: true,
    key: DAILY_SPECIAL_MODE,
    label: "3 mots",
    playedField: "hasPlayedSpecial",
    resultField: "mySpecialResult",
    shortLabel: "3 mots",
    summaryLabel: "3 mots",
  }),
  [DAILY_FAKE_TWINS_MODE]: Object.freeze({
    accentClass: "from-teal-500 via-emerald-500 to-green-600",
    alreadyPlayedLabel: "Faux jumeaux déjà joué",
    buttonClass: "bg-teal-600 hover:bg-teal-500 text-white",
    description: "Une case vaut deux lettres possibles, avec les mots de 2 lettres et plus.",
    key: DAILY_FAKE_TWINS_MODE,
    label: "Faux jumeaux",
    playedField: "hasPlayedFakeTwins",
    resultField: "myFakeTwinsResult",
    shortLabel: "Faux jumeaux",
    summaryLabel: "Faux jumeaux",
  }),
});

export const DAILY_PLAYABLE_MODES = Object.freeze([
  DAILY_MONSTROUS_MODE,
  DAILY_SPECIAL_MODE,
  DAILY_FAKE_TWINS_MODE,
]);

const DAILY_NON_PLAYABLE_SECTIONS = Object.freeze({
  [DAILY_FUTURE_SECTION]: Object.freeze({
    accentClass: "from-amber-400 via-orange-400 to-rose-500",
    buttonClass: "bg-amber-500 hover:bg-amber-400 text-slate-900",
    description: "Nouveau format daily réservé pour la prochaine mise à jour.",
    key: DAILY_FUTURE_SECTION,
    label: "Grille à venir",
    shortLabel: "À venir",
  }),
  [DAILY_OVERVIEW_SECTION]: Object.freeze({
    accentClass: "from-slate-500 via-slate-600 to-slate-800",
    buttonClass: "bg-slate-700 hover:bg-slate-600 text-white",
    key: DAILY_OVERVIEW_SECTION,
    label: "Général",
    shortLabel: "Général",
  }),
});

export function isDailyMode(mode) {
  return Object.prototype.hasOwnProperty.call(DAILY_MODE_DEFINITIONS, mode);
}

export function normalizeDailyMode(mode, fallback = DAILY_MONSTROUS_MODE) {
  return isDailyMode(mode) ? mode : isDailyMode(fallback) ? fallback : DAILY_MONSTROUS_MODE;
}

export function getDailyModeDefinition(mode) {
  return DAILY_MODE_DEFINITIONS[normalizeDailyMode(mode)];
}

export function getDailySectionDefinition(section, { isMobileLayout = false } = {}) {
  if (isDailyMode(section)) return DAILY_MODE_DEFINITIONS[section];
  if (section === DAILY_FUTURE_SECTION) {
    return DAILY_NON_PLAYABLE_SECTIONS[DAILY_FUTURE_SECTION];
  }
  return {
    ...DAILY_NON_PLAYABLE_SECTIONS[DAILY_OVERVIEW_SECTION],
    description: isMobileLayout
      ? "Toutes les grilles du jour confondues."
      : "Toutes les grilles du jour confondues, pour garder une vue d'ensemble.",
  };
}

export function getDailyModeResult(mode, { dailyResult, dailyStatus } = {}) {
  if (!isDailyMode(mode)) return null;
  const definition = DAILY_MODE_DEFINITIONS[mode];
  return (
    dailyStatus?.[definition.resultField] ||
    (dailyResult?.mode === mode ? dailyResult : null)
  );
}

export function getDailyModeStatusPatch(mode, result, previous = {}) {
  const definition = getDailyModeDefinition(mode);
  return {
    [definition.playedField]: true,
    [definition.resultField]: result,
    hasPlayed: mode === DAILY_MONSTROUS_MODE ? true : previous?.hasPlayed,
    myResult: result,
  };
}

export function filterDailyEntriesForMode(entries, mode, { keepThresholds = false } = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const normalizedMode = normalizeDailyMode(mode);
  return safeEntries.filter(
    (entry) =>
      (keepThresholds && entry?.isPalier) ||
      normalizeDailyMode(entry?.mode) === normalizedMode
  );
}
