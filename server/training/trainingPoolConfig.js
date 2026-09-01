import {
  FAKE_TWINS_MIN_WORD_LENGTH,
  FAKE_TWINS_TYPE,
} from "../../shared/gameLogic.js";
import {
  FINALE_DESCRIPTION,
  FINALE_MIN_TOTAL_SCORE,
  FINALE_TILE_BONUS_MULTIPLIER,
  FINALE_TYPE,
  getFinaleMinWords,
} from "../../shared/finaleRules.js";

export const TRAINING_GRID_SIZE = 4;
export const TRAINING_BASE_MIN_WORDS = 150;
export const TRAINING_POOL_SCHEMA_VERSION = 1;
export const TRAINING_POOL_GENERATOR_VERSION = "training-pool-v1";

export const TRAINING_MODE_SELF_SPECIALS_3 = "self_specials_3_words";
export const TRAINING_MODE_MASSIVE_BOGGLE = "massive_boggle";

const SPECIAL_QUALITY_ATTEMPTS = 220;
const MONSTROUS_QUALITY_ATTEMPTS = 320;

export const TRAINING_POOL_MODES = Object.freeze([
  { value: "normal", label: "Classique" },
  { value: FINALE_TYPE, label: "Finale · bonus ×2" },
  { value: TRAINING_MODE_SELF_SPECIALS_3, label: "3 mots" },
  { value: "speed", label: "Rapidité" },
  { value: "monstrous", label: "Grille monstrueuse" },
  { value: "target_long", label: "Mot le plus long" },
  { value: "target_score", label: "Meilleur mot" },
  { value: "bonus_letter", label: "Lettre en or" },
  { value: TRAINING_MODE_MASSIVE_BOGGLE, label: "Massive Boggle" },
  { value: FAKE_TWINS_TYPE, label: "Faux jumeaux" },
]);

const TRAINING_MODE_SET = new Set(TRAINING_POOL_MODES.map((entry) => entry.value));

export function isTrainingPoolMode(value) {
  return TRAINING_MODE_SET.has(String(value || "").trim());
}

export function getTrainingPoolModeLabel(value) {
  const mode = String(value || "").trim();
  return TRAINING_POOL_MODES.find((entry) => entry.value === mode)?.label || mode;
}

export function createTrainingRoomConfig() {
  return {
    label: "Entraînement 4×4",
    gridSize: TRAINING_GRID_SIZE,
    durationMs: 2 * 60 * 1000,
    breakMs: 45 * 1000,
    minWords: TRAINING_BASE_MIN_WORDS,
    qualityAttempts: 50,
  };
}

export function buildTrainingPoolRoundPlan(rawMode, roomConfig = createTrainingRoomConfig()) {
  const mode = String(rawMode || "").trim();
  if (!isTrainingPoolMode(mode)) return null;
  const base = {
    roundNumber: 1,
    gridSize: TRAINING_GRID_SIZE,
    isSpecial: mode !== "normal",
    type: mode,
    label: getTrainingPoolModeLabel(mode),
    description: null,
    minWords: Number(roomConfig?.minWords) || TRAINING_BASE_MIN_WORDS,
  };

  switch (mode) {
    case FINALE_TYPE:
      return {
        ...base,
        description: FINALE_DESCRIPTION,
        minWords: getFinaleMinWords(base.minWords),
        minTotalScore: FINALE_MIN_TOTAL_SCORE,
        tileBonusMultiplier: FINALE_TILE_BONUS_MULTIPLIER,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case TRAINING_MODE_SELF_SPECIALS_3:
      return {
        ...base,
        description:
          "Glisse les 4 tuiles spéciales sur la grille et compose 3 mots avec des tuiles de départ différentes",
        disableBonuses: true,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case "speed":
      return {
        ...base,
        label: "Manche rapidité",
        description: "Tous les mots valent 11 pts, on vise la rafale",
        minWords: 300,
        fixedWordScore: 11,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case "monstrous":
      return {
        ...base,
        description: "Grille chargée en mots très longs et gros score potentiel",
        minWords: base.minWords + 50,
        minTotalScore: 4000,
        minLongWordLen: 10,
        minLongWordCount: 3,
        qualityAttempts: MONSTROUS_QUALITY_ATTEMPTS,
      };
    case "target_long":
      return {
        ...base,
        description: "Trouve le mot le plus long (indices progressifs pendant la manche)",
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case "target_score":
      return {
        ...base,
        description:
          "Trouve le meilleur mot (celui qui rapporte le plus de points, indices progressifs)",
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case "bonus_letter":
      return {
        ...base,
        description: "Une lettre vaut 20 pts",
        bonusLetterScore: 20,
        bonusLetterMinWords: 30,
        disableBonuses: true,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case TRAINING_MODE_MASSIVE_BOGGLE:
      return {
        ...base,
        description: "Mots de 3+ lettres, bonus de tuiles désactivés",
        minWords: 200,
        minLongWordLen: 8,
        minLongWordCount: 3,
        minWordLength: 3,
        classicBoggleScoring: true,
        disableBonuses: true,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case FAKE_TWINS_TYPE:
      return {
        ...base,
        description:
          "Une case de la grille peut valoir l'une ou l'autre de deux lettres. Les mots de 2 lettres ou plus sont valides",
        minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
        disableBonuses: true,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    case "normal":
    default:
      return {
        ...base,
        label: "Manche classique",
      };
  }
}
