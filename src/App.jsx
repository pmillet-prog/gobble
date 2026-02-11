// Fichier UTF-8 : conserver les accents, emojis et règles de normalisation (??, etc.). Ne pas convertir d'encodage.
// 
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import confetti from "canvas-confetti";
import { resolveSoundSettings } from "./audio/equalizer";
import AssetManager from "./assets/assetManager";
import {
  IMAGE_KEYS,
  SFX_KEYS,
  makeIncrementalSfxKey,
  makeScoreSfxKey,
  makeScore2SfxKey,
} from "./assets/assetKeys";
import ASSET_MANIFEST_BASE from "./assets/assetManifest";
import AMBIENT_MUSIC_TRACKS_FALLBACK from "./audio/ambientDefaults.json";
import { createPortal } from "react-dom";
import socket from "./socket";
import LiveFeed, { buildMixedFeed } from "./components/LiveFeed.jsx";
import RankingWidgetMobile from "./components/RankingWidgetMobile.jsx";
import MobileChatWidget from "./components/MobileChatWidget.jsx";
import MobileGrid from "./components/MobileGrid.jsx";
import MobileHeader from "./components/MobileHeader.jsx";
import MobileWordPreview from "./components/MobileWordPreview.jsx";
import TutorialOverlay from "./components/TutorialOverlay.jsx";
import {
  computeScore,
  filterDictionary,
  findBestPathForWord,
  neighbors,
  normalizeWord,
  solveAll,
  summarizeBonuses,
  tileScore,
} from "./components/gameLogic";
import { generateGrid } from "./components/gridGeneration";


const ROOM_OPTIONS = {
  "room-4x4": { label: "Grille 4x4", gridSize: 4, duration: 120, breakSeconds: 45 },
};

const DEFAULT_DURATION = 120;
const COUNTDOWN = 0;
const TOURNAMENT_TOTAL_ROUNDS = 5;
const TOURNAMENT_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const FINAL_ROUND_RESULTS_SECONDS = 20;
const READY_LABEL = "Pr\u00eat \u00e0 jouer";
// Hauteur max de la liste des mots en fin de partie : on remplit davantage l'espace sans ?tirer toute la colonne
const WORDS_SCROLL_MAX_HEIGHT = "clamp(320px, calc(100vh - 280px), 720px)";
// Hauteur cible du bloc principal : clamp sur la fenêtre pour éviter les colonnes infinies en zoom/d?zoom
const MAIN_GRID_HEIGHT = "clamp(520px, 82vh, 880px)";
const KEYBOARD_INSET_THRESHOLD_PX = 80;
const CHAT_SHEET_HEIGHT_RATIO = 0.8;
const COLUMN_HEIGHT_STYLE = {
  height: MAIN_GRID_HEIGHT,
  maxHeight: MAIN_GRID_HEIGHT,
  minHeight: "520px",
};
const GRID_COL_TEMPLATE = "1.05fr 1.6fr 0.85fr 1.05fr";
const MIN_GRID_WIDTH = 260;
const MAX_GRID_WIDTH = 980;
const MOBILE_LAYOUT_MAX_WIDTH = 520;
const TOUCH_LAYOUT_MAX_MIN_DIM = 820;
const MOBILE_GRID_MAX_WIDTH = 720;
const ULTRA_COMPACT_MAX_MIN_DIM = 760;
const GRID_PADDING_PX = 32; // p-4 (16px de chaque côté)
const BASE_TILE_PX = 56;
const BASE_GAP_PX = 8; // gap-2 de référence
const BASE_GAP_RATIO = BASE_GAP_PX / BASE_TILE_PX; // ~0.14 pour conserver les proportions
const MIN_TILE_SIZE = 40; // garde une lisibilité minimale
const GRID_ROTATE_ANIM_MS = 820;
const DARK_ROW_TEXT = "#e5e7eb";
const LIVE_SOLVER_DURING_PLAY = false;
const DEV_MODE = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const DARK_DIVIDER_COLOR = "#1f2937";
const DARK_WORD_INACTIVE = "#e2e8f0";
const WORD_BATCH_FLUSH_MS = 40;
const WORD_BATCH_MAX = 5;
const WORD_BATCH_ACK_TIMEOUT_MS = 1400;
const VOCAB_OVERLAY_FADE_MS = 1000;
const VOCAB_OVERLAY_ZERO_DELAY_MS = 2000;
const VOCAB_OVERLAY_SEGMENT_MS = 2000;
const VOCAB_OVERLAY_WORDS_PER_SEGMENT = 10;
const VOCAB_OVERLAY_MIN_COUNT_MS = 650;
const VOCAB_OVERLAY_MAX_COUNT_MS = 5000;
const VOCAB_OVERLAY_ABSORB_MS = 2000;
const VOCAB_OVERLAY_END_HOLD_MS = 3000;
const VOCAB_OVERLAY_IMAGE_FADE_MS = 450;
const DEBUG_AUDIO = false;
const AUDIO_MASTER_GAIN = 0.7;
const AUDIO_POLYPHONY_LIMIT = 10;
const SOFT_CLIP_CURVE_CACHE = new Map();
const AUDIO_COOLDOWNS_MS = {
  tileStep: 40,
  tick: 750,
  countdownTick: 850,
  swipe: 80,
  bipmontre: 120,
  vocabTick: 40,
  vocabZero: 80,
  vocabCling: 80,
  specialFound: 80,
  roundStart: 160,
  invalidWord: 160,
  dejaJoue: 160,
  shortWord: 160,
  score: 60,
  score2: 60,
  tournamentCelebration: 240,
  error: 120,
  duplicate: 120,
  gobbleVoice: 1200,
};
const VOCAB_SAMPLE_BASE_FREQ = 440;
const SOUND_ROOT = "/sound";
const AMBIENT_MUSIC_MANIFEST = `${SOUND_ROOT}/music/index.json`;
const AMBIENT_MUSIC_TRACKS_BASE = [
  `${SOUND_ROOT}/music/oiseauxnuit.mp3`,
  `${SOUND_ROOT}/music/oiseauxsoir.mp3`,
  `${SOUND_ROOT}/music/reveiloiseaux.mp3`,
  `${SOUND_ROOT}/music/reveiloiseaux2.mp3`,
];
const AMBIENT_MUSIC_TRACKS_DEFAULT =
  Array.isArray(AMBIENT_MUSIC_TRACKS_FALLBACK) && AMBIENT_MUSIC_TRACKS_FALLBACK.length
    ? AMBIENT_MUSIC_TRACKS_FALLBACK
    : AMBIENT_MUSIC_TRACKS_BASE;
const INCREMENTAL_SOUND_COUNT = 16;
const INCREMENTAL_SOUND_PATHS = Array.from({ length: INCREMENTAL_SOUND_COUNT }, (_, idx) => {
  const label = String(idx + 1).padStart(2, "0");
  return `${SOUND_ROOT}/game/incremental/${label}.wav`;
});
const SCORE_SOUND_BANDS = [
  { min: 3, max: 5, src: `${SOUND_ROOT}/game/scores/03.wav` },
  { min: 6, max: 9, src: `${SOUND_ROOT}/game/scores/04.wav` },
  { min: 10, max: 19, src: `${SOUND_ROOT}/game/scores/05.wav` },
  { min: 20, max: 29, src: `${SOUND_ROOT}/game/scores/06.wav` },
  { min: 30, max: Infinity, src: `${SOUND_ROOT}/game/scores/07.wav` },
];
const SCORE_SOUND_PATHS = SCORE_SOUND_BANDS.map((band) => band.src);
const SCORE2_SOUND_PATHS = SCORE_SOUND_BANDS.map((band) =>
  band.src.replace("/game/scores/", "/game/piano/")
);
const SCORE_LOW_PATH = `${SOUND_ROOT}/game/scores/01.wav`;
const SCORE2_LOW_PATH = `${SOUND_ROOT}/game/piano/01.wav`;
const SCORE_LOW_KEY = makeScoreSfxKey("01");
const SCORE2_LOW_KEY = makeScore2SfxKey("01");
const SOUND_PATHS = {
  gobbleVoice: `${SOUND_ROOT}/game/gobble.mp3`,
  blackHole: `${SOUND_ROOT}/game/chasse.mp3`,
  chebabeu: `${SOUND_ROOT}/game/chebabeu.wav`,
  clavier: `${SOUND_ROOT}/game/clavier.wav`,
  souris: `${SOUND_ROOT}/game/souris.wav`,
  shortWord: `${SOUND_ROOT}/game/error.mp3`,
  roundStart: `${SOUND_ROOT}/game/dong.wav`,
  specialFound: `${SOUND_ROOT}/game/charleston.wav`,
  tictac10: `${SOUND_ROOT}/game/tictac10.wav`,
  coeur: `${SOUND_ROOT}/game/coeur.wav`,
  tictoc: `${SOUND_ROOT}/game/tictoc.mp3`,
  vocabOverlay: `${SOUND_ROOT}/ui/progvoca.wav`,
  vocabCling: `${SOUND_ROOT}/game/piece.wav`,
  invalidWord: `${SOUND_ROOT}/game/invalide.mp3`,
  dejaJoue: `${SOUND_ROOT}/game/dejajoue.wav`,
  uiClick: `${SOUND_ROOT}/ui/click.wav`,
  uiClose: `${SOUND_ROOT}/ui/bipmontre.wav`,
  tournamentFireworks: `${SOUND_ROOT}/game/artifice.mp3`,
  tournamentApplause: `${SOUND_ROOT}/game/applause.wav`,
};
const INCREMENTAL_SFX_KEYS = INCREMENTAL_SOUND_PATHS.map((src) => {
  const label = src.split("/").pop()?.split(".")[0] || "00";
  return makeIncrementalSfxKey(label);
});
const SCORE_SFX_KEYS = SCORE_SOUND_PATHS.map((src) => {
  const label = src.split("/").pop()?.split(".")[0] || "00";
  return makeScoreSfxKey(label);
});
const SCORE2_SFX_KEYS = SCORE2_SOUND_PATHS.map((src) => {
  const label = src.split("/").pop()?.split(".")[0] || "00";
  return makeScore2SfxKey(label);
});
const BOOT_ASSET_IMAGES = [
  { key: IMAGE_KEYS.favicon, url: "/favicon.png", priority: "critical" },
  { key: IMAGE_KEYS.gobbleBadge, url: "/g.png", priority: "critical" },
  { key: IMAGE_KEYS.bigwords.gobble, url: "/bigwords/gobble.png", priority: "critical" },
  { key: IMAGE_KEYS.bigwords.epique, url: "/bigwords/epique.png", priority: "critical" },
  { key: IMAGE_KEYS.bigwords.enorme, url: "/bigwords/enorme.png", priority: "high" },
  { key: IMAGE_KEYS.bigwords.excellent, url: "/bigwords/excellent.png", priority: "high" },
  { key: IMAGE_KEYS.bigwords.fabuleux, url: "/bigwords/fabuleux.png", priority: "high" },
  { key: IMAGE_KEYS.vocab.debutant, url: "/vocab-ranks/debutant.png", priority: "high" },
  { key: IMAGE_KEYS.vocab.ecolier, url: "/vocab-ranks/ecolier.png", priority: "high" },
  { key: IMAGE_KEYS.vocab.collegien, url: "/vocab-ranks/collegien.png", priority: "high" },
  { key: IMAGE_KEYS.vocab.lyceen, url: "/vocab-ranks/lyceen.png", priority: "high" },
  { key: IMAGE_KEYS.vocab.etudiant, url: "/vocab-ranks/etudiant.png", priority: "high" },
  { key: IMAGE_KEYS.vocab.expert, url: "/vocab-ranks/expert.png", priority: "high" },
];
const IMAGE_FALLBACKS = new Map(BOOT_ASSET_IMAGES.map((entry) => [entry.key, entry.url]));
const BOOT_ASSET_FILES = [
  "/dico.txt",
  "/privacy.html",
  "/privacy/index.html",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/icon.svg",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/sw.js",
  "/.well-known/assetlinks.json",
];
const BOOT_ASSET_SOUNDS_BASE = [
  { key: SFX_KEYS.gobbleVoice, url: SOUND_PATHS.gobbleVoice, priority: "high", meta: { eqKey: "gobbleVoice" } },
  { key: SFX_KEYS.blackHole, url: SOUND_PATHS.blackHole, priority: "low", meta: { eqKey: "blackHole" } },
  { key: SFX_KEYS.chebabeu, url: SOUND_PATHS.chebabeu, priority: "low", meta: { eqKey: "chebabeu" } },
  { key: SFX_KEYS.clavier, url: SOUND_PATHS.clavier, priority: "low", meta: { eqKey: "clavier" } },
  { key: SFX_KEYS.souris, url: SOUND_PATHS.souris, priority: "low", meta: { eqKey: "souris" } },
  { key: SFX_KEYS.roundStart, url: SOUND_PATHS.roundStart, priority: "high", meta: { eqKey: "roundStart" } },
  { key: SFX_KEYS.specialFound, url: SOUND_PATHS.specialFound, priority: "high", meta: { eqKey: "specialFound" } },
  { key: SFX_KEYS.tictac10, url: SOUND_PATHS.tictac10, priority: "critical", meta: { eqKey: "tick" } },
  { key: SFX_KEYS.coeur, url: SOUND_PATHS.coeur, priority: "critical", meta: { eqKey: "coeur" } },
  { key: SFX_KEYS.tictoc, url: SOUND_PATHS.tictoc, priority: "critical", meta: { eqKey: "countdownTick" } },
  { key: SFX_KEYS.vocabOverlay, url: SOUND_PATHS.vocabOverlay, priority: "high", meta: { eqKey: "vocabTick" } },
  { key: SFX_KEYS.vocabCling, url: SOUND_PATHS.vocabCling, priority: "high", meta: { eqKey: "vocabCling" } },
  { key: SFX_KEYS.invalidWord, url: SOUND_PATHS.invalidWord, priority: "critical", meta: { eqKey: "invalidWord" } },
  { key: SFX_KEYS.dejaJoue, url: SOUND_PATHS.dejaJoue, priority: "critical", meta: { eqKey: "dejaJoue" } },
  { key: SFX_KEYS.shortWord, url: SOUND_PATHS.shortWord, priority: "critical", meta: { eqKey: "shortWord" } },
  { key: SFX_KEYS.uiClick, url: SOUND_PATHS.uiClick, priority: "critical", meta: { eqKey: "swipe" } },
  { key: SFX_KEYS.uiClose, url: SOUND_PATHS.uiClose, priority: "high", meta: { eqKey: "bipmontre" } },
  { key: SFX_KEYS.tournamentFireworks, url: SOUND_PATHS.tournamentFireworks, priority: "high", meta: { eqKey: "tournamentFireworks" } },
  { key: SFX_KEYS.tournamentApplause, url: SOUND_PATHS.tournamentApplause, priority: "high", meta: { eqKey: "tournamentApplause" } },
  { key: SCORE_LOW_KEY, url: SCORE_LOW_PATH, priority: "critical", meta: { eqKey: "score" } },
  { key: SCORE2_LOW_KEY, url: SCORE2_LOW_PATH, priority: "critical", meta: { eqKey: "score2" } },
  { key: SFX_KEYS.errorAlt, url: "/error.mp3", priority: "low", meta: { eqKey: "error" } },
  { key: SFX_KEYS.clickAlt, url: `${SOUND_ROOT}/ui/click2.wav`, priority: "low", meta: { eqKey: "swipe" } },
];
const INCREMENTAL_SFX_ENTRIES = INCREMENTAL_SOUND_PATHS.map((url, idx) => ({
  key: INCREMENTAL_SFX_KEYS[idx],
  url,
  priority: "critical",
  meta: { eqKey: "tileStep" },
}));
const SCORE_SFX_ENTRIES = SCORE_SOUND_PATHS.map((url, idx) => ({
  key: SCORE_SFX_KEYS[idx],
  url,
  priority: "critical",
  meta: { eqKey: "score" },
}));
const SCORE2_SFX_ENTRIES = SCORE2_SOUND_PATHS.map((url, idx) => ({
  key: SCORE2_SFX_KEYS[idx],
  url,
  priority: "critical",
  meta: { eqKey: "score2" },
}));
const BOOT_MIN_HOLD_MS = 650;

function stripExtension(src) {
  if (!src || typeof src !== "string") return src;
  return src.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function buildCandidatesFromBase(base, order) {
  const clean = stripExtension(base);
  if (!clean) return [];
  return order.map((ext) => `${clean}.${ext}`);
}

function buildImageCandidates(url) {
  const candidates = buildCandidatesFromBase(url, ["webp", "png"]);
  return candidates.length ? candidates : [url];
}

function buildSfxCandidates(url) {
  const candidates = buildCandidatesFromBase(url, ["m4a", "wav", "mp3"]);
  return candidates.length ? candidates : [url];
}

function buildImageManifest(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    key: item.key,
    type: "image",
    candidates: buildImageCandidates(item.url),
    priority: item.priority,
  }));
}

function buildSfxManifest(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    key: item.key,
    type: "sfx",
    candidates: buildSfxCandidates(item.url),
    priority: item.priority,
    meta: item.meta || {},
  }));
}

function makeFileKey(url) {
  return `file_${String(url || "")
    .replace(/^\//, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()}`;
}

function buildFileManifest(items) {
  return (Array.isArray(items) ? items : []).map((url) => ({
    key: makeFileKey(url),
    type: "file",
    candidates: [url],
    priority: "low",
  }));
}

function dedupeManifest(entries) {
  const map = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry?.key) return;
    map.set(entry.key, entry);
  });
  return Array.from(map.values());
}

const BOOT_ASSET_SFX = [
  ...BOOT_ASSET_SOUNDS_BASE,
  ...INCREMENTAL_SFX_ENTRIES,
  ...SCORE_SFX_ENTRIES,
  ...SCORE2_SFX_ENTRIES,
];
const BOOT_ASSET_MANIFEST = dedupeManifest([
  ...ASSET_MANIFEST_BASE,
  ...buildImageManifest(BOOT_ASSET_IMAGES),
  ...buildSfxManifest(BOOT_ASSET_SFX),
  ...buildFileManifest(BOOT_ASSET_FILES),
]);

function resolveAmbientManifestTracks(payload) {
  const raw = Array.isArray(payload) ? payload : payload?.tracks;
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const resolved = [];
  raw.forEach((entry) => {
    const value = typeof entry === "string" ? entry : entry?.src;
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const full = trimmed.startsWith("/") ? trimmed : `${SOUND_ROOT}/music/${trimmed}`;
    if (seen.has(full)) return;
    seen.add(full);
    resolved.push(full);
  });
  return resolved.length ? resolved : null;
}

async function loadAmbientTrackList() {
  if (typeof fetch === "undefined") return AMBIENT_MUSIC_TRACKS_DEFAULT;
  try {
    const res = await fetch(AMBIENT_MUSIC_MANIFEST, { cache: "no-store" });
    if (!res.ok) return AMBIENT_MUSIC_TRACKS_DEFAULT;
    const data = await res.json();
    const resolved = resolveAmbientManifestTracks(data);
    return resolved && resolved.length ? resolved : AMBIENT_MUSIC_TRACKS_DEFAULT;
  } catch (_) {
    return AMBIENT_MUSIC_TRACKS_DEFAULT;
  }
}

const DEFINITION_PLACEHOLDER_RE = /^[.\u2026\u00b7\s-]+$/;

function sanitizeDefinitionText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (DEFINITION_PLACEHOLDER_RE.test(text)) return "";
  return text;
}

function pickDefinitionText(data) {
  if (!data) return "";
  const primary = sanitizeDefinitionText(data.definition);
  if (primary) return primary;
  return sanitizeDefinitionText(data.extract);
}

function buildDefinitionFallbacks(clean, data, tried) {
  const out = [];
  const push = (value) => {
    const term = String(value || "").trim();
    if (!term) return;
    const key = normalizeWord(term);
    if (!key || tried.has(key)) return;
    tried.add(key);
    out.push(term);
  };
  push(data?.lemma);
  push(data?.title);
  push(data?.matchedTitle);
  const normalized = normalizeWord(clean);
  if (normalized && !tried.has(normalized)) {
    tried.add(normalized);
    out.push(normalized);
  }
  return out;
}

function getGridSizeForRoom(roomKey) {
  return ROOM_OPTIONS[roomKey]?.gridSize || 4;
}

function getViewportSize() {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  const width = Math.round(
    window.innerWidth ||
      (typeof document !== "undefined" ? document.documentElement?.clientWidth : 0) ||
      0
  );
  const height = Math.round(
    window.innerHeight ||
      (typeof document !== "undefined" ? document.documentElement?.clientHeight : 0) ||
      0
  );
  return { width, height };
}

function hasCoarsePointer() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches
  );
}

function computeIsMobileLayout() {
  if (typeof window === "undefined") return false;
  const { width, height } = getViewportSize();
  const minDim = Math.min(width, height);
  const isNarrow = width <= MOBILE_LAYOUT_MAX_WIDTH;
  const isTouch =
    hasCoarsePointer() ||
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  const isTouchCompact = isTouch && minDim <= TOUCH_LAYOUT_MAX_MIN_DIM;
  return isNarrow || isTouchCompact;
}

function computeIsUltraCompact() {
  if (typeof window === "undefined") return false;
  const { width, height } = getViewportSize();
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);
  const aspect = minDim > 0 ? maxDim / minDim : 0;
  const isTouch =
    hasCoarsePointer() ||
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  return (
    isTouch &&
    minDim <= ULTRA_COMPACT_MAX_MIN_DIM &&
    aspect > 0 &&
    aspect <= 1.35
  );
}

function getDefaultRoomId() {
  if (typeof window !== "undefined") {
    const isMobile = computeIsMobileLayout();
    return isMobile ? "room-4x4" : "room-4x4";
  }
  return "room-4x4";
}

function clampValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeRotationTurns(turns) {
  if (!Number.isFinite(turns)) return 0;
  const mod = turns % 4;
  return mod < 0 ? mod + 4 : mod;
}

function rotateIndexByTurns(index, size, turns) {
  if (!Number.isInteger(index) || !Number.isInteger(size) || size <= 0) {
    return index;
  }
  const t = normalizeRotationTurns(turns);
  if (t === 0) return index;
  const row = Math.floor(index / size);
  const col = index % size;
  if (t === 1) return col * size + (size - 1 - row);
  if (t === 2) return (size - 1 - row) * size + (size - 1 - col);
  return (size - 1 - col) * size + row;
}

function mapDisplayToBoardIndex(displayIndex, size, turns) {
  const t = normalizeRotationTurns(turns);
  return rotateIndexByTurns(displayIndex, size, (4 - t) % 4);
}

function normalizeBonusLabel(bonus) {
  if (bonus === "W2") return "M2";
  if (bonus === "W3") return "M3";
  return bonus;
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

function buildCompletedTargetPattern(pattern, word) {
  const cleanWord = String(word || "").trim();
  if (!cleanWord) return pattern || "";
  const letters = cleanWord.toUpperCase().split("");
  if (!pattern) return letters.join(" ");
  const parts = String(pattern).split(" ");
  if (parts.length === letters.length) {
    return parts.map((part, idx) => (part === "_" ? letters[idx] : part)).join(" ");
  }
  return letters.join(" ");
}

function buildTargetBlankPattern(length) {
  if (!Number.isFinite(length) || length <= 0) return "";
  return Array.from({ length }).map(() => "_").join(" ");
}

function isSystemAuthor(rawAuthor) {
  if (!rawAuthor) return false;
  const simplified = String(rawAuthor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return simplified === "system" || simplified === "systeme";
}

const BONUS_CLASSES = {
  L2: "bg-[rgba(163,196,243,0.85)] border-[rgba(99,147,230,0.9)] border-2", // bleu clair plus vif
  L3: "bg-[rgba(51,93,227,0.8)] border-[rgba(30,64,175,0.95)] text-white border-2", // bleu profond
  M2: "bg-[rgba(255,191,180,0.9)] border-[rgba(248,113,113,0.95)] border-2", // corail vif
  M3: "bg-[rgba(239,68,68,0.85)] border-[rgba(185,28,28,0.95)] text-white border-2", // rouge intense
};

const WEEKLY_BOARDS = [
  { key: "medals", label: "Medailles", subtitle: "Total hebdo" },
  { key: "mostWordsInGame", label: "Mots par manche", subtitle: "Volume max" },
  { key: "totalScore", label: "Score total", subtitle: "Somme hebdo (cibles = 500 pts)" },
  { key: "bestWord", label: "Meilleur mot", subtitle: "Score le plus eleve" },
  { key: "longestWord", label: "Mot le plus long", subtitle: "Longest" },
  { key: "bestRoundScore", label: "Score de manche", subtitle: "Total record" },
  { key: "bestTimeTargetLong", label: "Temps mot long", subtitle: "Round cible mot long" },
  { key: "bestTimeTargetScore", label: "Temps meilleur mot", subtitle: "Round cible meilleur mot" },
  { key: "mostGobbles", label: "Gobbles", subtitle: "Total hebdo" },
];
const FINALE_WEEKLY_BOARDS = [
  { key: "vocab", label: "Vocabulaire", subtitle: "Mots uniques" },
  ...WEEKLY_BOARDS,
];
const WEEKLY_RECORD_LABELS = {
  bestWord: "Meilleur mot",
  longestWord: "Mot le plus long",
  mostWordsInGame: "Mots par manche",
  bestTimeTargetLong: "Temps mot long",
  bestTimeTargetScore: "Temps meilleur mot",
};

const WEEKLY_SWIPE_THRESHOLD = 42;
const RESULTS_SWIPE_THRESHOLD = 52;
const RESULTS_SLIDE_OUT_MS = 250;
const RESULTS_SLIDE_IN_MS = 250;

function SwapFadeText({ value, className = "" }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [phase, setPhase] = useState("idle");
  const latestValueRef = useRef(value);
  const displayValueRef = useRef(value);
  const firstRenderRef = useRef(true);
  const outTimerRef = useRef(null);
  const inTimerRef = useRef(null);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      setDisplayValue(value);
      return undefined;
    }
    if (value === displayValueRef.current) return undefined;
    if (outTimerRef.current) {
      clearTimeout(outTimerRef.current);
      outTimerRef.current = null;
    }
    if (inTimerRef.current) {
      clearTimeout(inTimerRef.current);
      inTimerRef.current = null;
    }
    setPhase("out");
    outTimerRef.current = setTimeout(() => {
      setDisplayValue(latestValueRef.current);
      setPhase("in");
      inTimerRef.current = setTimeout(() => {
        setPhase("idle");
      }, RESULTS_SLIDE_IN_MS);
    }, RESULTS_SLIDE_OUT_MS);
    return () => {
      if (outTimerRef.current) {
        clearTimeout(outTimerRef.current);
        outTimerRef.current = null;
      }
      if (inTimerRef.current) {
        clearTimeout(inTimerRef.current);
        inTimerRef.current = null;
      }
    };
  }, [value]);

  const phaseClass =
    phase === "out" ? "results-fade-out" : phase === "in" ? "results-fade-in" : "";

  return <span className={`${className} ${phaseClass}`}>{displayValue}</span>;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function parseRgbColor(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^rgba?\((.+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => p.trim());
  if (parts.length < 3) return null;
  const read = (v) => {
    if (v.endsWith("%")) {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return 0;
      return Math.round((n / 100) * 255);
    }
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const r = read(parts[0]);
  const g = read(parts[1]);
  const b = read(parts[2]);
  const a =
    parts.length >= 4 && Number.isFinite(parseFloat(parts[3]))
      ? Math.max(0, Math.min(1, parseFloat(parts[3])))
      : 1;
  return { r, g, b, a };
}

function darkenColor(value, factor = 0.7) {
  const parsed = parseRgbColor(value);
  if (!parsed) return value;
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(parsed.r * f);
  const g = Math.round(parsed.g * f);
  const b = Math.round(parsed.b * f);
  return `rgb(${r}, ${g}, ${b})`;
}

function makeFxTile3D(letter, sizePx, thickPx, visuals = {}) {
  const fx = document.createElement("div");
  fx.className = "fxTile3d";
  fx.style.setProperty("--s", `${sizePx}px`);
  fx.style.setProperty("--t", `${thickPx}px`);
  if (visuals.bg) fx.style.setProperty("--fx-bg", visuals.bg);
  if (visuals.border) fx.style.setProperty("--fx-border", visuals.border);
  if (visuals.side) fx.style.setProperty("--fx-side", visuals.side);
  if (visuals.text) fx.style.setProperty("--fx-text", visuals.text);
  fx.style.setProperty("--fx-font", `${Math.max(16, Math.round(sizePx * 0.46))}px`);

  const bg = visuals.bg || "#f3c07a";
  const border = visuals.border || "rgba(0,0,0,.25)";
  const side = visuals.side || "#a6803f";
  const back = visuals.back || side || bg;
  const halfT = thickPx / 2;
  const eps = Math.max(0.2, thickPx * 0.02);
  const commonFaceStyle = {
    position: "absolute",
    left: "50%",
    top: "50%",
    backfaceVisibility: "hidden",
  };

  const mkFace = (cls, withLetter = false) => {
    const f = document.createElement("div");
    f.className = `face ${cls}`;
    Object.assign(f.style, commonFaceStyle);
    if (withLetter) {
      const s = document.createElement("span");
      s.className = "letter";
      s.textContent = letter;
      f.appendChild(s);
    }
    return f;
  };

  const front = mkFace("front", true);
  Object.assign(front.style, {
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) translateZ(${halfT + eps}px)`,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: "14px",
    boxShadow:
      "0 16px 26px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.35), inset 0 -14px 22px rgba(0,0,0,.22)",
  });

  const backFace = mkFace("back", true);
  Object.assign(backFace.style, {
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) rotateY(180deg) translateZ(${halfT + eps}px)`,
    background: back,
    border: `1px solid ${border}`,
    borderRadius: "14px",
  });

  const right = mkFace("right");
  Object.assign(right.style, {
    width: `${thickPx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  const left = mkFace("left");
  Object.assign(left.style, {
    width: `${thickPx}px`,
    height: `${sizePx}px`,
    transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  const top = mkFace("top");
  Object.assign(top.style, {
    width: `${sizePx}px`,
    height: `${thickPx}px`,
    transform: `translate(-50%, -50%) rotateX(90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(90deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  const bottom = mkFace("bottom");
  Object.assign(bottom.style, {
    width: `${sizePx}px`,
    height: `${thickPx}px`,
    transform: `translate(-50%, -50%) rotateX(-90deg) translateZ(${sizePx / 2}px)`,
    background: `linear-gradient(90deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), ${side}`,
    borderRadius: "6px",
  });

  fx.appendChild(front);
  fx.appendChild(backFace);
  fx.appendChild(right);
  fx.appendChild(left);
  fx.appendChild(top);
  fx.appendChild(bottom);

  return fx;
}

async function playBlackHoleOutro3D({ tileEls, holeX, holeY, durationMs = 6000 }) {
  if (prefersReducedMotion()) return null;
  if (!tileEls || tileEls.length === 0) return null;
  if (!Number.isFinite(holeX) || !Number.isFinite(holeY)) return null;
  const randRangeLocal = (min, max) => Math.random() * (max - min) + min;
  const expEaseIn = (t, k = 3) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const kk = Math.max(0.001, k);
    return (Math.exp(kk * t) - 1) / (Math.exp(kk) - 1);
  };
  if (DEV_MODE) {
    console.info("[fx] black-hole start", {
      count: tileEls.length,
      durationMs,
    });
  }

  const overlay = document.createElement("div");
  overlay.className = "fxOverlay";
  document.body.appendChild(overlay);
  overlay.style.perspectiveOrigin = `${holeX}px ${holeY}px`;

  const fade = document.createElement("div");
  fade.className = "fxScreenFade";
  overlay.appendChild(fade);
  const DEBUG_FX_CUBE = false;
  if (DEV_MODE && DEBUG_FX_CUBE) {
    const dbg = makeFxTile3D("A", 90, 28, {
      bg: "#f3c07a",
      side: "#a6803f",
      border: "rgba(0,0,0,.25)",
      text: "#1f1300",
    });
    dbg.style.left = "40px";
    dbg.style.top = "40px";
    dbg.style.transform = "rotateX(65deg) rotateY(-35deg)";
    overlay.appendChild(dbg);
  }

  fade.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.72 },
      { opacity: 1, offset: 1 },
    ],
    {
      duration: durationMs,
      easing: "linear",
      fill: "forwards",
    }
  );

  const anims = [];
  const DEBUG_FX_GEOM = false;
  let debugApplied = false;

  for (const el of tileEls) {
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const size = Math.round(Math.min(rect.width, rect.height));
    const thick = Math.max(6, Math.round(size * 0.22));
    const letter =
      (el.querySelector?.(".tile-letter")?.textContent || el.textContent || "")
        .trim()
        .slice(0, 2);
    const styles = window.getComputedStyle(el);
    const bgRaw = styles.backgroundColor || "";
    const bgParsed = parseRgbColor(bgRaw);
    const bg = bgParsed && bgParsed.a >= 0.85 ? bgRaw : "#f3c07a";
    const border =
      styles.borderColor && styles.borderColor !== "transparent"
        ? styles.borderColor
        : "rgba(0,0,0,0.25)";
    const text = "#1f1300";
    const side = darkenColor(bg, 0.62);

    const fx = makeFxTile3D(letter, size, thick, {
      bg,
      border,
      side,
      text,
    });

    fx.style.left = `${holeX - size / 2}px`;
    fx.style.top = `${holeY - size / 2}px`;
    overlay.appendChild(fx);
    if (DEBUG_FX_GEOM && !debugApplied) {
      debugApplied = true;
      fx.style.transform = "rotateX(65deg) rotateY(-35deg) translateZ(0)";
      fx.style.opacity = "1";
      continue;
    }

    let x0 = rect.left + rect.width / 2 - holeX;
    let y0 = rect.top + rect.height / 2 - holeY;
    let r0 = Math.hypot(x0, y0);
    const minR = Math.max(6, size * 0.18);
    if (r0 < minR) {
      const ang = Math.random() * Math.PI * 2;
      x0 = Math.cos(ang) * minR;
      y0 = Math.sin(ang) * minR;
      r0 = minR;
    }
    const a0 = Math.atan2(y0, x0);

    const maxDist = Math.max(1, Math.hypot(window.innerWidth, window.innerHeight));
    const distNorm = Math.min(1, r0 / maxDist);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const turns = 0.9 + 1.3 * distNorm + Math.random() * 0.6;
    const spinTurns = 0.9 + 1.4 * distNorm + Math.random() * 0.8;
    const zDepth = 220 + Math.random() * 260;
    const spinZ = dir * 360 * spinTurns;
    const orbitBias = randRangeLocal(-0.12, 0.12) * (0.4 + 0.6 * distNorm);
    const wobbleAmp = 0.02 + 0.06 * distNorm;
    const wobblePhase = Math.random() * Math.PI * 2;
    const wobbleTurns = 1.4 + Math.random() * 1.6;

    const steps = 14;
    const kf = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const accelK = 3.2 + 2.2 * distNorm;
      const moveEase = expEaseIn(t, accelK);
      const rotEase = expEaseIn(t, accelK * 1.05);
      const scaleEase = Math.pow(moveEase, 1.05);
      const wobble = wobbleAmp * Math.sin(t * wobbleTurns * Math.PI * 2 + wobblePhase);
      const rr = r0 * (1 - moveEase);
      const orbitR = rr * (1 + orbitBias + wobble);
      const aa = a0 + dir * turns * Math.PI * 2 * moveEase;

      const x = Math.cos(aa) * orbitR * (1 + orbitBias * 0.25);
      const y = Math.sin(aa) * orbitR * (1 - orbitBias * 0.25);
      const z = -zDepth * moveEase;

      const rz = spinZ * rotEase;
      const rx = 0;
      const ry = 0;

      const s = 1 - 0.94 * Math.pow(scaleEase, 1.02);
      const fadeStart = 0.6 + 0.25 * distNorm;
      const fadeT = t <= fadeStart ? 0 : (t - fadeStart) / (1 - fadeStart);
      const o = 1 - Math.pow(fadeT, 1.2);
      kf.push({
        transform: `translate3d(${x}px, ${y}px, ${z}px) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`,
        opacity: o,
      });
    }

    const durationScale = 0.65 + 0.95 * distNorm;
    anims.push(
      fx
        .animate(kf, {
          duration: durationMs * durationScale + Math.random() * 220,
          easing: "cubic-bezier(.2,.9,.2,1)",
          fill: "forwards",
        })
        .finished
    );
  }

  await Promise.allSettled(anims);
  return { overlay, fade };
}

function BootLoader({ progress = 0, darkMode = false }) {
  if (typeof document === "undefined") return null;
  const progressValue =
    typeof progress === "number"
      ? progress
      : Number.isFinite(progress?.loaded) && Number.isFinite(progress?.total) && progress.total > 0
      ? progress.loaded / progress.total
      : 0;
  const clamped = Number.isFinite(progressValue) ? Math.min(Math.max(progressValue, 0), 1) : 0;
  const percent = Math.round(clamped * 100);
  const logoSrc = AssetManager.getImage(IMAGE_KEYS.favicon).url || "";
  const stageLabel = typeof progress === "object" ? progress?.stage || "" : "";
  const keyLabel = typeof progress === "object" ? progress?.key || "" : "";
  const glowClass = darkMode
    ? "bg-slate-950 text-slate-100"
    : "bg-gradient-to-br from-amber-50 via-orange-50 to-white text-slate-900";
  const cardClass = darkMode
    ? "bg-slate-900/85 border-white/10"
    : "bg-white/90 border-slate-200";
  const barTrackClass = darkMode ? "bg-slate-800/70" : "bg-slate-200/80";
  const barFillClass = darkMode ? "bg-amber-400" : "bg-amber-500";

  return createPortal(
    <div className={`fixed inset-0 z-[14000] flex items-center justify-center ${glowClass}`}>
      <style>{`
@keyframes bootFloatOne {
  0% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(10px, -14px, 0); }
  100% { transform: translate3d(0, 0, 0); }
}
@keyframes bootFloatTwo {
  0% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(-14px, 8px, 0); }
  100% { transform: translate3d(0, 0, 0); }
}
@keyframes bootPulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.3); }
  70% { transform: scale(1.02); box-shadow: 0 0 0 14px rgba(251, 191, 36, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
}
`}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-28 -left-16 h-64 w-64 rounded-full bg-amber-300/30 blur-3xl"
          style={{ animation: "bootFloatOne 6s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-orange-400/25 blur-3xl"
          style={{ animation: "bootFloatTwo 7s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-28 left-1/4 h-80 w-80 rounded-full bg-yellow-200/25 blur-3xl"
          style={{ animation: "bootFloatOne 8s ease-in-out infinite" }}
        />
      </div>
      <div className={`relative w-[92vw] max-w-sm rounded-3xl border p-6 shadow-2xl ${cardClass}`}>
        <div className="flex items-center justify-center">
          <div
            className={`rounded-2xl p-3 ${darkMode ? "bg-amber-500/10" : "bg-amber-200/60"}`}
            style={{ animation: "bootPulse 2.6s ease-in-out infinite" }}
          >
            <img
              src={logoSrc}
              alt="Gobble"
              className="h-16 w-16 object-contain"
              draggable="false"
            />
          </div>
        </div>
        <div className="mt-4 text-center text-xs font-black tracking-[0.32em] uppercase text-amber-500">
          Gobble
        </div>
        <div className={`mt-2 text-center text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
          Chargement des medias
        </div>
        <div className={`mt-5 h-2 w-full overflow-hidden rounded-full ${barTrackClass}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${barFillClass}`}
            style={{ width: `${percent}%` }}
          />
        </div>
          <div className={`mt-2 flex items-center justify-between text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
            <span>{percent}%</span>
            <span>Assets</span>
          </div>
          {stageLabel || keyLabel ? (
            <div
              className={`mt-1 text-[10px] font-semibold truncate ${darkMode ? "text-slate-400" : "text-slate-500"}`}
              title={`${stageLabel} ${keyLabel}`.trim()}
            >
              {stageLabel ? `${stageLabel} · ` : ""}
              {keyLabel}
            </div>
          ) : null}
      </div>
    </div>,
    document.body
  );
}


// Petite CSS pour le slide d'apparition
const slideStyles = `
html {
  color-scheme: light;
  -webkit-text-size-adjust: 100%;
}
html.dark {
  color-scheme: dark;
}
body {
  background-color: #ffffff;
  color: #0f172a;
}

.ios-input {
  font-size: 16px;
  line-height: 1.2;
}
.chat-input {
  font-size: 18px;
  line-height: 1.35;
}

@media (max-width: 520px) {
  body {
    overscroll-behavior: none;
  }
  button,
  [role="button"] {
    touch-action: manipulation;
  }
  input,
  textarea,
  select {
    font-size: 16px;
  }
}

.chat-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

@keyframes slideFadeIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.slide-fade-in {
  animation: slideFadeIn 0.25s ease-out;
}

@keyframes chatSheetIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chatSheetOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes chatOverlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chatOverlayOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes softPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.5);
  }
  100% {
    box-shadow: 0 0 0 18px rgba(37, 99, 235, 0);
  }
}

@keyframes weeklyArrowBlink {
  0% {
    opacity: 0.1;
    transform: scale(0.85);
  }
  45% {
    opacity: 0.95;
    transform: scale(1.5);
  }
  75% {
    opacity: 0.25;
    transform: scale(1.15);
  }
  100% {
    opacity: 0.65;
    transform: scale(1);
  }
}

@keyframes weeklyArrowBump {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.5);
  }
  70% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes recordRainbow {
  0% {
    background-position: 0% 50%;
    filter: brightness(1);
  }
  50% {
    background-position: 100% 50%;
    filter: brightness(1.1);
  }
  100% {
    background-position: 0% 50%;
    filter: brightness(1);
  }
}

.record-rainbow {
  background-image: linear-gradient(
    90deg,
    #ff6b6b,
    #feca57,
    #1dd1a1,
    #54a0ff,
    #a55eea,
    #ff6b6b
  );
  background-size: 300% 100%;
  color: #ffffff;
  text-shadow: 0 1px 2px rgba(15, 23, 42, 0.45);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.4);
  animation: recordRainbow 3.2s linear infinite;
}

.record-rainbow:hover {
  filter: brightness(1.08);
}

@keyframes vocabShimmer {
  0% {
    background-position: -200% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

@keyframes vocabPulse {
  0% {
    filter: brightness(1);
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
  }
  50% {
    filter: brightness(1.2);
    box-shadow: 0 0 16px rgba(34, 197, 94, 0.55);
  }
  100% {
    filter: brightness(1);
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
  }
}

@keyframes vocabOverlayIn {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes vocabOverlayOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
}

@keyframes vocabBounce {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.08) translateY(-2px);
  }
  70% {
    transform: scale(0.98) translateY(1px);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes vocabImageFadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes vocabImageFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes vocabWordFadeOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@keyframes vocabWordFadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes vocabAbsorb {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
    filter: drop-shadow(0 0 0 rgba(34, 197, 94, 0));
  }
  35% {
    transform: translate(
        calc(var(--vocab-absorb-x, 0px) * 0.35),
        calc(var(--vocab-absorb-y, 0px) * 0.35)
      )
      scale(1.22);
    opacity: 1;
    filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.6));
  }
  85% {
    transform: translate(
        calc(var(--vocab-absorb-x, 0px) * 0.85),
        calc(var(--vocab-absorb-y, 0px) * 0.85)
      )
      scale(0.7);
    opacity: 1;
    filter: drop-shadow(0 0 12px rgba(34, 197, 94, 0.8));
  }
  99% {
    transform: translate(
        calc(var(--vocab-absorb-x, 0px) * 0.99),
        calc(var(--vocab-absorb-y, 0px) * 0.99)
      )
      scale(0.4);
    opacity: 1;
    filter: drop-shadow(0 0 18px rgba(34, 197, 94, 0.95));
  }
  100% {
    transform: translate(var(--vocab-absorb-x, 0px), var(--vocab-absorb-y, 0px))
      scale(0.15);
    opacity: 0;
    filter: drop-shadow(0 0 20px rgba(34, 197, 94, 1));
  }
}

@keyframes vocabBurst {
  0%,
  70% {
    transform: translate(-50%, -50%) scale(0.2);
    opacity: 0;
  }
  85% {
    transform: translate(-50%, -50%) scale(0.7);
    opacity: 0.85;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.6);
    opacity: 0;
  }
}

.vocab-delta-fill {
  background-image: linear-gradient(
    90deg,
    rgba(34, 197, 94, 0.75),
    rgba(134, 239, 172, 0.85),
    rgba(34, 197, 94, 0.75)
  );
  background-size: 200% 100%;
  animation: vocabShimmer 2.2s linear infinite, vocabPulse 1.8s ease-in-out infinite;
}

.vocab-overlay-in {
  animation: vocabOverlayIn 1s ease both;
}

.vocab-overlay-out {
  animation: vocabOverlayOut 1s ease both;
}

.vocab-count-bounce {
  animation: vocabBounce 0.65s ease both;
}

.vocab-image-fade-out {
  animation: vocabImageFadeOut 0.45s ease both;
}

.vocab-image-fade-in {
  animation: vocabImageFadeIn 0.45s ease both;
}

.vocab-count-absorb {
  animation: vocabAbsorb 2s ease both;
  position: relative;
  will-change: transform, opacity, filter;
}

.vocab-count-absorb::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(34, 197, 94, 0.75);
  pointer-events: none;
  animation: vocabBurst 2s ease both;
}

.vocab-word-fade-out {
  animation: vocabWordFadeOut 0.35s ease both;
}

.vocab-word-fade-in {
  animation: vocabWordFadeIn 0.35s ease both;
}

.weekly-arrow-hint {
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.weekly-arrow-visible {
  opacity: 0.55;
}

.weekly-arrow-blink {
  animation: weeklyArrowBlink 1.5s ease-in-out 2;
}

.weekly-arrow-bump {
  animation: weeklyArrowBump 0.45s ease-out;
}

@keyframes resultsFadeOut {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes resultsFadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes resultsSwapFade {
  0% {
    opacity: 1;
  }
  40% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes guideSwipeLeft {
  0% {
    transform: translateX(0);
    opacity: 0.7;
  }
  50% {
    transform: translateX(-18px);
    opacity: 1;
  }
  100% {
    transform: translateX(0);
    opacity: 0.7;
  }
}

@keyframes guidePulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.35);
  }
  70% {
    transform: scale(1.04);
    box-shadow: 0 0 0 10px rgba(251, 191, 36, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0);
  }
}

@keyframes guideBlink {
  0% {
    background-color: rgba(251, 191, 36, 0.18);
  }
  50% {
    background-color: rgba(251, 191, 36, 0.5);
  }
  100% {
    background-color: rgba(251, 191, 36, 0.18);
  }
}

@keyframes specialHintLetter {
  0% {
    opacity: 0;
    transform: translateY(4px) scale(0.8);
  }
  25% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  70% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(4px) scale(0.8);
  }
}

@keyframes specialHintTile {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.06);
  }
  70% {
    transform: scale(1);
  }
  100% {
    transform: scale(1);
  }
}

.results-fade-out {
  animation: resultsFadeOut 0.25s ease-in both;
}

.results-fade-in {
  animation: resultsFadeIn 0.25s ease-out both;
}

.results-fade-layer {
  will-change: opacity;
}

.results-swap-fade {
  animation: resultsSwapFade 0.5s ease both;
}

.guide-swipe {
  animation: guideSwipeLeft 1.6s ease-in-out infinite;
}

.guide-pulse {
  animation: guidePulse 1.8s ease-in-out infinite;
}

.guide-highlight {
  box-shadow: inset 0 0 0 2px rgba(251, 191, 36, 0.85);
}

.guide-blink {
  animation: guideBlink 1.2s ease-in-out infinite;
}

.special-hint-letter {
  animation: specialHintLetter 2.8s ease-in-out infinite;
}

.special-hint-tile {
  animation: specialHintTile 2.8s ease-in-out infinite;
  position: relative;
}

.special-hint-tile::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  animation: specialHintLetter 2.8s ease-in-out infinite;
}

.special-hint-tile.special-hint-fill::before {
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.35),
    inset 0 0 0 2px rgba(16, 185, 129, 0.45);
  background: rgba(16, 185, 129, 0.22);
}

.special-hint-tile.special-hint-outline::before {
  box-shadow: inset 0 0 0 3px rgba(16, 185, 129, 0.75);
}

body.theme-dark .special-hint-tile.special-hint-fill::before {
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.7),
    inset 0 0 0 2px rgba(16, 185, 129, 0.7);
  background: rgba(167, 243, 208, 0.85);
}

@keyframes finaleSlideIn {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes finaleSlideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(-16px);
  }
}

.finale-slide-in {
  animation: finaleSlideIn 0.45s ease-out both;
}

.finale-slide-out {
  animation: finaleSlideOut 0.35s ease-in both;
}

@keyframes tileImplode {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
  }
  45% {
    opacity: var(--implode-opacity-mid, 0.6);
    transform: translate3d(
        calc(var(--implode-x) * 0.45 + var(--implode-ox)),
        calc(var(--implode-y) * 0.45 + var(--implode-oy)),
        0
      )
      rotate(calc(var(--implode-rot) * 0.6))
      scale(var(--implode-scale-mid, 0.7));
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--implode-x), var(--implode-y), 0)
      rotate(var(--implode-rot))
      scale(var(--implode-scale-end, 0.15));
  }
}

.tile-implode {
  animation: tileImplode var(--implode-dur, 0.9s) ease-in forwards;
  animation-delay: var(--implode-delay, 0s);
  will-change: transform, opacity;
  z-index: 6;
}

 .fxOverlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  perspective: 320px;
  transform-style: preserve-3d;
  z-index: 9999;
}

.fxTile3d{
  position:absolute;
  width: var(--s);
  height: var(--s);
  transform-style: preserve-3d;
  transform-origin: center center;
  will-change: transform, opacity;
  z-index: 2;
}

.fxTile3d .face{
  position:absolute;
  backface-visibility: hidden;
}

.fxTile3d .front,
.fxTile3d .back{
  border-radius: 14px;
}

.fxTile3d .front{
  background: var(--fx-bg, #f3c07a);
  border: 1px solid var(--fx-border, rgba(0,0,0,.25));
  box-shadow:
    0 16px 26px rgba(0,0,0,.20),
    inset 0 1px 0 rgba(255,255,255,.35),
    inset 0 -14px 22px rgba(0,0,0,.22);
}

.fxTile3d .back{
  background: color-mix(in srgb, var(--fx-bg, #f3c07a) 70%, black);
  border: 1px solid rgba(0,0,0,.25);
}

.fxTile3d .right,
.fxTile3d .left{
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), var(--fx-side, #a6803f);
}

.fxTile3d .top,
.fxTile3d .bottom{
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(0,0,0,.12), rgba(0,0,0,.55)), var(--fx-side, #a6803f);
}

.fxTile3d .letter{
  position:absolute;
  inset:0;
  display:grid;
  place-items:center;
  font-weight: 900;
  font-size: var(--fx-font, 22px);
  letter-spacing:-.5px;
  color: var(--fx-text, #1f2937);
  text-shadow: 0 2px 0 rgba(0,0,0,.25), 0 0 8px rgba(255,255,255,.15);
}

.fxScreenFade{
  position: fixed;
  inset: 0;
  background: #000;
  opacity: 0;
  z-index: 4;
  pointer-events: none;
}

@keyframes blackHolePulse {
  0% {
    transform: translate(-50%, -50%) scale(0.85);
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.35), 0 0 24px rgba(0, 0, 0, 0.45);
  }
  100% {
    transform: translate(-50%, -50%) scale(1.05);
    box-shadow: 0 0 18px rgba(0, 0, 0, 0.5), 0 0 36px rgba(0, 0, 0, 0.6);
  }
}

.black-hole {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #2f2f2f 0%, #0a0a0a 55%, #000 100%);
  animation: blackHolePulse 0.75s ease-in-out infinite alternate;
  pointer-events: none;
  z-index: 5;
}

@keyframes shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-6px); }
  40%, 60% { transform: translateX(6px); }
}

.tile-btn {
  transition: transform 0.15s ease, box-shadow 0.18s ease;
}

.tile-btn:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
}

@media (hover: none) {
  .tile-btn:hover {
    transform: none;
    box-shadow: none;
  }
}

.tile-used {
  transform: scale(1.03);
  /* Réhausse fortement la couleur SANS assombrir. */
  filter: saturate(1.9);
  transition: transform 60ms linear, filter 60ms linear;
  outline: none;
}

/* --- Contraste fort sur les tuiles sélectionnées --- */
.tile-used {
  transform: translateY(-1px) scale(1.08);
  transition: transform 80ms ease, box-shadow 120ms ease;
  background: linear-gradient(180deg, #1d4ed8 0%, #2563eb 55%, #60a5fa 100%) !important;
  border-color: rgba(255, 255, 255, 0.92) !important;
  border-width: 3px !important;
  box-shadow:
    0 10px 26px rgba(37, 99, 235, 0.35),
    0 0 0 3px rgba(59, 130, 246, 0.55),
    inset 0 0 0 2px rgba(255, 255, 255, 0.22);
}

.tile-hint {
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.35),
    inset 0 0 0 2px rgba(16, 185, 129, 0.45);
  background: rgba(16, 185, 129, 0.22) !important;
}

.tile-hint-outline {
  outline: 3px solid rgba(16, 185, 129, 0.75);
  outline-offset: -3px;
}

body.theme-dark .tile-hint {
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.7),
    inset 0 0 0 2px rgba(16, 185, 129, 0.7);
  background: rgba(167, 243, 208, 0.85) !important;
}

.tile-letter {
  color: #0f172a;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.85),
    0 3px 10px rgba(0, 0, 0, 0.22);
}

body.theme-dark .tile-letter {
  /* on garde la couleur d'origine des lettres en mode sombre */
}

.tile-used .tile-letter {
  color: #ffffff !important;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.35),
    0 8px 18px rgba(0, 0, 0, 0.35) !important;
}

.tile-points {
  position: absolute;
  right: 6px;
  bottom: 6px;
  font-size: 0.60rem;
  line-height: 1;
  font-weight: 900;
  padding: 0;
  background: transparent;
  color: #000;
  box-shadow: none;
}

body.theme-dark .tile-points {
  background: transparent;
  color: #000;
  box-shadow: none;
}

.tile-used .tile-points {
  background: transparent;
  color: #000;
}

.shake {
  animation: shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  will-change: transform;
}

.bonus-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 3px;
  border-radius: 9999px;
  font-size: 0.45rem;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.08);
  color: #111;
}

.bonus-badge.bonus-w {
  background: rgba(220, 38, 38, 0.15);
  color: #7f1d1d;
}

.bonus-badge.bonus-l {
  background: rgba(37, 99, 235, 0.15);
  color: #1d4ed8;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  backdrop-filter: blur(6px);
}

body.theme-dark {
  background: #0b1020;
  color: #e5e7eb;
}

body.theme-dark .bg-white {
  background-color: #0f172a !important;
  color: #e5e7eb !important;
}

body.theme-dark .border {
  border-color: #1f2937 !important;
}

body.theme-dark .text-gray-500 {
  color: #9ca3af !important;
}

body.theme-dark .text-gray-700 {
  color: #e5e7eb !important;
}

body.theme-dark .bg-gray-50 {
  background-color: #111827 !important;
}

body.theme-dark .bg-gray-200 {
  background-color: #1f2937 !important;
  color: #e5e7eb !important;
}

body.theme-dark .bg-blue-600 {
  background-color: #2563eb !important;
}

body.theme-dark .text-black {
  color: #e5e7eb !important;
}

body.theme-dark .bg-blue-50 {
  background-color: #1e3a8a !important;
  color: #e5e7eb !important;
}

body.theme-dark .bg-gray-100 {
  background-color: #1f2937 !important;
  color: #e5e7eb !important;
}

body.theme-dark .hover\:bg-gray-200:hover {
  background-color: #374151 !important;
}

body.theme-dark .border-black {
  border-color: #f8fafc !important;
}

body.theme-dark .bg-orange-100 {
  background-color: #2e3a4a !important; /* tuile sombre mais lisible */
  color: #f9fafb !important;
}

body.theme-dark .border-orange-300 {
  border-color: #6b7280 !important; /* bord un peu plus clair que la tuile */
  border-width: 2px !important;
}

body.theme-dark .ring-offset-white {
  --tw-ring-offset-color: #0d1625 !important; /* fond derrière l'anneau */
}

/* Tuiles en mode sombre (avec bonus) */
body.theme-dark .tile-btn {
  border-width: 2px !important;
}

body.theme-dark .tile-btn[data-bonus="none"] {
  background-color: #39485c !important;
  border-color: #7b8794 !important;
  color: #f9fafb !important;
}

body.theme-dark .tile-btn[data-bonus="L2"] {
  background-color: rgba(125, 196, 255, 0.4) !important;
  border-color: rgba(125, 196, 255, 0.95) !important;
  color: #f8fafc !important;
}

body.theme-dark .tile-btn[data-bonus="L3"] {
  background-color: rgba(63, 81, 181, 0.38) !important;
  border-color: rgba(63, 81, 181, 0.92) !important;
  color: #f8fafc !important;
}

body.theme-dark .tile-btn[data-bonus="M2"] {
  background-color: rgba(255, 183, 197, 0.34) !important;
  border-color: rgba(255, 183, 197, 0.94) !important;
  color: #fff5f7 !important;
}

body.theme-dark .tile-btn[data-bonus="M3"] {
  background-color: rgba(239, 68, 68, 0.30) !important;
  border-color: rgba(239, 68, 68, 0.95) !important;
  color: #fef2f2 !important;
}

/* Badges bonus en mode sombre */
body.theme-dark .bonus-badge {
  background: rgba(255, 255, 255, 0.12) !important;
  color: #cbd5e1 !important;
}

body.theme-dark .bonus-badge.bonus-w {
  background: rgba(239, 68, 68, 0.2) !important;
  color: #fca5a5 !important;
}

body.theme-dark .bonus-badge.bonus-l {
  background: rgba(59, 130, 246, 0.2) !important;
  color: #93c5fd !important;
}

body.theme-dark input,
body.theme-dark textarea {
  background-color: #0f172a !important;
  color: #e5e7eb !important;
  border-color: #374151 !important;
}

body.theme-dark input::placeholder,
body.theme-dark textarea::placeholder {
  color: #9ca3af !important;
}

@keyframes popGlow {
  0% { transform: translate(20%, -10%) scale(0.6); opacity: 0; }
  35% { transform: translate(-4%, -40%) scale(1.05) rotate(-3deg); opacity: 1; }
  70% { transform: translate(-6%, -55%) scale(1); opacity: 0.9; }
  100% { transform: translate(-6%, -70%) scale(0.9); opacity: 0; }
}

.big-score-burst {
  position: absolute;
  top: -6px;
  right: 6px;
  padding: 8px 12px;
  border-radius: 9999px;
  font-weight: 900;
  font-size: 0.95rem;
  color: #1f1300;
  background: linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b);
  box-shadow: 0 12px 26px rgba(245, 158, 11, 0.35);
  animation: popGlow 0.95s ease-out forwards;
  pointer-events: none;
}

@keyframes praiseDrift {
  0% { transform: translate(-50%, -50%) scale(0.02); opacity: 1; }
  100% { transform: translate(-50%, -50%) translate(var(--praise-x), var(--praise-y)) scale(var(--praise-scale)); opacity: 0; }
}

@keyframes praiseShine {
  0% { background-position: 0% 50%; filter: brightness(1); }
  50% { background-position: 100% 50%; filter: brightness(1.25); }
  100% { background-position: 0% 50%; filter: brightness(1); }
}

@keyframes praiseFlash {
  0% { opacity: 0; }
  18% { opacity: 0.55; }
  100% { opacity: 0; }
}

@keyframes gobbleHold {
  0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
  22% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -50%) translate(var(--praise-x), var(--praise-y)) scale(var(--praise-scale)); opacity: 1; }
}

@keyframes gobbleShine {
  0% { background-position: 0% 50%; filter: drop-shadow(0 6px 14px rgba(120, 53, 15, 0.32)); }
  50% { background-position: 100% 50%; filter: drop-shadow(0 8px 18px rgba(245, 158, 11, 0.38)); }
  100% { background-position: 0% 50%; filter: drop-shadow(0 6px 14px rgba(120, 53, 15, 0.32)); }
}

.praise-pop {
  position: fixed;
  left: 50%;
  top: 44%;
  z-index: 80;
  transform: translate(-50%, -50%);
  animation: praiseDrift var(--praise-duration, 1500ms) cubic-bezier(0.2, 0.8, 0.25, 1) forwards,
    var(--praise-extra-anim, none);
  pointer-events: none;
  opacity: 1;
  white-space: nowrap;
  line-height: 1;
  letter-spacing: -0.02em;
  will-change: transform, opacity;
  isolation: isolate;
}
.praise-image-pop {
  display: flex;
  align-items: center;
  justify-content: center;
}
.praise-image {
  width: var(--praise-size, 240px);
  height: auto;
  display: block;
  filter:
    drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35))
    drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
}
.gobble-pop {
  animation: gobbleHold var(--praise-duration, 2000ms) cubic-bezier(0.2, 0.8, 0.25, 1) forwards;
}
.praise-flash {
  position: fixed;
  inset: 0;
  z-index: 70;
  pointer-events: none;
}
.praise-flash-full {
  width: 100%;
  height: 100%;
  background: var(--praise-flash-color, transparent);
  opacity: 0;
  animation: praiseFlash 720ms ease-out forwards;
}
.praise-flash-hole {
  position: absolute;
  background: transparent;
  box-shadow: 0 0 0 9999px var(--praise-flash-color, transparent);
  border-radius: var(--praise-flash-radius, 16px);
  opacity: 0;
  animation: praiseFlash 720ms ease-out forwards;
}
.praise-outline {
  -webkit-text-stroke: 1.5px rgba(0, 0, 0, 0.95);
  paint-order: stroke fill;
  text-shadow: none;
}
.praise-bronze {
  background:
    linear-gradient(140deg, #ffe1c6 0%, #ffb058 35%, #ff7e1a 70%, #d45505 100%);
  background-size: 240% 240%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  --praise-extra-anim: praiseShine 1s ease-in-out infinite;
  filter:
    drop-shadow(0 2px 6px rgba(210, 102, 25, 0.35))
    drop-shadow(0 1px 2px rgba(255, 204, 160, 0.45));
}
.praise-silver {
  background:
    linear-gradient(135deg, #ffffff 0%, #e7f0ff 30%, #b9c7dc 58%, #f6fbff 78%, #8ea0b8 100%);
  background-size: 240% 240%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  --praise-extra-anim: praiseShine 1.05s ease-in-out infinite;
  filter:
    drop-shadow(0 2px 6px rgba(118, 132, 150, 0.35))
    drop-shadow(0 1px 2px rgba(233, 243, 255, 0.7));
}
.praise-gold {
  background:
    linear-gradient(135deg, #fff2a8 0%, #ffd84a 30%, #ffb300 58%, #ffef9a 78%, #d78200 100%);
  background-size: 240% 240%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  --praise-extra-anim: praiseShine 0.95s ease-in-out infinite;
  filter:
    drop-shadow(0 3px 8px rgba(176, 98, 13, 0.35))
    drop-shadow(0 1px 3px rgba(255, 230, 140, 0.7));
}
.praise-gobble {
  position: relative;
  background:
    linear-gradient(120deg, #fff7b0 0%, #ffd166 30%, #f59e0b 60%, #ffe27a 100%);
  background-size: 220% 220%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  --praise-extra-anim: gobbleShine 1.15s ease-in-out infinite;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.18),
    0 3px 8px rgba(0, 0, 0, 0.18);
}
  .preview-tile {
  position: relative;
  width: 32px;
  height: 36px;
  border-radius: 0.5rem;
  /* même palette que les tuiles de base : bg-orange-200 / border-orange-500 */
  background: #fed7aa;              /* orange-200 */
  border: 2px solid #f97316;        /* orange-500 */
  color: #111827;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.1rem;
  box-shadow:
    -1px 0 0 rgba(15, 23, 42, 0.20),   /* ombre côté gauche */
    0 2px 0 rgba(15, 23, 42, 0.28),    /* ombre en bas */
    0 6px 12px rgba(15, 23, 42, 0.45); /* ombre portée globale */
  transform-origin: center center;
  overflow: hidden;
}

.preview-tile::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(to right, rgba(0, 0, 0, 0.18), transparent 35%),
    linear-gradient(to top,   rgba(0, 0, 0, 0.22), transparent 45%);
  mix-blend-mode: multiply;
}


body.theme-dark .preview-tile {
  background: #fed7aa;
  border-color: #f97316;
  color: #111827;
}
.bonus-letter-tile {
  background:
    linear-gradient(145deg, #ffe9a8 0%, #f7c969 28%, #e09a2f 62%, #b8741b 100%);
  border: 2px solid #b8741b;
  color: #2a1600;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 -2px 4px rgba(120, 53, 15, 0.5),
    -1px 0 0 rgba(120, 53, 15, 0.45),
    0 2px 0 rgba(120, 53, 15, 0.55),
    0 6px 12px rgba(120, 53, 15, 0.55);
}
body.theme-dark .bonus-letter-tile {
  background:
    linear-gradient(145deg, #ffe7a1 0%, #f4c55d 26%, #e0932a 62%, #b46a16 100%);
  border-color: #b8741b;
  color: #1a0f00;
}
.bonus-letter-tile::after {
  content: "";
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0) 45%),
    radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 60%);
  mix-blend-mode: screen;
  pointer-events: none;
}
  .board-tile {
  position: relative;
  box-shadow:
    -1px 0 0 rgba(15, 23, 42, 0.25),   /* ombre côté gauche */
    0 2px 0 rgba(15, 23, 42, 0.32),    /* ombre en bas */
    0 6px 12px rgba(15, 23, 42, 0.35); /* ombre portée globale */
  transform-origin: center center;
  overflow: hidden;
}

.board-tile::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(to right, rgba(0, 0, 0, 0.18), transparent 35%),
    linear-gradient(to top,   rgba(0, 0, 0, 0.22), transparent 45%);
  mix-blend-mode: multiply;
}

body.theme-dark .board-tile::after {
  /* un peu plus doux en dark pour éviter la bouillie */
  background:
    linear-gradient(to right, rgba(0, 0, 0, 0.14), transparent 35%),
    linear-gradient(to top,   rgba(0, 0, 0, 0.18), transparent 45%);
}

body.theme-dark .tile-hint {
  box-shadow:
    0 0 0 3px rgba(16, 185, 129, 0.7),
    inset 0 0 0 2px rgba(16, 185, 129, 0.7);
  background: rgba(167, 243, 208, 0.9) !important;
}

`;

const DEFAULT_CHAT_VISIBLE_LINES = 18;
const DEFAULT_CHAT_FULL_VISIBLE_LINES = 9;
const CHAT_BUFFER_MAX = 200;
const CHAT_MIN_VISIBLE_LINES = 8;
const CHAT_MAX_VISIBLE_LINES = 40;
const MIN_CHAT_OPACITY = 0.03;
const BIG_SCORE_THRESHOLD = 100;
const CHAT_MIN_DELAY = 600;
const CHAT_DRAWER_ANIM_MS = 1000;
const TARGET_HINT_FIRST_MS = 15 * 1000;
const TARGET_HINT_STEP_MS = 15 * 1000;
const DISCONNECT_GRACE_MS = 30 * 1000;
const QUICK_REPLIES = ["GG !", "Bien joué", "On continue ?", "Belle grille !"];
const INSTALL_ID_STORAGE_KEY = "gobble_install_id";
const CHAT_RULES_STORAGE_KEY = "gobble_chat_rules_accepted";
const TUTORIAL_SEEN_STORAGE_KEY = "gobble_tutorial_seen_install_id";
const GUIDED_RESULTS_SEEN_STORAGE_KEY = "gobble_guided_results_seen_install_id_v2";
const SPECIAL_TUTORIAL_SEEN_STORAGE_KEY = "gobble_special_tutorial_seen_install_id_v2";
const TWO_LETTER_POPUP_SEEN_STORAGE_KEY = "gobble_two_letter_popup_seen_v1";
const BLOCKED_INSTALL_IDS_STORAGE_KEY = "gobble_blocked_install_ids";
const SESSION_STORAGE_KEY = "gobble_session_v1";
const VOCAB_OVERLAY_SEEN_STORAGE_KEY = "gobble_vocab_overlay_seen_key_v1";
const SETTINGS_STORAGE_KEY = "gobble_settings_v1";
const readLocalSettings = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_) {
    return {};
  }
};
const GUIDED_RESULTS_STEPS = {
  SWIPE_TOTAL: "swipe_total",
  SWIPE_FOUND: "swipe_found",
  SWIPE_ALL: "swipe_all",
  TAP_WORD: "tap_word",
  TAP_DEFINITION: "tap_definition",
};
const GUIDED_RESULTS_STEP_ORDER = [
  GUIDED_RESULTS_STEPS.SWIPE_TOTAL,
  GUIDED_RESULTS_STEPS.SWIPE_FOUND,
  GUIDED_RESULTS_STEPS.SWIPE_ALL,
  GUIDED_RESULTS_STEPS.TAP_WORD,
  GUIDED_RESULTS_STEPS.TAP_DEFINITION,
];
const GUIDED_RESULTS_PAGE_TO_STEP = {
  round: GUIDED_RESULTS_STEPS.SWIPE_TOTAL,
  total: GUIDED_RESULTS_STEPS.SWIPE_FOUND,
  found: GUIDED_RESULTS_STEPS.SWIPE_ALL,
  all: GUIDED_RESULTS_STEPS.TAP_WORD,
};
const SPECIAL_TUTORIAL_HINT_FIRST_S = 15;
const SPECIAL_TUTORIAL_HINT_STEP_S = 15;
const SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK = 11;
const SPECIAL_TUTORIAL_BONUS_TILE_STYLES = {
  L2: { bg: "rgba(163,196,243,0.85)", border: "rgba(99,147,230,0.9)", text: "#0f172a" },
  L3: { bg: "rgba(51,93,227,0.8)", border: "rgba(30,64,175,0.95)", text: "#ffffff" },
  M2: { bg: "rgba(255,191,180,0.9)", border: "rgba(248,113,113,0.95)", text: "#0f172a" },
  M3: { bg: "rgba(239,68,68,0.85)", border: "rgba(185,28,28,0.95)", text: "#ffffff" },
};
const REPORT_REASONS = [
  "Spam",
  "Harcèlement",
  "Contenu inapproprié",
  "Infos perso",
  "Autre",
];
function generateInstallId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `iid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
function getOrCreateInstallId() {
  try {
    const existing = localStorage.getItem(INSTALL_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const legacy = localStorage.getItem("boggle_client_id");
    if (legacy && legacy.trim()) {
      localStorage.setItem(INSTALL_ID_STORAGE_KEY, legacy.trim());
      return legacy.trim();
    }
    const fresh = generateInstallId();
    localStorage.setItem(INSTALL_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch (_) {
    return generateInstallId();
  }
}

const formatNumber = (value) =>
  typeof value === "number" ? value.toLocaleString("fr-FR") : null;

const LEAGUE_META = {
  Bronze: {
    label: "Bronze",
    light: { accent: "#b9794a", bg: "#f4e8de" },
    dark: { accent: "#c58a59", bg: "#3b2a1d" },
  },
  Argent: {
    label: "Argent",
    light: { accent: "#9aa4b2", bg: "#eef1f4" },
    dark: { accent: "#b4beca", bg: "#1f2630" },
  },
  Or: {
    label: "Or",
    light: { accent: "#e7b43c", bg: "#fff2cf" },
    dark: { accent: "#f0c057", bg: "#3a2a05" },
  },
  Cristal: {
    label: "Cristal",
    light: { accent: "#47a7ff", bg: "#e0f1ff" },
    dark: { accent: "#6cb8ff", bg: "#0b2033" },
  },
  Master: {
    label: "Master",
    light: { accent: "#8c7bff", bg: "#efeaff" },
    dark: { accent: "#a595ff", bg: "#251b3c" },
  },
  "L\u00e9gende": {
    label: "L\u00e9gende",
    light: { accent: "#ff6a8a", bg: "#ffe4ea" },
    dark: { accent: "#ff8fa6", bg: "#3a141e" },
  },
};

const VOCAB_LEVELS = [
  { key: "debutant", label: "Debutant", min: 0, max: 500, imageKey: IMAGE_KEYS.vocab.debutant, color: "#f59e0b" },
  { key: "ecolier", label: "Ecolier", min: 500, max: 2000, imageKey: IMAGE_KEYS.vocab.ecolier, color: "#22c55e" },
  { key: "collegien", label: "Collegien", min: 2000, max: 5000, imageKey: IMAGE_KEYS.vocab.collegien, color: "#ef4444" },
  { key: "lyceen", label: "Lyceen", min: 5000, max: 10000, imageKey: IMAGE_KEYS.vocab.lyceen, color: "#f59e0b" },
  { key: "etudiant", label: "Etudiant", min: 10000, max: 20000, imageKey: IMAGE_KEYS.vocab.etudiant, color: "#3b82f6" },
  { key: "expert", label: "Expert", min: 20000, max: 300000, imageKey: IMAGE_KEYS.vocab.expert, color: "#facc15" },
];
function getLeaguePalette(league, darkMode) {
  const meta = LEAGUE_META[league] || LEAGUE_META.Bronze;
  return darkMode ? meta.dark : meta.light;
}

function getVocabLevelMeta(count) {
  const safe = Number.isFinite(count) ? Math.max(0, count) : 0;
  for (const level of VOCAB_LEVELS) {
    if (safe >= level.min && safe < level.max) return level;
  }
  return VOCAB_LEVELS[VOCAB_LEVELS.length - 1];
}

function getVocabProgress(count) {
  const safe = Number.isFinite(count) ? Math.max(0, count) : 0;
  for (let i = 0; i < VOCAB_LEVELS.length; i++) {
    const level = VOCAB_LEVELS[i];
    const max = Number.isFinite(level.max) ? level.max : Infinity;
    if (safe < max) {
      const range = Number.isFinite(level.max)
        ? Math.max(1, level.max - level.min)
        : 1;
      const segmentProgress = Number.isFinite(level.max)
        ? clampValue((safe - level.min) / range, 0, 1)
        : 1;
      const pct = clampValue((i + segmentProgress) / VOCAB_LEVELS.length, 0, 1);
      return { value: safe, pct };
    }
  }
  return { value: safe, pct: 1 };
}

export default function App() {
  const initialRoomId = getDefaultRoomId();
  const initialGridSize = getGridSizeForRoom(initialRoomId);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [gridSize, setGridSize] = useState(initialGridSize);
  const [gridRotationTurns, setGridRotationTurns] = useState(0);
  const [phase, setPhase] = useState("lobby");
  const [tick, setTick] = useState(0);
  const [board, setBoard] = useState(
    Array(initialGridSize * initialGridSize).fill({ letter: "?", bonus: null })
  );
  const [currentTiles, setCurrentTiles] = useState([]);
  const [highlightPath, setHighlightPath] = useState([]);
  const [dictionary, setDictionary] = useState(null);
  const [accepted, setAccepted] = useState([]);
  const [submissionTick, setSubmissionTick] = useState(0);
  const [score, setScore] = useState(0);
  const [shakeGrid, setShakeGrid] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const statusHoldRef = useRef({ text: "", until: 0 });
  const statusHoldTimerRef = useRef(null);
  const [, setStatusHoldTick] = useState(0);
  const [lastWords, setLastWords] = useState([]);
  const [showAllWords, setShowAllWords] = useState(false);
  const [sortMode, setSortMode] = useState("score");
  const [allWords, setAllWords] = useState([]);
  const [toast, setToast] = useState(null);
  const [shake, setShake] = useState(false);
  const tileRefs = useRef([]);
  const [inputLocked, setInputLocked] = useState(false);
  const inputLockedRef = useRef(false);
  const outroInFlightRef = useRef(false);
  const outroRoundRef = useRef(null);
  const [implodeActive, setImplodeActive] = useState(false);
  const implodeRoundRef = useRef(null);
  const implodeTimerRef = useRef(null);
  const implodePhaseTimerRef = useRef(null);
  const implodeFallbackRef = useRef(false);
  const pendingRoundEndRef = useRef(null);
  const pendingBreakStartRef = useRef(null);
  const processRoundEndedRef = useRef(null);
  const processBreakStartedRef = useRef(null);
  const playOutroThenResultsRef = useRef(null);
  const gridRotateAnimRef = useRef(null);
  const gridRotateTimerRef = useRef(null);
  const [isGridRotating, setIsGridRotating] = useState(false);
  const [lastInputMode, setLastInputMode] = useState("keyboard");
  const audioCtxRef = useRef(null);
  const audioSystemRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const audioVoiceRef = useRef({
    activeVoices: 0,
    maxVoices: AUDIO_POLYPHONY_LIMIT,
    lastPlayed: new Map(),
    drops: 0,
    lastLogAt: 0,
  });
  const blackHoleHandleRef = useRef(null);
  const blackHoleChebHandleRef = useRef(null);
  const blackHoleClavierHandleRef = useRef(null);
  const blackHoleSourisLoopRef = useRef({ intervalId: null, stopTimer: null });
  const blackHoleClavierFadeRef = useRef(null);
  const blackHoleAuxStopRef = useRef(null);
  const blackHoleSyncTokenRef = useRef(0);
  const tickCountdownPlayedRef = useRef(false);
  const countdownTickPlayedRef = useRef(false);
  const ambientMusicRef = useRef({
    audio: null,
    index: -1,
    order: null,
    orderKey: "",
    lastTrack: null,
    fadeRaf: null,
    fadeTimer: null,
    startGuard: null,
    playCheck: null,
    keepAlive: false,
    primed: false,
    active: false,
  });
  const ambientStartPendingRef = useRef(false);
  const ambientRetryRef = useRef(false);
  const lastAmbientPhaseRef = useRef(null);
  const roundStartPendingRef = useRef(null);
  const roundStartRetryRef = useRef(false);
  const roundStartAtRef = useRef(0);
  const tileStepRef = useRef(0);         // <-- AJOUT
  const isTouchDeviceRef = useRef(false);
  const gridRef = useRef(null);
  const canVibrateRef = useRef(false);
  const initialSettingsRef = useRef(null);
  if (initialSettingsRef.current === null) {
    initialSettingsRef.current = readLocalSettings();
  }
  const initialSettings = initialSettingsRef.current || {};
  const [gridWidth, setGridWidth] = useState(null);
  const [isSfxMuted, setIsSfxMuted] = useState(() =>
    typeof initialSettings.sfxMuted === "boolean" ? initialSettings.sfxMuted : false
  );
  const isSfxMutedRef = useRef(isSfxMuted);
  const [isAmbientMuted, setIsAmbientMuted] = useState(() =>
    typeof initialSettings.ambientMuted === "boolean" ? initialSettings.ambientMuted : false
  );
  const isAmbientMutedRef = useRef(isAmbientMuted);
  const [isVibrationEnabled, setIsVibrationEnabled] = useState(() =>
    typeof initialSettings.vibration === "boolean" ? initialSettings.vibration : true
  );
  const isVibrationEnabledRef = useRef(isVibrationEnabled);
  const [canVibrate, setCanVibrate] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof initialSettings.darkMode === "boolean") {
      return initialSettings.darkMode;
    }
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [ambientTracks, setAmbientTracks] = useState(AMBIENT_MUSIC_TRACKS_DEFAULT);
  const ambientTracksRef = useRef(AMBIENT_MUSIC_TRACKS_DEFAULT);
  useEffect(() => {
    ambientTracksRef.current = ambientTracks;
  }, [ambientTracks]);
  const [bootProgress, setBootProgress] = useState(() => ({
    loaded: 0,
    total: BOOT_ASSET_MANIFEST.length,
    errors: 0,
    done: false,
    stage: "",
    key: "",
  }));
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    const run = async () => {
      const resolvedAmbientTracks = await loadAmbientTrackList();
      if (cancelled) return;
      if (
        Array.isArray(resolvedAmbientTracks) &&
        resolvedAmbientTracks.length &&
        resolvedAmbientTracks !== ambientTracksRef.current
      ) {
        ambientTracksRef.current = resolvedAmbientTracks;
        setAmbientTracks(resolvedAmbientTracks);
      }
      const ambientManifest = buildFileManifest(resolvedAmbientTracks || []);
      const bootManifest = dedupeManifest([
        ...BOOT_ASSET_MANIFEST,
        ...ambientManifest,
      ]);
      AssetManager.setAudioSystemProvider(getAudioSystem);
      AssetManager.setMuted(isSfxMutedRef.current);
      AssetManager.setMasterVolume(1);
      AssetManager.registerManifest(bootManifest);
      const total = bootManifest.length;
      if (!total) {
        setBootProgress((prev) => ({ ...prev, total: 0, done: true, stage: "", key: "" }));
        return;
      }
      let loaded = 0;
      let errors = 0;
      setBootProgress((prev) => ({
        ...prev,
        loaded: 0,
        errors: 0,
        total,
        stage: "",
        key: "",
      }));
      const startedAt = performance.now();
      const tickProgress = ({ ok, key, stage }) => {
        loaded += 1;
        if (!ok) errors += 1;
        if (!cancelled) {
          setBootProgress((prev) => ({
            ...prev,
            loaded,
            errors,
            total,
            stage: stage || "",
            key: key || "",
          }));
        }
      };
      await AssetManager.preload({
        priority: "critical",
        onProgress: ({ ok, key, stage }) => tickProgress({ ok, key, stage: stage || "critical" }),
        concurrency: 4,
      });
      await AssetManager.preload({
        priority: "high",
        onProgress: ({ ok, key, stage }) => tickProgress({ ok, key, stage: stage || "high" }),
        concurrency: 4,
      });
      await AssetManager.preload({
        priority: "all",
        onProgress: ({ ok, key, stage }) => tickProgress({ ok, key, stage: stage || "low" }),
        concurrency: 4,
      });
      const elapsed = performance.now() - startedAt;
      const delay = Math.max(0, BOOT_MIN_HOLD_MS - elapsed);
      window.setTimeout(() => {
        if (cancelled) return;
        setBootProgress((prev) => ({
          ...prev,
          loaded,
          errors,
          total,
          done: true,
        }));
      }, delay);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);
  const [showHelp, setShowHelp] = useState(false);
  const [appView, setAppView] = useState("home"); // home | daily | daily_play | daily_results | live
  const [analysis, setAnalysis] = useState(null);
  const missingImageRef = useRef(new Set());
  const assetVersion = bootProgress?.done ? 1 : 0;
  const getImageUrl = (key) => {
    if (!key) return "";
    const url = AssetManager.getImage(key).url || "";
    if (url) return url;
    if (bootProgress?.done) {
      if (DEV_MODE && !missingImageRef.current.has(key)) {
        missingImageRef.current.add(key);
        console.error(`[asset] image manquante (no-fallback): ${key}`);
      }
      return "";
    }
    const fallback = IMAGE_FALLBACKS.get(key) || "";
    if (fallback && DEV_MODE && !missingImageRef.current.has(key)) {
      missingImageRef.current.add(key);
      console.error(`[asset] image manquante (fallback): ${key}`);
    }
    return fallback;
  };
  const getFileUrl = (key) => {
    if (!key) return "";
    return AssetManager.getFileUrl(key) || "";
  };
  const resolveAmbientSrc = (src) => {
    if (!src) return "";
    return getFileUrl(makeFileKey(src));
  };
  const [highlightPlayers, setHighlightPlayers] = useState([]);
  const listItemRefs = useRef(new Map());
  const mobileHeaderRef = useRef(null);
  const mobileRankingRef = useRef(null);
  const mobileHelpRef = useRef(null);
  const safeAreaProbeRef = useRef(null);
  const safeAreaTopProbeRef = useRef(null);
  const prevPositionsRef = useRef(new Map());
  const [bigScoreFlash, setBigScoreFlash] = useState(null);
  const [praiseFlash, setPraiseFlash] = useState(null);
  const [gobbleFlash, setGobbleFlash] = useState(null);
  const [gridShake, setGridShake] = useState(false);
  const [mobileResultsPage, setMobileResultsPage] = useState(0);
  const resultsTouchRef = useRef({ startX: null, startY: null });
  const resultsSlideWidthRef = useRef(0);
  const resultsDraggingRef = useRef(false);
  const [resultsSlidePhase, setResultsSlidePhase] = useState("idle");
  const resultsSlideOutTimerRef = useRef(null);
  const resultsSlideInTimerRef = useRef(null);
  const [resultsMetaPulse, setResultsMetaPulse] = useState(false);
  const resultsMetaPulseStartTimerRef = useRef(null);
  const resultsMetaPulseEndTimerRef = useRef(null);
  const [finalePage, setFinalePage] = useState(0);
  const finaleScrollRef = useRef(null);
  const finaleTouchRef = useRef({ startX: null, startY: null });
  const finaleDraggingRef = useRef(false);
  const finaleSlideWidthRef = useRef(0);
  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem("boggle_nick") || "";
    } catch (_) {
      return "";
    }
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [roundId, setRoundId] = useState(null);
  const [devPerfStats, setDevPerfStats] = useState(() => ({
    longTasks: 0,
    lastLongTaskMs: 0,
    lastLongTaskAt: null,
    lastSolveAllAt: null,
  }));
  const roundStartSoundRef = useRef(null);
  const tickRef = useRef(tick);
  const tickIntervalRef = useRef(null);
  const [serverEndsAt, setServerEndsAt] = useState(null);
  const [serverRoundDurationMs, setServerRoundDurationMs] = useState(null);
  const [players, setPlayers] = useState([]);
  const [provisionalRanking, setProvisionalRanking] = useState([]);
  const [finalResults, setFinalResults] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [isWeeklyOpen, setIsWeeklyOpen] = useState(false);
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [weeklyStatsLoading, setWeeklyStatsLoading] = useState(false);
  const [weeklyStatsError, setWeeklyStatsError] = useState("");
  const weeklyStatsSnapshotRef = useRef(null);
  const tournamentBaselineRef = useRef({
    id: null,
    weeklyStats: null,
    rankingMap: null,
    rankingRound: null,
  });
  const [weeklyActiveIndex, setWeeklyActiveIndex] = useState(0);
  const weeklyTouchRef = useRef({ startX: null, startY: null });
  const weeklyFetchRef = useRef({ last: 0, lastTopN: null });
  const weeklySlideWidthRef = useRef(0);
  const [weeklyDragOffset, setWeeklyDragOffset] = useState(0);
  const [weeklyDragging, setWeeklyDragging] = useState(false);
  const weeklySwipeBlockRef = useRef(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [seasonActiveIndex, setSeasonActiveIndex] = useState(0);
  const seasonTouchRef = useRef({ startX: null, startY: null });
  const seasonSlideWidthRef = useRef(0);
  const [seasonDragOffset, setSeasonDragOffset] = useState(0);
  const [seasonDragging, setSeasonDragging] = useState(false);
  const seasonSwipeBlockRef = useRef(0);
  const [weeklyArrowVisible, setWeeklyArrowVisible] = useState(false);
  const [weeklyArrowBlink, setWeeklyArrowBlink] = useState(false);
  const [weeklyArrowBump, setWeeklyArrowBump] = useState(false);
  const weeklyArrowTimerRef = useRef(null);
  const weeklyArrowBlinkTimerRef = useRef(null);
  const weeklyArrowBumpTimerRef = useRef(null);
  const weeklyArrowSeenRef = useRef(false);
  const [roomsStats, setRoomsStats] = useState([]);
  const [lobbyPlayersList, setLobbyPlayersList] = useState([]);
  const [lobbyPlayersLoading, setLobbyPlayersLoading] = useState(false);
  const [lobbyRoomStatus, setLobbyRoomStatus] = useState(null);
  const [isPlayersOverlayOpen, setIsPlayersOverlayOpen] = useState(false);
  const [playersOverlayMode, setPlayersOverlayMode] = useState("snapshot");
  const [playersOverlaySnapshot, setPlayersOverlaySnapshot] = useState([]);
  const [canResumeSession, setCanResumeSession] = useState(false);
  const [resumeSnapshot, setResumeSnapshot] = useState(null);
  const [resumePending, setResumePending] = useState(false);
  const autoResumeEnabledRef = useRef(false);
  const [serverStatus, setServerStatus] = useState("waiting");
  const serverTimeOffsetRef = useRef(0); // ms: serverNow - clientNow
  const [announcements, setAnnouncements] = useState([]);
  const [roundStats, setRoundStats] = useState(null);
  const [specialRound, setSpecialRound] = useState(null);
  const [nextStartAt, setNextStartAt] = useState(null);
  const [breakCountdown, setBreakCountdown] = useState(null);
  const breakCountdownRef = useRef(breakCountdown);
  const [upcomingSpecial, setUpcomingSpecial] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState("");
  const [installSupport, setInstallSupport] = useState("unknown"); // unknown | available | unavailable | installed | maybe
  const [isFullscreen] = useState(false);
  const [mobileHeaderOffsetPx, setMobileHeaderOffsetPx] = useState(0);
  const [isMobileLayout, setIsMobileLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return computeIsMobileLayout();
  });
  const [isUltraCompact, setIsUltraCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return computeIsUltraCompact();
  });
  const [mobileLayoutSizing, setMobileLayoutSizing] = useState({
    viewportWidth: 0,
    viewportHeight: 0,
    gridSide: 0,
    rankingHeight: 0,
    wordPreviewHeight: 0,
    liveFeedHeight: 0,
    liveFeedMinHeight: 0,
    bodyHeight: 0,
  });
  const [chatViewportHeight, setChatViewportHeight] = useState(0);
  const chatBaselineHeightRef = useRef(0);
  const [chatKeyboardInsetPx, setChatKeyboardInsetPx] = useState(0);
  const [isChatOpenMobile, setIsChatOpenMobile] = useState(false);
  const [isChatClosing, setIsChatClosing] = useState(false);
  const chatCloseTimerRef = useRef(null);
  const [mobileChatUnreadCount, setMobileChatUnreadCount] = useState(0);
  const [chatRulesAccepted, setChatRulesAccepted] = useState(() => {
    try {
      return localStorage.getItem(CHAT_RULES_STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  });
  const [isChatRulesOpen, setIsChatRulesOpen] = useState(false);
  const chatRulesConfirmRef = useRef(null);
  const chatInputType = React.useMemo(() => {
    if (typeof navigator === "undefined") return "text";
    const ua = navigator.userAgent || "";
    const isAndroidChrome =
      /Android/i.test(ua) &&
      /Chrome/i.test(ua) &&
      !/EdgA|OPR|SamsungBrowser/i.test(ua);
    return isAndroidChrome ? "search" : "text";
  }, []);
  const [medals, setMedals] = useState({});
  const [tournament, setTournament] = useState(null); // { id, round, totalRounds, ... }
  const [tournamentTotals, setTournamentTotals] = useState({}); // nick -> points
  const [tournamentRanking, setTournamentRanking] = useState([]); // [{ nick, score }]
  const [tournamentRoundPoints, setTournamentRoundPoints] = useState({}); // nick -> points earned this round
  const [tournamentSummary, setTournamentSummary] = useState(null); // finale: { winnerNick, records, ranking }
  const [tournamentSummaryAt, setTournamentSummaryAt] = useState(null);
  const [tournamentFinaleHoldUntil, setTournamentFinaleHoldUntil] = useState(null);
  const [targetSummary, setTargetSummary] = useState(null); // { word, foundOrder }
  const [breakKind, setBreakKind] = useState(null); // between_rounds | tournament_end
  const breakKindRef = useRef(breakKind);
  const [resultsRankingMode, setResultsRankingMode] = useState("round"); // round | total
  const [specialHint, setSpecialHint] = useState(null); // { kind, pattern, length, cells }
  const [specialSolvedOverlay, setSpecialSolvedOverlay] = useState(null); // { nick, word, kind }
  const [foundTargetThisRound, setFoundTargetThisRound] = useState(false);
  const [foundTargetWord, setFoundTargetWord] = useState("");
  const [targetDefinition, setTargetDefinition] = useState({
    word: "",
    loading: false,
    ok: false,
    definition: "",
    source: "",
    url: "",
  });
  const [installId] = useState(() => getOrCreateInstallId());
  const [dailyStatus, setDailyStatus] = useState({
    loading: false,
    ready: false,
    hasPlayed: false,
    dateId: null,
    myResult: null,
    champion: null,
    error: "",
  });
  const [dailyBoard, setDailyBoard] = useState({
    loading: false,
    ready: false,
    dateId: null,
    entries: [],
    error: "",
  });
  const [dailyHistory, setDailyHistory] = useState({ days: [], crownTotals: [] });
  const [dailyHistoryLoading, setDailyHistoryLoading] = useState(false);
  const [dailyHistoryError, setDailyHistoryError] = useState("");
  const [dailyHistoryIndex, setDailyHistoryIndex] = useState(0);
  const [dailyRankingView, setDailyRankingView] = useState("today");
  const dailyHistoryScrollRef = useRef(null);
  const [dailyResult, setDailyResult] = useState(null);
  const [dailyStartError, setDailyStartError] = useState("");
  const [dailySubmitError, setDailySubmitError] = useState("");
  const dailySessionRef = useRef({ dateId: null, startedAt: null });
  const dailySubmitRef = useRef({ inFlight: false });
  const [tutorialSeenInstallId, setTutorialSeenInstallId] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_SEEN_STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  });
  const [twoLetterPopupOpen, setTwoLetterPopupOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialPendingLogin, setTutorialPendingLogin] = useState(false);
  const [guidedResultsSeenInstallId, setGuidedResultsSeenInstallId] = useState(() => {
    try {
      return localStorage.getItem(GUIDED_RESULTS_SEEN_STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  });
  const [guidedResultsStep, setGuidedResultsStep] = useState(null);
  const [specialTutorialSeen, setSpecialTutorialSeen] = useState(() => {
    try {
      const raw = localStorage.getItem(SPECIAL_TUTORIAL_SEEN_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        const installId = typeof parsed.installId === "string" ? parsed.installId : "";
        const types =
          parsed.types && typeof parsed.types === "object" && !Array.isArray(parsed.types)
            ? parsed.types
            : {};
        return { installId, types };
      }
    } catch (_) {}
    return { installId: "", types: {} };
  });
  const [specialTutorialPlan, setSpecialTutorialPlan] = useState(null);
  const twoLetterPopupKey = installId
    ? `${TWO_LETTER_POPUP_SEEN_STORAGE_KEY}:${installId}`
    : TWO_LETTER_POPUP_SEEN_STORAGE_KEY;
  useEffect(() => {
    if (!installId) return;
    try {
      const seen = localStorage.getItem(twoLetterPopupKey);
      if (seen === "1") return;
    } catch (_) {}
    setTwoLetterPopupOpen(true);
  }, [installId, twoLetterPopupKey]);
  const [isSpecialTutorialOpen, setIsSpecialTutorialOpen] = useState(false);
  const shouldShowTutorial =
    tutorialSeenInstallId && installId ? tutorialSeenInstallId !== installId : true;
  const isDailyView = appView === "daily" || appView === "daily_play" || appView === "daily_results";
  const isDailyPlay = appView === "daily_play";
  const completeGuidedResultsTutorial = React.useCallback(() => {
    if (!installId) return;
    try {
      localStorage.setItem(GUIDED_RESULTS_SEEN_STORAGE_KEY, installId);
    } catch (_) {}
    setGuidedResultsSeenInstallId(installId);
    setGuidedResultsStep(null);
  }, [installId]);
  const markSpecialTutorialSeen = React.useCallback(
    (type) => {
      if (!type) return;
      setSpecialTutorialSeen((prev) => {
        const nextInstallId = installId || prev?.installId || "";
        const nextTypes = { ...(prev?.types || {}) };
        nextTypes[type] = true;
        const next = { installId: nextInstallId, types: nextTypes };
        try {
          localStorage.setItem(SPECIAL_TUTORIAL_SEEN_STORAGE_KEY, JSON.stringify(next));
        } catch (_) {}
        return next;
      });
    },
    [installId]
  );

  function returnToLobby() {
    setIsSettingsOpen(false);
    setAppView("home");
    dailySessionRef.current = { dateId: null, startedAt: null };
    setDailyResult(null);
    if (!isLoggedInRef.current) return;
    manualDisconnectRef.current = true;
    clearSavedSession();
    setIsLoggedIn(false);
    setConnectionError("");
    try {
      socket.disconnect();
    } catch (_) {}
  }
  const sessionRef = useRef(null);
  const resumeLockRef = useRef(false);
  const resumeLockAtRef = useRef(0);
  const resumeProbeRef = useRef({ inFlight: false, lastAt: 0 });
  const roundHandlersRef = useRef({
    onRoundStarted: null,
    onRoundEnded: null,
    onBreakStarted: null,
  });
  const isLoggedInRef = useRef(false);
  const nicknameRef = useRef(nickname);
  const phaseRef = useRef(phase);
  const currentRoomIdRef = useRef(currentRoomId);
  const roundIdRef = useRef(roundId);
  const tournamentRef = useRef(tournament);
  const startGameFromServerRef = useRef(null);
  const pingInFlightRef = useRef(false);
  const watchdogTimerRef = useRef(null);

  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);
  useEffect(() => {
    if (isLoggedIn) {
      setAppView("live");
    }
  }, [isLoggedIn]);
  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    if (!DEV_MODE) return;
    if (phase === "playing") {
      setDevPerfStats((prev) => ({
        ...prev,
        longTasks: 0,
        lastLongTaskMs: 0,
        lastLongTaskAt: null,
      }));
    }
  }, [phase]);
  useEffect(() => {
    inputLockedRef.current = inputLocked;
  }, [inputLocked]);
  useEffect(() => {
    isSfxMutedRef.current = isSfxMuted;
    AssetManager.setMuted(isSfxMuted);
  }, [isSfxMuted]);
  useEffect(() => {
    isAmbientMutedRef.current = isAmbientMuted;
  }, [isAmbientMuted]);
  useEffect(() => {
    isVibrationEnabledRef.current = isVibrationEnabled;
  }, [isVibrationEnabled]);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          darkMode,
          sfxMuted: isSfxMuted,
          ambientMuted: isAmbientMuted,
          vibration: isVibrationEnabled,
        })
      );
    } catch (_) {}
  }, [darkMode, isSfxMuted, isAmbientMuted, isVibrationEnabled]);
  useEffect(() => {
    currentRoomIdRef.current = currentRoomId;
  }, [currentRoomId]);
  useEffect(() => {
    roundIdRef.current = roundId;
  }, [roundId]);
  useEffect(() => {
    breakCountdownRef.current = breakCountdown;
  }, [breakCountdown]);
  useEffect(() => {
    breakKindRef.current = breakKind;
  }, [breakKind]);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);
  useEffect(() => {
    tournamentRef.current = tournament;
  }, [tournament]);
  useEffect(() => {
    if (!installId) return;
    setSpecialTutorialSeen((prev) => {
      if (prev?.installId === installId) return prev;
      const next = { installId, types: {} };
      try {
        localStorage.setItem(SPECIAL_TUTORIAL_SEEN_STORAGE_KEY, JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }, [installId]);

  // Zone active pour le clavier : "game" ou "chat"
  const [activeArea, setActiveArea] = useState("game");

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [blockedInstallIds, setBlockedInstallIds] = useState(() => {
    try {
      const raw = localStorage.getItem(BLOCKED_INSTALL_IDS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim());
    } catch (_) {
      return [];
    }
  });
  const [showBlockedList, setShowBlockedList] = useState(false);
  const [userMenu, setUserMenu] = useState({
    open: false,
    left: 0,
    top: 0,
    nick: "",
    installId: null,
    messageId: null,
  });
  const [reportDialog, setReportDialog] = useState({
    open: false,
    reportedInstallId: null,
    reportedNick: "",
    messageId: null,
    reason: "",
    details: "",
  });
  const [definitionModal, setDefinitionModal] = useState({
    open: false,
    loading: false,
    ok: false,
    word: "",
    lemma: "",
    lemmaLabel: "",
    lemmaGuess: false,
    participleBase: "",
    participleLabel: "",
    participleGuess: false,
    inflectionBase: "",
    inflectionLabel: "",
    inflectionGuess: false,
    matchedTitle: "",
    phraseGuess: false,
    title: "",
    definition: "",
    source: "",
    url: "",
    fromWordInfo: false,
  });
  const [wordInfoModal, setWordInfoModal] = useState({
    open: false,
    word: "",
    foundBy: [],
  });
  const [recordModal, setRecordModal] = useState({
    open: false,
    categoryKey: "",
    categoryLabel: "",
    nick: "",
    rank: null,
    rankTotal: null,
    word: "",
    timeMs: null,
    wordsCount: null,
    records: [],
  });
  const [definitionBlink, setDefinitionBlink] = useState(false);
  const [chatVisibleLimit, setChatVisibleLimit] = useState(
    DEFAULT_CHAT_VISIBLE_LINES
  );
  const [chatFullVisibleLines, setChatFullVisibleLines] = useState(
    DEFAULT_CHAT_FULL_VISIBLE_LINES
  );
  const [vocabCount, setVocabCount] = useState(null);
  const [vocabRoundDelta, setVocabRoundDelta] = useState(null);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabUpdatedAt, setVocabUpdatedAt] = useState(null);
  const [vocabResultsReadyKey, setVocabResultsReadyKey] = useState(null);
  const [isVocabOverlayOpen, setIsVocabOverlayOpen] = useState(false);
  const [vocabOverlayPhase, setVocabOverlayPhase] = useState("idle");
  const [vocabOverlayAnimatedTotal, setVocabOverlayAnimatedTotal] = useState(0);
  const [vocabOverlayAnimatedDelta, setVocabOverlayAnimatedDelta] = useState(0);
  const [vocabOverlayBaseCount, setVocabOverlayBaseCount] = useState(0);
  const [vocabOverlayTargetCount, setVocabOverlayTargetCount] = useState(0);
  const [vocabOverlayAbsorbing, setVocabOverlayAbsorbing] = useState(false);
  const [vocabOverlayBounce, setVocabOverlayBounce] = useState(false);
  const [vocabOverlayRank, setVocabOverlayRank] = useState(null);
  const [vocabOverlayRankStart, setVocabOverlayRankStart] = useState(null);
  const [vocabOverlayRankEnd, setVocabOverlayRankEnd] = useState(null);
  const [vocabOverlayImageLevel, setVocabOverlayImageLevel] = useState(null);
  const [vocabOverlayImagePhase, setVocabOverlayImagePhase] = useState("idle");
  const [vocabOverlayHasLevelUp, setVocabOverlayHasLevelUp] = useState(false);
  const [vocabOverlayStartLevelKey, setVocabOverlayStartLevelKey] = useState(null);
  const [vocabOverlayAbsorbVec, setVocabOverlayAbsorbVec] = useState({ x: 0, y: 0 });
  const [vocabOverlayWords, setVocabOverlayWords] = useState([]);
  const [vocabOverlayCurrentWord, setVocabOverlayCurrentWord] = useState("");
  const [vocabOverlayShowRanking, setVocabOverlayShowRanking] = useState(false);
  const [vocabOverlayWordFading, setVocabOverlayWordFading] = useState(false);
  const [trophyStatus, setTrophyStatus] = useState(null);
  const [trophyHistory, setTrophyHistory] = useState([]);
  const [trophyLoading, setTrophyLoading] = useState(false);
  const [statsTab, setStatsTab] = useState("weekly");

  const currentTilesRef = useRef([]);
  const acceptedRef = useRef([]);
  const acceptedScoresRef = useRef(new Map());
  const submissionStatusRef = useRef(new Map());
  const pendingWordsRef = useRef(new Set());
  const pendingQueueRef = useRef([]);
  const lateWordsRef = useRef(new Map());
  const inFlightBatchesRef = useRef(new Map());
  const batchTimerRef = useRef(null);
  const batchSeqRef = useRef(1);
  const batchUnsupportedRef = useRef(false);
  const lastRoundWindowRef = useRef({ startAt: null, endAt: null });
  const vocabBaselineRef = useRef(null);
  const vocabBaselineRoundRef = useRef(null);
  const vocabOverlayRoundRef = useRef(null);
  const vocabResultsPendingRef = useRef(null);
  const vocabOverlayTimersRef = useRef([]);
  const vocabOverlayRafRef = useRef(null);
  const vocabOverlayLastTickRef = useRef(0);
  const vocabOverlayDeltaRef = useRef(null);
  const vocabOverlayCursorRef = useRef(null);
  const vocabOverlayWordsRef = useRef([]);
  const lastVocabFetchAtRef = useRef(0);
  const chatInputRef = useRef(null);
  const chatBodyLockHeightRef = useRef(0);
  const gameViewportFreezeHeightRef = useRef(0);
  const chatDesktopListRef = useRef(null);
  const suppressChatResizeRef = useRef(false);
  const isChatOpenMobileRef = useRef(false);
  const wordHistoryRef = useRef([]);
  const wordHistoryIndexRef = useRef(-1);
  const chatHistoryRef = useRef([]);
  const chatHistoryIndexRef = useRef(-1);
  const solutionsRef = useRef(new Map());
  const allWordsComputeRef = useRef({ kickoff: null, timer: null, idle: null, key: null });
  const chatLastSentRef = useRef(0);
  const lastKeyboardInsetRef = useRef(0);
  const toastTimerRef = useRef(null);
  const praiseTimerRef = useRef(null);
  const gobbleTimerRef = useRef(null);
  const lastGobbleAtRef = useRef(0);
  const praiseLastRef = useRef(0);
  const lastTargetConfettiRef = useRef(null);
  const targetDefinitionRequestRef = useRef(0);
  const chatScrollLockRef = useRef(0);
  const definitionRequestIdRef = useRef(0);
  const definitionBlinkTimerRef = useRef(null);
  const disconnectGraceTimerRef = useRef(null);
  const lastBackgroundTimeRef = useRef(0);
  const manualRefreshTimerRef = useRef(null);
  const manualDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  const isBackgroundedRef = useRef(false);
  const foregroundAttemptRef = useRef(0);
  const lastLoginPayloadRef = useRef({ nick: "", roomId: "" });
  const prevPlayersRef = useRef(new Set());
  const isChromiumMobileRef = useRef(false);
  const bestGridMaxRef = useRef(0);
  const bestGridMaxLenRef = useRef(0);
  const bestWordAnnounceRef = useRef(-1);
  const tournamentCelebrationPlayedRef = useRef(false);

  const specialScoreConfig = React.useMemo(() => {
    if (specialRound?.type === "bonus_letter" && specialRound?.bonusLetter) {
      return {
        bonusLetter: specialRound.bonusLetter,
        bonusLetterScore: specialRound.bonusLetterScore ?? 20,
        disableBonuses: true,
      };
    }
    return null;
  }, [specialRound]);
  const bonusLetterKey =
    specialRound?.type === "bonus_letter" ? normalizeLetterKey(specialRound.bonusLetter) : null;
  const bonusLetterScore =
    specialRound?.type === "bonus_letter" ? (specialRound.bonusLetterScore ?? 20) : null;

  // drag souris
  const draggingRef = useRef(false);
  const playColumnRef = useRef(null);
  const countdownRef = useRef(null);
  const previewRef = useRef(null);
  const [playColumnHeight, setPlayColumnHeight] = useState(null);
  const [countdownHeight, setCountdownHeight] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(0);

  function createSoftClipCurve(amount = 1.25, samples = 1024) {
    const key = `${amount}|${samples}`;
    const cached = SOFT_CLIP_CURVE_CACHE.get(key);
    if (cached) return cached;
    const curve = new Float32Array(samples);
    const k = Number.isFinite(amount) ? amount : 1;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(k * x);
    }
    SOFT_CLIP_CURVE_CACHE.set(key, curve);
    return curve;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  function humanizeGain(base, varianceDb = 1.2) {
    const jitter = randRange(-varianceDb, varianceDb);
    return base * dbToGain(jitter);
  }

  function humanizeFreq(freq, cents = 6) {
    const jitter = randRange(-cents, cents);
    return freq * Math.pow(2, jitter / 1200);
  }

  function createReverbImpulse(ctx, durationSec = 0.35, decay = 2.4) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  }

  function applyFilterEnv(filter, now, { base, peak, attack = 0.02, release = 0.12 } = {}) {
    const baseFreq = Number.isFinite(base) ? base : 2000;
    filter.frequency.setValueAtTime(baseFreq, now);
    if (Number.isFinite(peak) && peak > 0) {
      filter.frequency.linearRampToValueAtTime(peak, now + attack);
      filter.frequency.setTargetAtTime(baseFreq, now + attack, release);
    }
  }

  function connectSfxChain(ctx, system, sourceNode, opts = {}, now = ctx.currentTime) {
    const nodes = [];
    let input = sourceNode;
    let reverbTap = sourceNode;

    if (opts.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filter.type || "lowpass";
      filter.Q.setValueAtTime(Number.isFinite(opts.filter.q) ? opts.filter.q : 0.7, now);
      applyFilterEnv(filter, now, opts.filter.env || opts.filter);
      input.connect(filter);
      input = filter;
      reverbTap = filter;
      nodes.push(filter);
    }

    if (opts.saturation) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = createSoftClipCurve(opts.saturation, 1024);
      shaper.oversample = "2x";
      input.connect(shaper);
      input = shaper;
      reverbTap = shaper;
      nodes.push(shaper);
    }

    if (opts.panRange && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(randRange(-opts.panRange, opts.panRange), now);
      input.connect(panner);
      input = panner;
      nodes.push(panner);
    }

    if (opts.reverbSend && system.reverbIn) {
      const send = ctx.createGain();
      send.gain.setValueAtTime(opts.reverbSend, now);
      reverbTap.connect(send);
      send.connect(system.reverbIn);
      nodes.push(send);
    }

    input.connect(system.busIn);
    return nodes;
  }

  function getAudioSystem({ force = false } = {}) {
    if (!force && !audioUnlockedRef.current) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
      audioSystemRef.current = null;
      audioVoiceRef.current.activeVoices = 0;
      audioVoiceRef.current.lastPlayed = new Map();
      audioVoiceRef.current.drops = 0;
    }
    const ctx = audioCtxRef.current;
    if (!audioSystemRef.current || audioSystemRef.current.ctx !== ctx) {
      const busIn = ctx.createGain();
      const masterGain = ctx.createGain();
      masterGain.gain.value = AUDIO_MASTER_GAIN;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 24;
      compressor.ratio.value = 10;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;

      const limiter = ctx.createWaveShaper();
      limiter.curve = createSoftClipCurve(1.25);
      limiter.oversample = "4x";

      const reverbIn = ctx.createGain();
      const reverb = ctx.createConvolver();
      const reverbHP = ctx.createBiquadFilter();
      const reverbLP = ctx.createBiquadFilter();
      const reverbGain = ctx.createGain();
      reverb.buffer = createReverbImpulse(ctx, 0.35, 2.4);
      reverbHP.type = "highpass";
      reverbHP.frequency.value = 220;
      reverbLP.type = "lowpass";
      reverbLP.frequency.value = 7200;
      reverbGain.gain.value = 0.22;

      reverbIn.connect(reverb);
      reverb.connect(reverbHP);
      reverbHP.connect(reverbLP);
      reverbLP.connect(reverbGain);
      reverbGain.connect(busIn);

      busIn.connect(masterGain);
      masterGain.connect(compressor);
      compressor.connect(limiter);
      limiter.connect(ctx.destination);

      audioSystemRef.current = {
        ctx,
        busIn,
        masterGain,
        compressor,
        limiter,
        reverbIn,
        reverbGain,
      };
    }
    return audioSystemRef.current;
  }

  function logAudioDrop(reason, soundKey) {
    if (!DEBUG_AUDIO) return;
    const state = audioVoiceRef.current;
    const now = Date.now();
    if (now - state.lastLogAt < 150) return;
    state.lastLogAt = now;
    console.debug(
      `[audio] drop:${reason} ${soundKey} active=${state.activeVoices}/${state.maxVoices} drops=${state.drops}`
    );
  }

  function shouldPlay(soundKey, cooldownMs, { ignorePolyphony = false } = {}) {
    const state = audioVoiceRef.current;
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    const minInterval =
      Number.isFinite(cooldownMs) && cooldownMs >= 0
        ? cooldownMs
        : AUDIO_COOLDOWNS_MS[soundKey] ?? 0;
    const last = state.lastPlayed.get(soundKey) || 0;
    if (minInterval > 0 && now - last < minInterval) {
      state.drops += 1;
      logAudioDrop("cooldown", soundKey);
      return false;
    }
    if (!ignorePolyphony && state.activeVoices >= state.maxVoices) {
      state.drops += 1;
      logAudioDrop("polyphony", soundKey);
      return false;
    }
    state.lastPlayed.set(soundKey, now);
    return true;
  }

  function startVoiceCount(soundKey, durationSec) {
    const state = audioVoiceRef.current;
    state.activeVoices += 1;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      state.activeVoices = Math.max(0, state.activeVoices - 1);
    };
    if (Number.isFinite(durationSec) && durationSec > 0) {
      setTimeout(cleanup, Math.ceil(durationSec * 1000) + 30);
    }
    return cleanup;
  }


  function playOneShotAudio(
    assetKey,
    { volume, cooldownKey, cooldownMs, eqKey, pitch, onBlocked, ignorePolyphony } = {}
  ) {
    if (isSfxMuted) return;
    const key = cooldownKey || eqKey || assetKey;
    const overrides = {};
    if (Number.isFinite(volume)) overrides.volume = volume;
    if (Number.isFinite(pitch)) overrides.pitch = pitch;
    const settings = resolveSoundSettings(eqKey || key, overrides);
    const effectiveCooldown =
      Number.isFinite(cooldownMs) && cooldownMs >= 0 ? cooldownMs : settings.cooldownMs;
    if (!shouldPlay(key, effectiveCooldown, { ignorePolyphony: !!ignorePolyphony })) return;
    const rate = (settings.pitch ?? 1) * (settings.stretch ?? 1);
    const handle = AssetManager.playSfx(assetKey, {
      eqKey: eqKey || key,
      gain: settings.volume ?? 1,
      rate,
    });
    if (!handle) {
      if (typeof onBlocked === "function") onBlocked();
      return;
    }
    if (!ignorePolyphony) {
      const buffer = AssetManager.getSfxBuffer(assetKey);
      const duration = buffer ? buffer.duration / Math.max(0.01, rate) : 0.6;
      startVoiceCount(key, duration);
    }
  }

  function playSfxHandle(assetKey, { eqKey, gain, rate, voiceKey } = {}) {
    if (isSfxMuted) return null;
    const key = voiceKey || eqKey || assetKey;
    const settings = resolveSoundSettings(eqKey || key, {
      volume: Number.isFinite(gain) ? gain : undefined,
    });
    const effectiveRate =
      Number.isFinite(rate) ? rate : (settings.pitch ?? 1) * (settings.stretch ?? 1);
    const handle = AssetManager.playSfx(assetKey, {
      eqKey: eqKey || key,
      gain: settings.volume ?? 1,
      rate: effectiveRate,
    });
    const buffer = AssetManager.getSfxBuffer(assetKey);
    if (handle && buffer) {
      const duration = buffer.duration / Math.max(0.01, effectiveRate);
      startVoiceCount(key, duration);
    }
    return handle;
  }

  function fadeAudioVolume(audio, targetVolume, durationMs = 800) {
    if (!audio) return;
    if (ambientMusicRef.current.fadeRaf) {
      cancelAnimationFrame(ambientMusicRef.current.fadeRaf);
      ambientMusicRef.current.fadeRaf = null;
    }
    const start = performance.now();
    const fromRaw = Number.isFinite(audio.volume) ? audio.volume : 0;
    const from = Math.max(0, Math.min(1, fromRaw));
    const to = Math.max(0, Math.min(1, targetVolume));
    const step = (now) => {
      const t = Math.min(1, (now - start) / Math.max(1, durationMs));
      const eased = t * (2 - t);
      const nextVolume = from + (to - from) * eased;
      audio.volume = Math.max(0, Math.min(1, nextVolume));
      if (t < 1) {
        ambientMusicRef.current.fadeRaf = requestAnimationFrame(step);
      } else {
        ambientMusicRef.current.fadeRaf = null;
      }
    };
    ambientMusicRef.current.fadeRaf = requestAnimationFrame(step);
  }


  function shuffleTracks(tracks, lastTrack = null) {
    const order = [...tracks];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.length > 1 && lastTrack && order[0] === lastTrack) {
      const swapIndex = 1 + Math.floor(Math.random() * (order.length - 1));
      [order[0], order[swapIndex]] = [order[swapIndex], order[0]];
    }
    return order;
  }

  function resetAmbientOrder() {
    ambientMusicRef.current.order = null;
    ambientMusicRef.current.orderKey = "";
    ambientMusicRef.current.index = -1;
    ambientMusicRef.current.lastTrack = null;
  }

  function getNextAmbientTrack() {
    const tracks = ambientTracksRef.current || [];
    if (!tracks.length) return null;
    const trackKey = tracks.join("|");
    const needsReshuffle =
      !Array.isArray(ambientMusicRef.current.order) ||
      ambientMusicRef.current.order.length !== tracks.length ||
      ambientMusicRef.current.orderKey !== trackKey;
    if (needsReshuffle) {
      ambientMusicRef.current.order = shuffleTracks(
        tracks,
        ambientMusicRef.current.lastTrack
      );
      ambientMusicRef.current.orderKey = trackKey;
      ambientMusicRef.current.index = -1;
    }
    if (
      !ambientMusicRef.current.order ||
      ambientMusicRef.current.index >= ambientMusicRef.current.order.length - 1
    ) {
      ambientMusicRef.current.order = shuffleTracks(
        tracks,
        ambientMusicRef.current.lastTrack
      );
      ambientMusicRef.current.index = -1;
    }
    const nextIndex = ambientMusicRef.current.index + 1;
    ambientMusicRef.current.index = nextIndex;
    const nextTrack = ambientMusicRef.current.order[nextIndex];
    ambientMusicRef.current.lastTrack = nextTrack;
    return nextTrack;
  }

  function ensureAmbientAudio() {
    if (ambientMusicRef.current.audio) return ambientMusicRef.current.audio;
    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = false;
    audio.volume = 0;
    audio.addEventListener("ended", () => {
      if (!ambientMusicRef.current.active) return;
      const next = getNextAmbientTrack();
      if (!next) return;
      const resolvedNext = resolveAmbientSrc(next);
      if (!resolvedNext) return;
      audio.src = resolvedNext;
      const eq = resolveSoundSettings("ambient");
      const bc = breakCountdownRef.current;
      const hasCountdown = typeof bc === "number";
      const shouldBeAudible =
        phaseRef.current === "results" &&
        !ambientMusicRef.current.keepAlive &&
        !isAmbientMutedRef.current &&
        (!hasCountdown || bc > 14);
      audio.muted = !shouldBeAudible;
      audio.play().catch(() => {});
      const targetVolume = shouldBeAudible ? eq.volume ?? 0.45 : 0;
      fadeAudioVolume(audio, targetVolume, shouldBeAudible ? 1000 : 600);
    });
    ambientMusicRef.current.audio = audio;
    return audio;
  }

  function primeAmbientAudio() {
    if (ambientMusicRef.current.primed) return;
    const tracks = ambientTracksRef.current || [];
    if (!tracks.length) return;
    const audio = ensureAmbientAudio();
    const previousVolume = audio.volume;
    const previousSrc = audio.src;
    const primeSrc = resolveAmbientSrc(tracks[0]);
    if (!primeSrc) return;
    audio.src = primeSrc;
    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          ambientMusicRef.current.primed = true;
          audio.pause();
          audio.currentTime = 0;
          audio.volume = previousVolume;
          audio.src = previousSrc;
        })
        .catch(() => {
          audio.volume = previousVolume;
          audio.src = previousSrc;
        });
    } else {
      audio.volume = previousVolume;
      audio.src = previousSrc;
    }
  }

  function startAmbientMusic({ silent = false, fadeMs = null } = {}) {
    if (isAmbientMutedRef.current) return;
    const tracks = ambientTracksRef.current || [];
    if (!tracks.length) return;
    const audio = ensureAmbientAudio();
    const scheduleRetry = () => {
      if (ambientRetryRef.current) return;
      ambientRetryRef.current = true;
      const retry = () => {
        ambientRetryRef.current = false;
        const bc = breakCountdownRef.current;
        const hasCountdown = typeof bc === "number";
        const shouldBeAudible =
          phaseRef.current === "results" &&
          (!hasCountdown || bc > 14);
        const canPlayAmbient =
          !isAmbientMutedRef.current;
        if (canPlayAmbient) {
          const fadeMs =
            hasCountdown && typeof bc === "number"
              ? Math.max(0, Math.round((bc - 10) * 1000))
              : null;
          startAmbientMusic({ silent: !shouldBeAudible, fadeMs });
        }
      };
      window.addEventListener("pointerdown", retry, { once: true });
      window.addEventListener("touchstart", retry, { once: true });
      window.addEventListener("keydown", retry, { once: true });
    };
    const markPending = () => {
      ambientStartPendingRef.current = true;
      ambientMusicRef.current.active = false;
      scheduleRetry();
    };
    audio.muted = !!silent;
    const fadeOutMs = Number.isFinite(fadeMs) ? fadeMs : 700;
    const fadeInMs = Number.isFinite(fadeMs) ? fadeMs : 1200;
    const fadeStartMs = Number.isFinite(fadeMs) ? fadeMs : 350;
    if (ambientMusicRef.current.active) {
      ambientMusicRef.current.keepAlive = silent;
      const eq = resolveSoundSettings("ambient");
      const targetVolume = silent ? 0 : eq.volume ?? 0.45;
      fadeAudioVolume(audio, targetVolume, silent ? fadeOutMs : fadeInMs);
      if (audio.paused || audio.ended) {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(markPending);
        }
      }
      return;
    }
    const next = getNextAmbientTrack();
    if (!next) return;
    if (ambientMusicRef.current.playCheck) {
      clearTimeout(ambientMusicRef.current.playCheck);
      ambientMusicRef.current.playCheck = null;
    }
    const resolvedNext = resolveAmbientSrc(next);
    if (!resolvedNext) return;
    ambientMusicRef.current.active = true;
    ambientMusicRef.current.keepAlive = silent;
    audio.src = resolvedNext;
    audio.muted = !!silent;
    audio.volume = 0;
    try {
      audio.load?.();
    } catch (_) {}
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(markPending);
    }
    const eq = resolveSoundSettings("ambient");
    const targetVolume = silent ? 0 : eq.volume ?? 0.45;
    fadeAudioVolume(audio, targetVolume, silent ? fadeStartMs : fadeInMs);
    if (ambientMusicRef.current.startGuard) {
      clearTimeout(ambientMusicRef.current.startGuard);
    }
    ambientMusicRef.current.startGuard = setTimeout(() => {
      if (!ambientMusicRef.current.active) return;
      if (audio.paused || audio.readyState < 2) {
        const retryPromise = audio.play();
        if (retryPromise && typeof retryPromise.catch === "function") {
          retryPromise.catch(markPending);
        }
      }
      if (ambientMusicRef.current.playCheck) {
        clearTimeout(ambientMusicRef.current.playCheck);
      }
      ambientMusicRef.current.playCheck = setTimeout(() => {
        if (!ambientMusicRef.current.active) return;
        if (audio.paused) {
          markPending();
        }
      }, 300);
    }, 550);
  }

  function stopAmbientMusic({ fadeMs = 800, keepAlive = false } = {}) {
    const audio = ambientMusicRef.current.audio;
    if (!keepAlive) {
      ambientMusicRef.current.active = false;
      ambientMusicRef.current.keepAlive = false;
    } else {
      ambientMusicRef.current.keepAlive = true;
    }
    if (!audio) return;
    if (ambientMusicRef.current.startGuard) {
      clearTimeout(ambientMusicRef.current.startGuard);
      ambientMusicRef.current.startGuard = null;
    }
    if (ambientMusicRef.current.playCheck) {
      clearTimeout(ambientMusicRef.current.playCheck);
      ambientMusicRef.current.playCheck = null;
    }
    if (ambientMusicRef.current.fadeTimer) {
      clearTimeout(ambientMusicRef.current.fadeTimer);
      ambientMusicRef.current.fadeTimer = null;
    }
    fadeAudioVolume(audio, 0, fadeMs);
    if (!keepAlive) {
      ambientMusicRef.current.fadeTimer = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (_) {}
      }, Math.max(0, fadeMs) + 60);
    }
  }

  function scheduleNodeCleanup(ctx, endTime, nodes, cleanup) {
    let finished = false;
    const finalize = () => {
      if (finished) return;
      finished = true;
      nodes.forEach((node) => {
        if (!node) return;
        try {
          node.disconnect();
        } catch (_) {}
      });
      if (cleanup) cleanup();
    };
    const delayMs = Math.max(0, (endTime - ctx.currentTime) * 1000 + 40);
    setTimeout(finalize, delayMs);
    return finalize;
  }

  function withEnvelope(gainNode, t0, attack, sustainLevel, release, duration) {
    const a = Math.max(0.003, Number.isFinite(attack) ? attack : 0.005);
    const r = Math.max(0.02, Number.isFinite(release) ? release : 0.05);
    const total = Math.max(a + r, Number.isFinite(duration) ? duration : a + r);
    const sustain = Number.isFinite(sustainLevel) ? sustainLevel : 1;
    const sustainEnd = Math.max(t0 + a, t0 + total - r);
    gainNode.gain.cancelScheduledValues(t0);
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.linearRampToValueAtTime(sustain, t0 + a);
    gainNode.gain.linearRampToValueAtTime(sustain, sustainEnd);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
    return t0 + total;
  }
  const requestAudioUnlock = (event) => {
    if (event && event.isTrusted === false) return false;
    const hasGesture = !!event;
    if (!hasGesture && !audioUnlockedRef.current) return false;
    if (!audioUnlockedRef.current) {
      audioUnlockedRef.current = true;
    }
    void AssetManager.unlockAudio();
    const system = getAudioSystem({ force: true });
    if (system?.ctx && system.ctx.state === "suspended") {
      system.ctx.resume().catch(() => {});
    }
    return !!system?.ctx;
  };

  // Débloque le contexte audio au premier geste utilisateur (mobile/desktop)
  useEffect(() => {
    function unlockAudio(event) {
      const hasCtx = requestAudioUnlock(event);
      primeAmbientAudio();
      if (ambientStartPendingRef.current) {
        ambientStartPendingRef.current = false;
      }
      if (
        roundStartPendingRef.current &&
        phaseRef.current === "playing" &&
        roundIdRef.current === roundStartPendingRef.current
      ) {
        roundStartPendingRef.current = null;
        playRoundStartSound();
      }
      const bc = breakCountdownRef.current;
      const hasCountdown = typeof bc === "number";
      const shouldBeAudible =
        phaseRef.current === "results" &&
        !isAmbientMutedRef.current &&
        (!hasCountdown || bc > 14);
      const shouldBeSilent =
        !isAmbientMutedRef.current &&
        (phaseRef.current !== "results" || (hasCountdown && bc <= 14));
      if (shouldBeAudible || shouldBeSilent) {
        const fadeMs =
          hasCountdown && typeof bc === "number"
            ? Math.max(0, Math.round((bc - 10) * 1000))
            : null;
        startAmbientMusic({ silent: !shouldBeAudible, fadeMs });
      }
      const stopListening = () => {
        if (hasCtx && audioCtxRef.current?.state === "running") {
          window.removeEventListener("pointerdown", unlockAudio);
          window.removeEventListener("touchstart", unlockAudio);
          window.removeEventListener("keydown", unlockAudio);
        }
      };
      stopListening();
    }
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const el = playColumnRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    // init immédiat (on enlève un petit padding interne pour coller au contenu)
    const initialWidth = el.getBoundingClientRect().width;
    const initialHeight = el.getBoundingClientRect().height;
    if (initialWidth) {
      const clamped = clampGridWidth(initialWidth);
      if (clamped) setGridWidth(clamped);
    }
    if (initialHeight) setPlayColumnHeight(initialHeight);

    const observer = new ResizeObserver((entries) => {
      const target = entries[0]?.target;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const w = rect.width; // border-box width (incl. padding)
      const h = rect.height;
      if (w) {
        const clamped = clampGridWidth(w);
        if (clamped) setGridWidth(clamped);
      }
      if (h) setPlayColumnHeight(h);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = countdownRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const initialHeight = el.getBoundingClientRect().height;
    if (initialHeight) setCountdownHeight(initialHeight);
    const observer = new ResizeObserver((entries) => {
      const target = entries[0]?.target;
      if (!target) return;
      const h = target.getBoundingClientRect().height;
      if (h) setCountdownHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = previewRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const initialHeight = el.getBoundingClientRect().height;
    if (initialHeight) setPreviewHeight(initialHeight);
    const observer = new ResizeObserver((entries) => {
      const target = entries[0]?.target;
      if (!target) return;
      const h = target.getBoundingClientRect().height;
      if (h) setPreviewHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", darkMode);
    // Active aussi la classe Tailwind "dark" pour aligner les variantes sur le toggle interne
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    } catch (_) {}
  }, [darkMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      isTouchDeviceRef.current =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    isChromiumMobileRef.current =
      /Android/i.test(ua) &&
      /(Chrome|CriOS|EdgA|SamsungBrowser)/i.test(ua);
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      canVibrateRef.current = true;
      setCanVibrate(true);
    } else {
      canVibrateRef.current = false;
      setCanVibrate(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId = null;
    const update = () => {
      if (rafId !== null) return;
      if (isChatOpenMobileRef.current) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (isChatOpenMobileRef.current) return;
        setIsMobileLayout(computeIsMobileLayout());
        setIsUltraCompact(computeIsUltraCompact());
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (!isMobileLayout) return;
    if (typeof screen === "undefined") return;
    const orientation = screen.orientation;
    if (!orientation || typeof orientation.lock !== "function") return;
    orientation.lock("portrait").catch(() => {});
  }, [isMobileLayout]);

  useEffect(() => {
    isChatOpenMobileRef.current = isChatOpenMobile;

    if (!isMobileLayout) return;
    if (!isChatOpenMobile) {
      setActiveArea("game");
      return;
    }

    setMobileChatUnreadCount(0);
    setActiveArea("chat");

    if (typeof window === "undefined") return;
    const focusChatInput = () => {
      const el = chatInputRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        el.focus();
      }
    };

    const delay = isMobileLayout ? 0 : Math.max(0, CHAT_DRAWER_ANIM_MS - 60);
    const t = window.setTimeout(focusChatInput, delay);

    return () => {
      window.clearTimeout(t);
    };
  }, [isChatOpenMobile, isMobileLayout]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isChatOpenMobile) {
      setChatViewportHeight(0);
      setChatKeyboardInsetPx(0);
      return;
    }

    const vv = window.visualViewport;

    const baseHeight =
      chatBodyLockHeightRef.current ||
      Math.round(window.innerHeight || vv?.height || 0);
    setChatViewportHeight((prev) => (prev === baseHeight ? prev : baseHeight));

    const updateInset = () => {
      if (suppressChatResizeRef.current) return;
      const nextHeight =
        chatBodyLockHeightRef.current ||
        Math.round(window.innerHeight || vv?.height || 0);
      if (nextHeight > 0) {
        setChatViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
      const nextInset =
        vv && Number.isFinite(vv.height)
          ? Math.max(
              0,
              Math.round(
                nextHeight -
                  vv.height -
                  (Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0)
              )
            )
          : 0;
      if (nextInset > 0) {
        lastKeyboardInsetRef.current = nextInset;
      } else {
        lastKeyboardInsetRef.current = 0;
      }
      setChatKeyboardInsetPx((prev) => (prev === nextInset ? prev : nextInset));
    };

    updateInset();
    vv?.addEventListener("resize", updateInset);
    vv?.addEventListener("scroll", updateInset);
    window.addEventListener("resize", updateInset);
    window.addEventListener("focusin", updateInset, true);
    window.addEventListener("focusout", updateInset, true);
    return () => {
      vv?.removeEventListener("resize", updateInset);
      vv?.removeEventListener("scroll", updateInset);
      window.removeEventListener("resize", updateInset);
      window.removeEventListener("focusin", updateInset, true);
      window.removeEventListener("focusout", updateInset, true);
    };
  }, [isChatOpenMobile]);

  useEffect(() => {
    if (!isMobileLayout || !isChatOpenMobile || isChatClosing) return;
    if (activeArea !== "chat") return;
    const t = window.setTimeout(() => {
      const el = chatInputRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        el.focus();
      }
    }, 40);
    return () => window.clearTimeout(t);
  }, [phase, isMobileLayout, isChatOpenMobile, isChatClosing, activeArea]);

  useEffect(() => {
    if (!isChatRulesOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsChatRulesOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const raf = window.requestAnimationFrame(() => {
      chatRulesConfirmRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(raf);
    };
  }, [isChatRulesOpen]);

  useEffect(() => {
    if (!userMenu.open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeUserMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenu.open]);

  useEffect(() => {
    if (!definitionModal.open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDefinition();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [definitionModal.open]);

  useEffect(() => {
    if (!definitionModal.open) return;
    if (phase === "lobby" && !isWeeklyOpen) closeDefinition();
  }, [definitionModal.open, phase, roundId, isWeeklyOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobileLayout) return;
    const el = chatDesktopListRef.current;
    if (!el) return;
    let rafId = null;
    const measure = () => {
      const styles = window.getComputedStyle(el);
      const paddingTop = parseFloat(styles.paddingTop || "0") || 0;
      const paddingBottom = parseFloat(styles.paddingBottom || "0") || 0;
      const containerHeight = Math.max(0, el.clientHeight - paddingTop - paddingBottom);
      const rows = Array.from(el.querySelectorAll("[data-chat-row]"));
      const sampleRows = rows.slice(-Math.min(rows.length, 6));
      let rowHeight = 0;
      let rowMargin = 0;
      if (sampleRows.length > 0) {
        rowHeight =
          sampleRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) /
          sampleRows.length;
        const rowStyles = window.getComputedStyle(sampleRows[sampleRows.length - 1]);
        rowMargin = parseFloat(rowStyles.marginTop || "0") || 0;
      }
      const block = rowHeight + rowMargin;
      const nextVisible =
        block > 0
          ? clampValue(
              Math.floor((containerHeight + rowMargin) / block),
              CHAT_MIN_VISIBLE_LINES,
              CHAT_MAX_VISIBLE_LINES
            )
          : DEFAULT_CHAT_VISIBLE_LINES;
      const nextFull = Math.max(
        3,
        Math.min(nextVisible - 2, Math.round(nextVisible * 0.55))
      );
      setChatVisibleLimit(nextVisible);
      setChatFullVisibleLines(nextFull);
    };
    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };
    schedule();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(el);
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [isMobileLayout, chatMessages.length]);

  useEffect(() => {
    if (!isMobileLayout) return;
    setChatVisibleLimit(DEFAULT_CHAT_VISIBLE_LINES);
    setChatFullVisibleLines(DEFAULT_CHAT_FULL_VISIBLE_LINES);
  }, [isMobileLayout]);

  // Safe-area top probe: avoids hardcoded fullscreen offsets.
  const measureSafeAreaTopPx = React.useCallback(() => {
    if (typeof window === "undefined") return 0;
    const probe = safeAreaTopProbeRef.current;
    if (!probe) return 0;
    const paddingTop = window.getComputedStyle(probe).paddingTop || "0";
    const value = parseFloat(paddingTop);
    return Number.isFinite(value) ? value : 0;
  }, []);

  const getSafeTopPx = React.useCallback(
    (forceFullscreen = false) => {
      const shouldUse = forceFullscreen || isFullscreen;
      if (!shouldUse) return 0;
      const measured = measureSafeAreaTopPx();
      if (measured > 0) return Math.round(measured);
      if (typeof window === "undefined") return 0;
      // Fallback when env(safe-area-inset-top) reports 0 in fullscreen.
      return Math.round(Math.min(48, Math.max(0, window.innerHeight * 0.03)));
    },
    [isFullscreen, measureSafeAreaTopPx]
  );

  const getHeaderOffsetPx = React.useCallback(() => {
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return 0;
    const rect = headerEl.getBoundingClientRect?.();
    const rectBottom =
      rect && Number.isFinite(rect.bottom) ? Math.round(rect.bottom) : 0;
    if (rectBottom > 0) return rectBottom;
    const height = Math.round(headerEl.offsetHeight || 0);
    return height + getSafeTopPx();
  }, [getSafeTopPx]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileLayout || !(phase === "playing" || phase === "results")) return;

    let rafId = null;
    let timeoutId = null;

    const computeMobileLayoutNow = () => {
      if (isChatOpenMobileRef.current) return;
      const viewportHeightCandidates = [
        window.innerHeight,
        document.documentElement?.clientHeight,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const viewportHeight = viewportHeightCandidates.length
        ? Math.min(...viewportHeightCandidates)
        : 0;

      const viewportWidthCandidates = [
        window.innerWidth,
        document.documentElement?.clientWidth,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const viewportWidth = viewportWidthCandidates.length
        ? Math.min(...viewportWidthCandidates)
        : 0;
      if (!safeAreaProbeRef.current && typeof document !== "undefined") {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.left = "0";
        probe.style.top = "0";
        probe.style.height = "0";
        probe.style.paddingBottom = "env(safe-area-inset-bottom)";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        document.body.appendChild(probe);
        safeAreaProbeRef.current = probe;
      }
      if (!safeAreaTopProbeRef.current && typeof document !== "undefined") {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.left = "0";
        probe.style.top = "0";
        probe.style.height = "0";
        probe.style.paddingTop = "env(safe-area-inset-top)";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        document.body.appendChild(probe);
        safeAreaTopProbeRef.current = probe;
      }

      const headerOffsetPx = getHeaderOffsetPx();
      if (headerOffsetPx > 0) {
        setMobileHeaderOffsetPx((prev) =>
          prev === headerOffsetPx ? prev : headerOffsetPx
        );
      }
      const headerHeightForBody = headerOffsetPx;
      const helpEl = mobileHelpRef.current;
      const helpHeight = helpEl?.offsetHeight || 0;
      const helpMargins = helpEl
        ? (() => {
            const styles = window.getComputedStyle(helpEl);
            const mt = parseFloat(styles.marginTop || "0") || 0;
            const mb = parseFloat(styles.marginBottom || "0") || 0;
            return mt + mb;
          })()
        : 0;
      const extraTopHeight = helpHeight + helpMargins;
      const safeBottomPx = 5;
      const safeAreaBottomPx =
        isFullscreen && safeAreaProbeRef.current && typeof window !== "undefined"
          ? parseFloat(
              window.getComputedStyle(safeAreaProbeRef.current).paddingBottom || "0"
            ) || 0
          : 0;
      const bodyHeight = Math.max(
        0,
        viewportHeight -
          headerHeightForBody -
          extraTopHeight -
          safeBottomPx -
          safeAreaBottomPx
      );

      // marges/gaps principaux (px-3, pb-2 + espacements entre blocs)
      const verticalPadding = 4 + 8;
      const layoutGaps = 8 + 4; // gap-1 entre blocs (2 x 4px) + gap-1 entre grille/flux (4px)
      const availableHeight = Math.max(
        0,
        bodyHeight - verticalPadding - layoutGaps
      );
      const blocksBudget = availableHeight > 0 ? availableHeight : bodyHeight;
      const availableWidth = Math.max(
        0,
        Math.min(viewportWidth - 24, MOBILE_GRID_MAX_WIDTH)
      ); // px-3 (12px) de chaque c?t?) + limite max mobile

      const baseFontSize =
        parseFloat(
          window.getComputedStyle(document.documentElement).fontSize || "16"
        ) || 16;
      const liveFeedRowPx = Math.max(12, Math.round(baseFontSize * 1.05));
      const liveFeedHeaderPx = Math.max(12, Math.round(baseFontSize * 1.05));
      const liveFeedGapPx = 4;
      const liveFeedPaddingPx = 16;
      const liveFeedMinHeight =
        liveFeedPaddingPx +
        liveFeedHeaderPx +
        liveFeedGapPx +
        liveFeedRowPx * 3 +
        liveFeedGapPx * 2;
      const minRanking = 120;
      const maxRanking = 150;
      const minPreview = 36;
      let rankingTarget = clampValue(
        Math.round(Math.max(baseFontSize * 7, bodyHeight * 0.26)),
        minRanking,
        maxRanking
      );
      let previewTarget = clampValue(
        Math.round(Math.max(baseFontSize * 2.6, bodyHeight * 0.08)),
        minPreview,
        68
      );
      let requiredBelowGrid = rankingTarget + previewTarget + liveFeedMinHeight;
      let maxGridFromHeight = Math.max(100, blocksBudget - requiredBelowGrid);

      if (maxGridFromHeight < availableWidth) {
        let needed = Math.max(0, availableWidth - maxGridFromHeight);
        if (needed > 0) {
          const previewShrink = Math.min(needed, previewTarget - minPreview);
          previewTarget -= previewShrink;
          needed -= previewShrink;
        }
        if (needed > 0) {
          const rankingShrink = Math.min(needed, rankingTarget - minRanking);
          rankingTarget -= rankingShrink;
          needed -= rankingShrink;
        }
        requiredBelowGrid = rankingTarget + previewTarget;
        maxGridFromHeight = Math.max(100, blocksBudget - requiredBelowGrid);
      }

      const gridSide = Math.max(100, availableWidth);

      const remaining = Math.max(0, blocksBudget - gridSide);

      if (remaining <= 0) {
        setMobileLayoutSizing({
          viewportWidth,
          viewportHeight,
          gridSide,
          rankingHeight: rankingTarget,
          wordPreviewHeight: previewTarget,
          liveFeedHeight: 0,
          liveFeedMinHeight,
          bodyHeight,
        });
        return;
      }

      const reservedLiveFeed = Math.min(remaining, liveFeedMinHeight);
      const remainingAfterFeed = Math.max(0, remaining - reservedLiveFeed);
      let rankingHeight = 0;
      let wordPreviewHeight = 0;
      if (remainingAfterFeed > 0) {
        const previewBias = 1.25;
        const totalTarget = rankingTarget + previewTarget;
        if (remainingAfterFeed >= totalTarget) {
          rankingHeight = rankingTarget;
          wordPreviewHeight = previewTarget;
        } else {
          const weightedTotal = rankingTarget + previewTarget * previewBias;
          const previewShare =
            (previewTarget * previewBias) / Math.max(1, weightedTotal);
          const previewRaw = remainingAfterFeed * previewShare;
          wordPreviewHeight = Math.max(
            0,
            Math.min(previewTarget, Math.floor(previewRaw))
          );
          rankingHeight = Math.max(0, remainingAfterFeed - wordPreviewHeight);
        }
      }
      const leftover = Math.max(
        0,
        remaining - reservedLiveFeed - rankingHeight - wordPreviewHeight
      );
      const liveFeedHeight = reservedLiveFeed + leftover;

      setMobileLayoutSizing({
        viewportWidth,
        viewportHeight,
        gridSide: gridSide || 0,
        rankingHeight: rankingHeight || 0,
        wordPreviewHeight: wordPreviewHeight || 0,
        liveFeedHeight: liveFeedHeight || 0,
        liveFeedMinHeight,
        bodyHeight,
      });
    };

    const scheduleComputeMobileLayout = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(computeMobileLayoutNow);

      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(computeMobileLayoutNow, 180);
    };

    scheduleComputeMobileLayout();
    window.addEventListener("resize", scheduleComputeMobileLayout);
    window.addEventListener("scroll", scheduleComputeMobileLayout, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener("resize", scheduleComputeMobileLayout);
      window.removeEventListener("scroll", scheduleComputeMobileLayout);
      if (safeAreaProbeRef.current && safeAreaProbeRef.current.parentNode) {
        safeAreaProbeRef.current.parentNode.removeChild(safeAreaProbeRef.current);
        safeAreaProbeRef.current = null;
      }
      if (safeAreaTopProbeRef.current && safeAreaTopProbeRef.current.parentNode) {
        safeAreaTopProbeRef.current.parentNode.removeChild(safeAreaTopProbeRef.current);
        safeAreaTopProbeRef.current = null;
      }
    };
  }, [isMobileLayout, phase, gridSize, showHelp, isFullscreen, getHeaderOffsetPx]);

  useEffect(() => {
    if (!isMobileLayout) return;
    if (typeof window === "undefined") return;
    if (typeof ResizeObserver === "undefined") return;
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return;

    const updateHeight = () => {
      const nextOffset = getHeaderOffsetPx();
      if (!nextOffset) return;
      setMobileHeaderOffsetPx((prev) =>
        prev === nextOffset ? prev : nextOffset
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(headerEl);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updateHeight);
    vv?.addEventListener("scroll", updateHeight);
    return () => {
      observer.disconnect();
      vv?.removeEventListener("resize", updateHeight);
      vv?.removeEventListener("scroll", updateHeight);
    };
  }, [isMobileLayout, isFullscreen, getHeaderOffsetPx]);

  useLayoutEffect(() => {
    if (!isMobileLayout) return;
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return;
    const nextOffset = getHeaderOffsetPx();
    if (!nextOffset) return;
    setMobileHeaderOffsetPx((prev) => (prev === nextOffset ? prev : nextOffset));
  }, [isMobileLayout, isFullscreen, getHeaderOffsetPx]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldPin =
      isMobileLayout && (phase === "playing" || phase === "results");
    if (!shouldPin) return;
    window.scrollTo(0, 0);
  }, [isMobileLayout, phase]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const shouldLock =
      (isMobileLayout && (phase === "playing" || phase === "results")) ||
      isChatOpenMobile ||
      isChatClosing;
    if (!shouldLock) return;

    const previousOverflow = document.body.style.overflow;
    const previousHeight = document.body.style.height;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousLeft = document.body.style.left;
    const previousRight = document.body.style.right;
    const previousTouchAction = document.body.style.touchAction;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlHeight = document.documentElement.style.height;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const previousHtmlPosition = document.documentElement.style.position;
    const previousHtmlWidth = document.documentElement.style.width;
    const previousHtmlLeft = document.documentElement.style.left;
    const previousHtmlRight = document.documentElement.style.right;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.documentElement.style.position = "fixed";
    document.documentElement.style.width = "100%";
    document.documentElement.style.left = "0";
    document.documentElement.style.right = "0";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.touchAction = "none";

    if (!chatScrollLockRef.current) {
      chatScrollLockRef.current =
        typeof window !== "undefined" ? window.scrollY || 0 : 0;
    }
    document.body.style.top = `-${chatScrollLockRef.current}px`;
    window.scrollTo(0, 0);

    const applyLockedHeight = () => {
      const frozen =
        (isChatOpenMobileRef.current || isChatClosing) &&
        gameViewportFreezeHeightRef.current > 0
          ? gameViewportFreezeHeightRef.current
          : 0;

      // Quand le chat est ouvert, on fige le fond (layout viewport) et on laisse
      // uniquement le tiroir chat s'adapter au clavier via visualViewport.
      const candidates = frozen
        ? [frozen]
        : [window.innerHeight, document.documentElement?.clientHeight];

      const filtered = candidates.filter((v) => Number.isFinite(v) && v > 0);
      const h = filtered.length ? Math.min(...filtered) : 0;
      if (h > 0) {
        const px = `${Math.round(h)}px`;
        document.body.style.height = px;
        document.documentElement.style.height = px;
      }
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
    };

    applyLockedHeight();
    window.addEventListener("resize", applyLockedHeight);
    window.addEventListener("scroll", applyLockedHeight, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", applyLockedHeight);
    vv?.addEventListener("scroll", applyLockedHeight);

    return () => {
      window.removeEventListener("resize", applyLockedHeight);
      window.removeEventListener("scroll", applyLockedHeight);
      vv?.removeEventListener("resize", applyLockedHeight);
      vv?.removeEventListener("scroll", applyLockedHeight);
      document.body.style.overflow = previousOverflow;
      document.body.style.height = previousHeight;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.body.style.left = previousLeft;
      document.body.style.right = previousRight;
      document.body.style.touchAction = previousTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.height = previousHtmlHeight;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      document.documentElement.style.position = previousHtmlPosition;
      document.documentElement.style.width = previousHtmlWidth;
      document.documentElement.style.left = previousHtmlLeft;
      document.documentElement.style.right = previousHtmlRight;
      document.body.style.overscrollBehavior = previousOverscroll;
      if (chatScrollLockRef.current) {
        window.scrollTo(0, chatScrollLockRef.current);
        chatScrollLockRef.current = 0;
      }
    };
  }, [isMobileLayout, phase, isChatOpenMobile, isChatClosing]);

  useEffect(() => {
    if (phase !== "lobby") return;
    const nextSize = getGridSizeForRoom(roomId);
    setGridSize(nextSize);
    setBoard(Array(nextSize * nextSize).fill({ letter: "?", bonus: null }));
  }, [roomId, phase]);

  async function handleInstallApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      const res = await installPrompt.userChoice;
      if (res && res.outcome === "accepted") {
        setInstallMessage("Ajout\u00e9 \u00e0 l'\u00e9cran d'accueil");
      } else {
        setInstallMessage("Ajout annul\u00e9");
      }
    } catch (_) {
      setInstallMessage("Impossible de proposer l'ajout");
    } finally {
      setInstallPrompt(null);
      setTimeout(() => setInstallMessage(""), 2500);
    }
  }

  function ensureTournamentBaseline(tournamentPayload, { captureRanking = false } = {}) {
    const tournamentId = tournamentPayload?.id || null;
    if (!tournamentId) return;
    let baseline = tournamentBaselineRef.current;
    if (baseline.id !== tournamentId) {
      tournamentBaselineRef.current = {
        id: tournamentId,
        weeklyStats: weeklyStatsSnapshotRef.current || null,
        rankingMap: null,
      };
      baseline = tournamentBaselineRef.current;
    }
    if (!baseline.weeklyStats && weeklyStatsSnapshotRef.current) {
      baseline.weeklyStats = weeklyStatsSnapshotRef.current;
    }
    if (
      captureRanking &&
      !baseline.rankingMap &&
      Array.isArray(tournamentPayload?.ranking) &&
      tournamentPayload.ranking.length
    ) {
      const rankMap = new Map();
      tournamentPayload.ranking.forEach((entry, idx) => {
        if (!entry?.nick) return;
        const posNow = Number.isFinite(entry.pos) ? entry.pos : idx + 1;
        rankMap.set(entry.nick, posNow);
      });
      baseline.rankingMap = rankMap;
      baseline.rankingRound = Number.isFinite(tournamentPayload?.round)
        ? tournamentPayload.round
        : null;
    }
  }

  // Son "GOBBLE" (MP3 placé dans /public/sound/game/gobble.mp3)
  function playGobbleVoice() {
    playOneShotAudio(SFX_KEYS.gobbleVoice, {
      cooldownKey: "gobbleVoice",
      eqKey: "gobbleVoice",
    });
  }

  // Son progressif par tuile (01..15)
  function playTileStepSound(step) {
    if (!Number.isFinite(step)) return;
    const index = Math.max(1, Math.min(INCREMENTAL_SOUND_COUNT, Math.floor(step) + 1));
    const assetKey = INCREMENTAL_SFX_KEYS[index - 1];
    playOneShotAudio(assetKey, { cooldownKey: "tileStep", eqKey: "tileStep" });
  }

  // Petit "tic tac" pour la fin de manche (fichier)
  function playTickSound({ isTargetRound } = {}) {
    if (isSfxMuted) return;
    const soundKey = isTargetRound ? "coeur" : "tick";
    const assetKey = isTargetRound ? SFX_KEYS.coeur : SFX_KEYS.tictac10;
    playOneShotAudio(assetKey, {
      cooldownKey: "tick",
      eqKey: soundKey,
    });
  }

  // "Tic tac" avant le début de manche (compte à rebours)
  function playCountdownTickSound() {
    if (isSfxMuted) return;
    playOneShotAudio(SFX_KEYS.tictoc, {
      cooldownKey: "countdownTick",
      eqKey: "countdownTick",
    });
  }

  function playSwipeSound() {
    playOneShotAudio(SFX_KEYS.uiClick, { cooldownKey: "swipe", eqKey: "swipe" });
  }

  function playCloseSound() {
    playOneShotAudio(SFX_KEYS.uiClose, { cooldownKey: "bipmontre", eqKey: "bipmontre" });
  }

  function scheduleRoundStartRetry(roundKey) {
    if (roundStartRetryRef.current) return;
    roundStartRetryRef.current = true;
    const retry = () => {
      roundStartRetryRef.current = false;
      if (phaseRef.current !== "playing") return;
      if (roundKey && roundIdRef.current && roundIdRef.current !== roundKey) return;
      playRoundStartSound();
    };
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("touchstart", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
  }

  // Celebration fin de mini-tournoi
  function playTournamentCelebrationSound() {
    if (!shouldPlay("tournamentCelebration", AUDIO_COOLDOWNS_MS.tournamentCelebration)) {
      return;
    }
    playOneShotAudio(SFX_KEYS.tournamentFireworks, {
      cooldownKey: "tournamentFireworks",
      eqKey: "tournamentFireworks",
    });
    setTimeout(() => {
      playOneShotAudio(SFX_KEYS.tournamentApplause, {
        cooldownKey: "tournamentApplause",
        eqKey: "tournamentApplause",
      });
    }, 260);
  }

  function playRoundStartSound() {
    if (isSfxMuted) return;
    playOneShotAudio(SFX_KEYS.roundStart, {
      cooldownKey: "roundStart",
      eqKey: "roundStart",
      onBlocked: () => {
        const roundKey = roundIdRef.current || null;
        if (!roundKey) return;
        roundStartPendingRef.current = roundKey;
        scheduleRoundStartRetry(roundKey);
      },
    });
  }

  // Palette de sons par paliers de score (plus mélodique)
  function playScoreSound(points) {
    if (isSfxMuted) return;
    const safePoints = Number.isFinite(points) ? Math.max(0, points) : 0;
    if (safePoints === 2) {
      // Rafales possibles -> pas de cooldown et ignore polyphony pour éviter les trous.
      playOneShotAudio(SCORE_LOW_KEY, {
        cooldownKey: "score",
        cooldownMs: 0,
        eqKey: "score",
        ignorePolyphony: true,
      });
      playOneShotAudio(SCORE2_LOW_KEY, {
        cooldownKey: "score2",
        cooldownMs: 0,
        eqKey: "score2",
        ignorePolyphony: true,
      });
      return;
    }
    if (safePoints < 3) return;
    const bandIndex =
      SCORE_SOUND_BANDS.findIndex(
        (entry) => safePoints >= entry.min && safePoints <= entry.max
      ) || 0;
    const scoreKey = SCORE_SFX_KEYS[bandIndex] || SCORE_SFX_KEYS[0];
    const pianoKey = SCORE2_SFX_KEYS[bandIndex] || SCORE2_SFX_KEYS[0];
    // Rafales possibles -> pas de cooldown et ignore polyphony pour éviter les trous.
    playOneShotAudio(scoreKey, {
      cooldownKey: "score",
      cooldownMs: 0,
      eqKey: "score",
      ignorePolyphony: true,
    });
    playOneShotAudio(pianoKey, {
      cooldownKey: "score2",
      cooldownMs: 0,
      eqKey: "score2",
      ignorePolyphony: true,
    });
  }


  function playVocabOverlayTone(
    freq,
    durationMs = 120,
    gainValue = 0.14,
    soundKey = "vocabTick",
    sampleKey = SFX_KEYS.vocabOverlay
  ) {
    if (isSfxMuted) return;
    const jitteredFreq = humanizeFreq(freq, 4);
    const pitch = jitteredFreq / VOCAB_SAMPLE_BASE_FREQ;
    // Les ticks vocabulaires sont joués en rafales + pitch progressif: pas de cooldown.
    const cooldownTag = `${soundKey}:${Math.round(pitch * 1000)}`;
    playOneShotAudio(sampleKey, {
      cooldownKey: cooldownTag,
      cooldownMs: 0,
      eqKey: soundKey,
      pitch,
      ignorePolyphony: true,
    });
  }

  function playVocabOverlayTickSound(wordIndex) {
    if (!Number.isFinite(wordIndex) || wordIndex <= 0) return;
    const idx = Math.floor(wordIndex);
    const low = 220;
    const mid = 440;
    const high = 660;
    let freq = high;
    if (idx <= 10) {
      const t = (idx - 1) / 9;
      freq = low + (mid - low) * t;
    } else if (idx <= 20) {
      const t = (idx - 11) / 9;
      freq = mid + (high - mid) * t;
    }
    playVocabOverlayTone(freq, 95, 0.1, "vocabTick");
  }

  function playVocabOverlayZeroSound() {
    playVocabOverlayTone(170, 520, 0.16, "vocabZero");
  }

  function playVocabOverlayClingSound() {
    playVocabOverlayTone(880, 110, 0.14, "vocabCling", SFX_KEYS.vocabCling);
    setTimeout(
      () => playVocabOverlayTone(1320, 160, 0.12, "vocabCling2", SFX_KEYS.vocabCling),
      70
    );
  }

  function debugVocabTickBurst(count = 20, intervalMs = 28) {
    const safeCount = Math.max(1, Math.floor(count));
    const safeInterval = Math.max(8, Math.floor(intervalMs));
    for (let i = 0; i < safeCount; i += 1) {
      const t = safeCount > 1 ? i / (safeCount - 1) : 0;
      const freq = 220 + (1320 - 220) * t;
      setTimeout(() => playVocabOverlayTone(freq, 90, 0.12, "vocabTick"), i * safeInterval);
    }
  }

  useEffect(() => {
    if (!DEV_MODE) return;
    window.__debugVocabTicks = () => debugVocabTickBurst();
    return () => {
      try {
        delete window.__debugVocabTicks;
      } catch (_) {}
    };
  }, []);

  function playSpecialFoundSound() {
    if (isSfxMuted) return;
    playOneShotAudio(SFX_KEYS.specialFound, {
      cooldownKey: "specialFound",
      eqKey: "specialFound",
    });
  }

  function maybePlayAnnouncementSound(item) {
    if (!item) return;
    if (item.type !== "best_possible_score" && item.type !== "longest_possible") {
      return;
    }
    const selfRaw = (nicknameRef.current || nickname || "").trim();
    const authorRaw = (item.nick || "").trim();
    const self = selfRaw ? selfRaw.toLowerCase() : "";
    const author = authorRaw ? authorRaw.toLowerCase() : "";
    if (!self || !author || self !== author) return;
    playGobbleVoice();
  }

  function triggerBigScoreFlash(pts) {
    setBigScoreFlash({ pts, id: Date.now() });
    setTimeout(() => setBigScoreFlash(null), 950);
  }

  function triggerGridShake() {
    setGridShake(false);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => setGridShake(true));
    } else {
      setGridShake(true);
    }
    try {
      if (
        canVibrateRef.current &&
        isVibrationEnabledRef.current &&
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate(50);
      }
    } catch (_) {}
    setTimeout(() => setGridShake(false), 520);
  }

  function triggerPraiseFlash(text, { kind = "blue", shakeGrid = false } = {}) {
    const now = Date.now();
    if (now - praiseLastRef.current < 420) return;
    praiseLastRef.current = now;
    const angle = Math.random() * Math.PI * 2;
    const minDist = isMobileLayout ? 90 : 140;
    const maxDist = isMobileLayout ? 160 : 240;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const dx = Math.round(Math.cos(angle) * dist);
    const dy = Math.round(Math.sin(angle) * dist);
    const scale = Number(((1.0 + Math.random() * 0.5) * 1.6).toFixed(2));
    if (kind === "gobble") {
      lastGobbleAtRef.current = now;
      const durationMs = Math.round(2200 + Math.random() * 400);
      triggerConfettiBurst("gobble");
      setGobbleFlash({ id: now + Math.random(), text, kind, dx, dy, scale, durationMs });
      if (gobbleTimerRef.current) clearTimeout(gobbleTimerRef.current);
      gobbleTimerRef.current = setTimeout(() => setGobbleFlash(null), durationMs);
      if (shakeGrid) triggerGridShake();
      return;
    }
    const durationMs = Math.round(1500 + Math.random() * 300);
    setPraiseFlash({ id: now + Math.random(), text, kind, dx, dy, scale, durationMs });
    if (praiseTimerRef.current) clearTimeout(praiseTimerRef.current);
    praiseTimerRef.current = setTimeout(() => setPraiseFlash(null), durationMs);
    if (shakeGrid) triggerGridShake();
  }

  function triggerConfettiBurst(kind = "target") {
    if (typeof window === "undefined") return;

    const rect = gridRef.current?.getBoundingClientRect?.();
    const origin = rect
      ? {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height * 0.42) / window.innerHeight,
        }
      : { x: 0.5, y: 0.4 };

    const base = {
      origin,
      zIndex: 13050,
      disableForReducedMotion: true,
    };

    const fire = (particleRatio, opts) => {
      confetti({
        ...base,
        ...opts,
        particleCount: Math.floor(140 * particleRatio),
      });
    };

    if (kind === "gobble") {
      fire(0.35, {
        spread: 65,
        startVelocity: 52,
        scalar: 1.05,
        shapes: ["star"],
        colors: ["#fbbf24", "#f59e0b", "#fde68a"],
        ticks: 120,
      });
      fire(0.25, {
        spread: 95,
        startVelocity: 38,
        scalar: 0.9,
        shapes: ["circle"],
        colors: ["#ffffff", "#fef3c7"],
        ticks: 140,
      });
      return;
    }

    if (kind === "target") {
      fire(0.55, {
        spread: 105,
        startVelocity: 42,
        scalar: 1.0,
        shapes: ["square", "circle"],
        colors: ["#22c55e", "#3b82f6", "#a855f7", "#eab308", "#ef4444"],
        ticks: 200,
      });
      fire(0.15, {
        spread: 160,
        startVelocity: 18,
        scalar: 0.85,
        shapes: ["circle"],
        colors: ["#ffffff"],
        ticks: 220,
      });
      return;
    }

    const end = Date.now() + 2400;
    (function frame() {
      confetti({
        ...base,
        particleCount: 4,
        angle: 60,
        spread: 55,
        startVelocity: 58,
        scalar: 1.0,
        origin: { x: 0.05, y: 0.9 },
        colors: ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"],
        ticks: 260,
      });
      confetti({
        ...base,
        particleCount: 4,
        angle: 120,
        spread: 55,
        startVelocity: 58,
        scalar: 1.0,
        origin: { x: 0.95, y: 0.9 },
        colors: ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"],
        ticks: 260,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  useEffect(() => {
    if (phase !== "playing") {
      setHighlightPath([]);
    }
  }, [phase]);

  useEffect(() => {
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    const keepTargetDefinition =
      phase === "results" && typeof targetSummary?.word === "string" && targetSummary.word.trim();
    if ((!isTargetRoundNow || !targetSummary?.word) && !keepTargetDefinition) {
      targetDefinitionRequestRef.current += 1;
      setTargetDefinition({
        word: "",
        loading: false,
        ok: false,
        definition: "",
        source: "",
        url: "",
      });
      return;
    }
    const clean = String(targetSummary.word || "").trim();
    if (!clean) return;
    const cachedDefinition =
      typeof targetSummary?.definition === "string"
        ? targetSummary.definition.trim()
        : "";
    if (cachedDefinition) {
      if (
        targetDefinition.word === clean &&
        targetDefinition.ok &&
        targetDefinition.definition === cachedDefinition
      ) {
        return;
      }
      setTargetDefinition({
        word: targetSummary.definitionTitle || clean,
        loading: false,
        ok: true,
        definition: cachedDefinition,
        source: targetSummary.definitionSource || "",
        url: targetSummary.definitionUrl || "",
      });
      return;
    }
    if (targetDefinition.word === clean && targetDefinition.ok) return;
    const requestId = ++targetDefinitionRequestRef.current;
    setTargetDefinition({
      word: clean,
      loading: true,
      ok: false,
      definition: "",
      source: "",
      url: "",
    });
    const forceFreshDefinition =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    const tried = new Set();
    const baseKey = normalizeWord(clean);
    if (baseKey) tried.add(baseKey);

    const fetchDefinition = (word) => {
      const definitionUrl = forceFreshDefinition
        ? `/api/define?word=${encodeURIComponent(word)}&nocache=1`
        : `/api/define?word=${encodeURIComponent(word)}`;
      fetch(definitionUrl)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (requestId !== targetDefinitionRequestRef.current) return;
          if (!data) {
            setTargetDefinition((prev) => ({ ...prev, loading: false, ok: false }));
            return;
          }
          const definitionText = pickDefinitionText(data);
          const ok = !!definitionText || !!data.ok;
          if (!definitionText) {
            const fallbacks = buildDefinitionFallbacks(clean, data, tried);
            if (fallbacks.length) {
              fetchDefinition(fallbacks[0]);
              return;
            }
          }
          setTargetDefinition({
            word: data.displayWord || data.word || clean,
            loading: false,
            ok,
            definition: definitionText,
            source: data.source || "",
            url: data.url || "",
          });
        })
        .catch(() => {
          if (requestId !== targetDefinitionRequestRef.current) return;
          setTargetDefinition((prev) => ({ ...prev, loading: false, ok: false }));
        });
    };

    fetchDefinition(clean);
  }, [specialRound?.type, targetSummary, targetDefinition.word, targetDefinition.ok, phase]);

  useEffect(() => {
    if (!foundTargetThisRound) return;
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    if (!isTargetRoundNow) return;
    if (roundId && lastTargetConfettiRef.current === roundId) return;
    lastTargetConfettiRef.current = roundId || "target";
    triggerConfettiBurst("target");
  }, [foundTargetThisRound, specialRound?.type, roundId]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (!roundId) return;
    if (roundStartSoundRef.current === roundId) return;
    roundStartSoundRef.current = roundId;
    if (!audioUnlockedRef.current) {
      roundStartPendingRef.current = roundId;
      return;
    }
    playRoundStartSound();
  }, [phase, roundId]);

  useEffect(() => {
    if (phase !== "playing") {
      tickCountdownPlayedRef.current = false;
      return;
    }
    if (typeof tick !== "number") return;
    if (tick > 10) {
      tickCountdownPlayedRef.current = false;
      return;
    }
    if (tick <= 10 && tick > 0 && !tickCountdownPlayedRef.current) {
      const isTargetRoundNow =
        specialRound?.type === "target_long" || specialRound?.type === "target_score";
      tickCountdownPlayedRef.current = true;
      playTickSound({ isTargetRound: isTargetRoundNow });
    }
  }, [tick, phase, specialRound?.type]);

  useEffect(() => {
    const isResults = phase === "results";
    const wasResults = lastAmbientPhaseRef.current === "results";
    lastAmbientPhaseRef.current = phase;

    if (isResults && !wasResults) {
      resetAmbientOrder();
    }

    if (isAmbientMuted) {
      stopAmbientMusic({ fadeMs: 700, keepAlive: false });
      return;
    }

    if (isResults) {
      startAmbientMusic({ silent: false });
    } else {
      stopAmbientMusic({ fadeMs: 700, keepAlive: false });
    }
  }, [phase, isAmbientMuted]);

  useEffect(() => {
    const shouldReset =
      phase === "playing" ||
      breakKind === "tournament_end" ||
      typeof breakCountdown !== "number" ||
      breakCountdown > 10 ||
      breakCountdown <= 0;
    if (shouldReset) {
      countdownTickPlayedRef.current = false;
      return;
    }
    if (!countdownTickPlayedRef.current) {
      countdownTickPlayedRef.current = true;
      playCountdownTickSound();
    }
  }, [breakCountdown, phase, breakKind]);

  useEffect(() => {
    if (phase !== "playing") {
      setAnalysis(null);
      setHighlightPlayers([]);
    }
  }, [phase]);

  function stopVocabOverlayAnimation() {
    clearVocabOverlayTimers();
    setIsVocabOverlayOpen(false);
    setVocabOverlayPhase("idle");
    setVocabOverlayAbsorbing(false);
    setVocabOverlayBounce(false);
    setVocabOverlayShowRanking(false);
    setVocabOverlayWordFading(false);
    setVocabOverlayCurrentWord("");
  }

  function skipVocabOverlayAnimation() {
    if (!isVocabOverlayOpen) return;
    playCloseSound();
    clearVocabOverlayTimers();
    setVocabOverlayPhase("out");
    queueVocabOverlayTimer(
      setTimeout(() => {
        stopVocabOverlayAnimation();
      }, 220)
    );
  }

  function startVocabOverlayAnimation({
    baseCount,
    deltaCount,
    targetCount,
    rankStart,
    rankEnd,
    words,
  }) {
    clearVocabOverlayTimers();
    setIsVocabOverlayOpen(true);
    setVocabOverlayPhase("in");
    setVocabOverlayBaseCount(baseCount);
    setVocabOverlayTargetCount(targetCount);
    setVocabOverlayAnimatedTotal(baseCount);
    setVocabOverlayAnimatedDelta(0);
    setVocabOverlayAbsorbing(false);
    setVocabOverlayBounce(false);
    setVocabOverlayRank(rankStart);
    setVocabOverlayRankStart(rankStart);
    setVocabOverlayRankEnd(rankEnd);
    const startLevel = getVocabLevelMeta(baseCount);
    setVocabOverlayImageLevel(startLevel);
    setVocabOverlayStartLevelKey(startLevel?.key || null);
    setVocabOverlayImagePhase("idle");
    setVocabOverlayHasLevelUp(false);
    setVocabOverlayAbsorbVec({ x: 0, y: 0 });
    setVocabOverlayShowRanking(false);
    setVocabOverlayWordFading(false);
    const safeWords = Array.isArray(words) ? words : [];
    vocabOverlayWordsRef.current = safeWords;
    setVocabOverlayWords(safeWords);
    setVocabOverlayCurrentWord(safeWords[0] || "");

    queueVocabOverlayTimer(
      setTimeout(() => {
        setVocabOverlayPhase("idle");
      }, VOCAB_OVERLAY_FADE_MS)
    );

    queueVocabOverlayTimer(
      setTimeout(() => {
        if (!deltaCount || deltaCount <= 0) {
          playVocabOverlayZeroSound();
          setVocabOverlayBounce(true);
          queueVocabOverlayTimer(setTimeout(() => setVocabOverlayBounce(false), 700));
          queueVocabOverlayTimer(
            setTimeout(() => {
              setVocabOverlayPhase("out");
              queueVocabOverlayTimer(
                setTimeout(() => {
                  stopVocabOverlayAnimation();
                }, VOCAB_OVERLAY_FADE_MS)
              );
            }, VOCAB_OVERLAY_END_HOLD_MS)
          );
          return;
        }

        const perWordMs = VOCAB_OVERLAY_SEGMENT_MS / VOCAB_OVERLAY_WORDS_PER_SEGMENT;
        const linearDurationMs = Math.max(0, deltaCount) * perWordMs;
        const durationMs = clampValue(
          linearDurationMs,
          VOCAB_OVERLAY_MIN_COUNT_MS,
          VOCAB_OVERLAY_MAX_COUNT_MS
        );
        const accelStrength = clampValue(
          (linearDurationMs - durationMs) / Math.max(1, linearDurationMs),
          0,
          1
        );
        const accelPower = 1 + accelStrength * 3.2;
        const startAt = performance.now();
        vocabOverlayLastTickRef.current = 0;

        const step = (now) => {
          const elapsed = now - startAt;
          const t = Math.min(1, Math.max(0, elapsed / durationMs));
          const eased =
            accelStrength > 0.01
              ? (Math.exp(accelPower * t) - 1) / (Math.exp(accelPower) - 1)
              : t;
          const currentDelta = Math.round(deltaCount * eased);
          const currentTotal = baseCount + currentDelta;
          setVocabOverlayAnimatedDelta(currentDelta);
          setVocabOverlayAnimatedTotal(currentTotal);

          while (vocabOverlayLastTickRef.current < currentDelta) {
            vocabOverlayLastTickRef.current += 1;
            playVocabOverlayTickSound(vocabOverlayLastTickRef.current);
            const wordList = vocabOverlayWordsRef.current;
            if (wordList && wordList.length) {
              const idx = Math.min(vocabOverlayLastTickRef.current - 1, wordList.length - 1);
              const nextWord = wordList[idx] || "";
              setVocabOverlayCurrentWord(nextWord);
            }
          }

          if (t < 1) {
            vocabOverlayRafRef.current = requestAnimationFrame(step);
          } else {
            setVocabOverlayAnimatedDelta(deltaCount);
            setVocabOverlayAnimatedTotal(targetCount);
            if (Number.isFinite(rankEnd)) {
              setVocabOverlayRank(rankEnd);
            }
            setVocabOverlayBounce(true);
            const absorbDelayMs = 420;
            queueVocabOverlayTimer(
              setTimeout(() => {
                setVocabOverlayBounce(false);
                const deltaEl = vocabOverlayDeltaRef.current;
                const cursorEl = vocabOverlayCursorRef.current;
                if (deltaEl && cursorEl) {
                  const deltaRect = deltaEl.getBoundingClientRect();
                  const cursorRect = cursorEl.getBoundingClientRect();
                  const dx =
                    cursorRect.left +
                    cursorRect.width / 2 -
                    (deltaRect.left + deltaRect.width / 2);
                  const dy =
                    cursorRect.top +
                    cursorRect.height / 2 -
                    (deltaRect.top + deltaRect.height / 2);
                  setVocabOverlayAbsorbVec({
                    x: Math.round(dx),
                    y: Math.round(dy),
                  });
                }
                setVocabOverlayWordFading(true);
                queueVocabOverlayTimer(
                  setTimeout(() => {
                    setVocabOverlayShowRanking(true);
                    setVocabOverlayWordFading(false);
                  }, 350)
                );
                setVocabOverlayAbsorbing(true);
                queueVocabOverlayTimer(
                  setTimeout(() => {
                    playVocabOverlayClingSound();
                  }, VOCAB_OVERLAY_ABSORB_MS)
                );
                queueVocabOverlayTimer(
                  setTimeout(() => {
                    setVocabOverlayPhase("out");
                    queueVocabOverlayTimer(
                      setTimeout(() => {
                        stopVocabOverlayAnimation();
                      }, VOCAB_OVERLAY_FADE_MS)
                    );
                  }, VOCAB_OVERLAY_ABSORB_MS + VOCAB_OVERLAY_END_HOLD_MS)
                );
              }, absorbDelayMs)
            );
          }
        };

        vocabOverlayRafRef.current = requestAnimationFrame(step);
      }, VOCAB_OVERLAY_ZERO_DELAY_MS)
    );
  }

  useEffect(() => {
    if (phase !== "results") {
      stopVocabOverlayAnimation();
      return;
    }
    if (!Number.isFinite(vocabCount)) return;
    if (!vocabResultsReadyKey) return;
    const overlayKey = vocabResultsReadyKey;
    if (vocabOverlayRoundRef.current === overlayKey) return;
    const vocabSeenStorageKey = installId
      ? `${VOCAB_OVERLAY_SEEN_STORAGE_KEY}:${installId}`
      : VOCAB_OVERLAY_SEEN_STORAGE_KEY;
    let overlayAlreadySeen = false;
    try {
      overlayAlreadySeen =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(vocabSeenStorageKey) === overlayKey;
    } catch (_) {
      overlayAlreadySeen = false;
    }
    if (overlayAlreadySeen) {
      vocabOverlayRoundRef.current = overlayKey;
      return;
    }
    vocabOverlayRoundRef.current = overlayKey;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(vocabSeenStorageKey, overlayKey);
      }
    } catch (_) {}

    const selfKey = (nicknameRef.current || nickname || "").trim();
    const selfResult =
      Array.isArray(finalResults) && selfKey
        ? finalResults.find((entry) => entry.nick === selfKey)
        : null;
    const hasNewVocabWords =
      selfResult && Object.prototype.hasOwnProperty.call(selfResult, "newVocabWords");
    const rawWordList = hasNewVocabWords
      ? Array.isArray(selfResult?.newVocabWords)
        ? selfResult.newVocabWords
        : []
      : Array.isArray(acceptedRef.current)
      ? acceptedRef.current
      : Array.isArray(accepted)
      ? accepted
      : [];
    const sortedWords = Array.from(new Set(rawWordList))
      .map((word) => String(word || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    let deltaCount = Number.isFinite(vocabRoundDelta)
      ? Math.max(0, vocabRoundDelta)
      : 0;
    if (hasNewVocabWords) {
      deltaCount = sortedWords.length;
    } else if (!Number.isFinite(deltaCount) || deltaCount <= 0) {
      deltaCount = Math.max(0, vocabCount - (vocabBaselineRef.current || 0));
    }
    let baseCount = Number.isFinite(vocabCount) ? Math.max(0, vocabCount - deltaCount) : 0;
    if (!Number.isFinite(baseCount)) baseCount = 0;
    const targetCount = baseCount + deltaCount;
    const rankStart = Number.isFinite(baseCount) ? getWeeklyVocabRankForCount(baseCount) : null;
    const rankEnd = Number.isFinite(targetCount) ? getWeeklyVocabRankForCount(targetCount) : null;

    startVocabOverlayAnimation({
      baseCount,
      deltaCount,
      targetCount,
      rankStart,
      rankEnd,
      words: sortedWords,
    });
  }, [
    accepted,
    finalResults,
    phase,
    roundId,
    nickname,
    tournamentSummaryAt,
    installId,
    vocabCount,
    vocabRoundDelta,
    vocabResultsReadyKey,
  ]);

  useEffect(() => {
    if (!isVocabOverlayOpen) return;
    const nextLevel = getVocabLevelMeta(vocabOverlayAnimatedTotal);
    if (!nextLevel || !vocabOverlayImageLevel) return;
    if (nextLevel.key === vocabOverlayImageLevel.key) return;
    if (vocabOverlayImagePhase !== "idle") return;
    if (vocabOverlayStartLevelKey && nextLevel.key !== vocabOverlayStartLevelKey) {
      setVocabOverlayHasLevelUp(true);
    }
    setVocabOverlayImagePhase("out");
    queueVocabOverlayTimer(
      setTimeout(() => {
        setVocabOverlayImageLevel(nextLevel);
        setVocabOverlayImagePhase("in");
        triggerConfettiBurst("gobble");
      }, VOCAB_OVERLAY_IMAGE_FADE_MS)
    );
    queueVocabOverlayTimer(
      setTimeout(() => {
        setVocabOverlayImagePhase("idle");
      }, VOCAB_OVERLAY_IMAGE_FADE_MS * 2)
    );
  }, [
    isVocabOverlayOpen,
    vocabOverlayAnimatedTotal,
    vocabOverlayImageLevel,
    vocabOverlayImagePhase,
    vocabOverlayStartLevelKey,
  ]);

  useEffect(() => {
    return () => {
      clearVocabOverlayTimers();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (gridRotateTimerRef.current) {
        clearTimeout(gridRotateTimerRef.current);
        gridRotateTimerRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const pending = gridRotateAnimRef.current;
    if (!pending) return;
    gridRotateAnimRef.current = null;
    if (!pending.prevRects || pending.prevRects.size === 0) return;

    const durationMs = GRID_ROTATE_ANIM_MS;
    const easing = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    const spinDeg = Number.isFinite(pending.spin) ? pending.spin : 0;
    const letterSpin = spinDeg >= 0 ? 360 : -360;

    pending.prevRects.forEach((prev, index) => {
      const el = tileRefs.current[index];
      if (!el) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (!dx && !dy) return;

      const orbitFrames = [
        { transform: `translate(${dx}px, ${dy}px) rotate(${spinDeg}deg)` },
        { transform: "translate(0px, 0px) rotate(0deg)" },
      ];

      if (typeof el.animate === "function") {
        el.animate(orbitFrames, {
          duration: durationMs,
          easing,
          fill: "both",
        });
      } else {
        el.style.transition = `transform ${durationMs}ms ${easing}`;
        el.style.transform = orbitFrames[0].transform;
        requestAnimationFrame(() => {
          el.style.transform = orbitFrames[1].transform;
        });
        setTimeout(() => {
          el.style.transition = "";
          el.style.transform = "";
        }, durationMs);
      }

      const letterEl = el.querySelector(".tile-letter");
      if (!letterEl) return;
      const letterFrames = [
        { transform: "rotate(0deg)" },
        { transform: `rotate(${letterSpin}deg)` },
      ];
      const letterDuration = Math.round(durationMs * 0.85);
      if (typeof letterEl.animate === "function") {
        letterEl.animate(letterFrames, {
          duration: letterDuration,
          easing,
          fill: "both",
        });
      } else {
        letterEl.style.transition = `transform ${letterDuration}ms ${easing}`;
        letterEl.style.transform = letterFrames[0].transform;
        requestAnimationFrame(() => {
          letterEl.style.transform = letterFrames[1].transform;
        });
        setTimeout(() => {
          letterEl.style.transition = "";
          letterEl.style.transform = "";
        }, letterDuration);
      }
    });
  }, [gridRotationTurns]);

  const clearImplodeAnimation = React.useCallback(() => {
    if (implodeTimerRef.current) {
      clearTimeout(implodeTimerRef.current);
      implodeTimerRef.current = null;
    }
    tileRefs.current.forEach((el) => {
      if (!el) return;
      el.classList.remove("tile-implode");
      el.style.removeProperty("--implode-x");
      el.style.removeProperty("--implode-y");
      el.style.removeProperty("--implode-ox");
      el.style.removeProperty("--implode-oy");
      el.style.removeProperty("--implode-rot");
      el.style.removeProperty("--implode-delay");
      el.style.removeProperty("--implode-dur");
      el.style.removeProperty("--implode-opacity-mid");
      el.style.removeProperty("--implode-scale-mid");
      el.style.removeProperty("--implode-scale-end");
    });
  }, []);

  const triggerImplodeAnimation = React.useCallback(() => {
    const gridEl = gridRef.current;
    if (!gridEl) return;
    const gridRect = gridEl.getBoundingClientRect();
    if (!gridRect.width || !gridRect.height) return;

    const centerX = gridRect.left + gridRect.width / 2;
    const centerY = gridRect.top + gridRect.height / 2;
    const maxDist = Math.max(1, Math.hypot(gridRect.width / 2, gridRect.height / 2));
    let maxTotalMs = 0;

    tileRefs.current.forEach((el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const tileCenterX = rect.left + rect.width / 2;
      const tileCenterY = rect.top + rect.height / 2;
      const dx = centerX - tileCenterX;
      const dy = centerY - tileCenterY;
      const dist = Math.hypot(dx, dy);
      const distNorm = Math.min(1, dist / maxDist);
      const orbitFactor = 0.22 + Math.random() * 0.28;
      const rot = (Math.random() * 2 - 1) * 720;
      const delay = distNorm * 0.35;
      const minDur = 1.2;
      const maxDur = 2.6;
      const duration = minDur + distNorm * (maxDur - minDur);
      const opacityMid = Math.max(0.1, 1 - distNorm * 0.6);
      const scaleMid = 0.6 + distNorm * 0.25;
      const scaleEnd = 0.08 + distNorm * 0.12;

      let ox = 0;
      let oy = 0;
      if (dist > 0.5) {
        const inv = 1 / dist;
        const perpX = -dy * inv;
        const perpY = dx * inv;
        const orbitMag = dist * orbitFactor;
        ox = perpX * orbitMag;
        oy = perpY * orbitMag;
      }

      el.style.setProperty("--implode-x", `${dx}px`);
      el.style.setProperty("--implode-y", `${dy}px`);
      el.style.setProperty("--implode-ox", `${ox}px`);
      el.style.setProperty("--implode-oy", `${oy}px`);
      el.style.setProperty("--implode-rot", `${rot}deg`);
      el.style.setProperty("--implode-delay", `${delay}s`);
      el.style.setProperty("--implode-dur", `${duration}s`);
      el.style.setProperty("--implode-opacity-mid", `${opacityMid}`);
      el.style.setProperty("--implode-scale-mid", `${scaleMid}`);
      el.style.setProperty("--implode-scale-end", `${scaleEnd}`);

      el.classList.remove("tile-implode");
      void el.offsetWidth;
      el.classList.add("tile-implode");
      maxTotalMs = Math.max(maxTotalMs, (delay + duration) * 1000);
    });

    if (maxTotalMs > 0) {
      if (implodeTimerRef.current) clearTimeout(implodeTimerRef.current);
      const cleanupMs = Math.max(maxTotalMs, IMPLODE_PHASE_MS) + 80;
      implodeTimerRef.current = setTimeout(() => {
        clearImplodeAnimation();
      }, Math.ceil(cleanupMs));
    }
  }, [clearImplodeAnimation]);

  const stopImplodePhase = React.useCallback(() => {
    if (implodePhaseTimerRef.current) {
      clearTimeout(implodePhaseTimerRef.current);
      implodePhaseTimerRef.current = null;
    }
    implodeFallbackRef.current = false;
    pendingRoundEndRef.current = null;
    pendingBreakStartRef.current = null;
    setImplodeActive(false);
    clearImplodeAnimation();
  }, [clearImplodeAnimation]);

  const clearSelection = React.useCallback(() => {
    setCurrentTiles([]);
    currentTilesRef.current = [];
    setHighlightPath([]);
  }, []);

  const startImplodePhase = React.useCallback(
    (payload = null, { fallback = false } = {}) => {
      if (payload) {
        pendingRoundEndRef.current = payload;
        implodeFallbackRef.current = false;
      } else if (fallback) {
        implodeFallbackRef.current = true;
      }

      if (implodePhaseTimerRef.current) {
        return;
      }

      if (!payload) {
        pendingRoundEndRef.current = null;
      }

      const activeRoundId = payload?.roundId ?? roundIdRef.current ?? null;
      if (activeRoundId) {
        implodeRoundRef.current = activeRoundId;
      }

      if (draggingRef.current) {
        draggingRef.current = false;
        clearSelection();
      }

      setImplodeActive(true);
      triggerImplodeAnimation();

      implodePhaseTimerRef.current = setTimeout(() => {
        implodePhaseTimerRef.current = null;
        const pending = pendingRoundEndRef.current;
        pendingRoundEndRef.current = null;
        const shouldFallback = implodeFallbackRef.current;
        implodeFallbackRef.current = false;
        if (pending && processRoundEndedRef.current) {
          processRoundEndedRef.current(pending);
        } else if (shouldFallback) {
          setServerStatus("break");
          setPhase("results");
        }
        const pendingBreak = pendingBreakStartRef.current;
        if (pendingBreak && processBreakStartedRef.current) {
          pendingBreakStartRef.current = null;
          processBreakStartedRef.current(pendingBreak);
        }
        setImplodeActive(false);
        clearImplodeAnimation();
      }, IMPLODE_PHASE_MS);
    },
    [clearImplodeAnimation, triggerImplodeAnimation]
  );

  function mergeLateWordsIntoResults(results) {
    const late = lateWordsRef.current;
    const base = Array.isArray(results) ? results : [];
    if (!late || late.size === 0) return base;
    const selfNick = (nicknameRef.current || "").trim();
    if (!selfNick) {
      late.clear();
      return base;
    }
    const next = base.map((entry) => ({ ...entry }));
    let entry = next.find((row) => row && row.nick === selfNick);
    if (!entry) {
      entry = {
        nick: selfNick,
        score: 0,
        words: [],
        wordTimes: {},
        uniqueWords: [],
        newVocabWords: [],
        isBot: false,
        isDailyChampion: false,
        connected: true,
        participated: true,
      };
      next.push(entry);
    }
    const existingNorms = new Set(
      Array.isArray(entry.words)
        ? entry.words.map((word) => normalizeWord(word)).filter(Boolean)
        : []
    );
    const wordTimes =
      entry.wordTimes && typeof entry.wordTimes === "object"
        ? { ...entry.wordTimes }
        : {};
    let addScore = 0;
    const addedWords = [];
    const addedNorms = [];
    late.forEach((meta, norm) => {
      if (!norm || existingNorms.has(norm)) return;
      existingNorms.add(norm);
      const rawWord = meta?.raw || norm.toUpperCase();
      addedWords.push(rawWord);
      addedNorms.push(norm);
      if (Number.isFinite(meta?.pts)) addScore += meta.pts;
      if (Number.isFinite(meta?.ts)) {
        wordTimes[norm] = meta.ts;
      }
    });
    if (addedWords.length) {
      entry.words = [...(Array.isArray(entry.words) ? entry.words : []), ...addedWords];
      const uniqueSet = new Set(
        Array.isArray(entry.uniqueWords)
          ? entry.uniqueWords.map((word) => normalizeWord(word)).filter(Boolean)
          : []
      );
      addedNorms.forEach((norm) => uniqueSet.add(norm));
      entry.uniqueWords = Array.from(uniqueSet);
      entry.wordTimes = wordTimes;
      entry.score = (Number.isFinite(entry.score) ? entry.score : 0) + addScore;
      entry.participated = true;
      if (entry.connected == null) entry.connected = true;
    }
    late.clear();
    return next;
  }

  const processRoundEnded = React.useCallback(
    ({
      roomId: endedRoomId,
      roundId: endedId,
      results = [],
      tournament: tournamentPayload = null,
      tournamentSummary: summary = null,
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
    }) => {
      if (endedRoomId) {
        setCurrentRoomId(endedRoomId);
        setRoomId(endedRoomId);
      }
      roundStartAtRef.current = 0;
      setPhase("results");
      setServerStatus("break");
      setProvisionalRanking([]);
      setAnnouncements([]);
      setFinalResults(mergeLateWordsIntoResults(results));
      setServerEndsAt(null);
      setServerRoundDurationMs(null);
      setRoundId(endedId || null);
      setTournament(tournamentPayload || tournamentRef.current || null);
      const endBreakKind = tournamentPayload?.breakKind || null;
      setBreakKind(endBreakKind);
      if (tournamentPayload) {
        ensureTournamentBaseline(tournamentPayload, { captureRanking: true });
      }
      if (endBreakKind === "tournament_end") {
        setTournamentFinaleHoldUntil(
          getNowServerMs() + FINAL_ROUND_RESULTS_SECONDS * 1000
        );
      } else {
        setTournamentFinaleHoldUntil(null);
      }
      setTournamentRoundPoints(tournamentPayload?.roundAwarded || {});
      setTournamentTotals(tournamentPayload?.totals || {});
      const baselineRound = tournamentBaselineRef.current.rankingRound;
      const currentRound = Number.isFinite(tournamentPayload?.round)
        ? tournamentPayload.round
        : null;
      const useBaselineDelta =
        Number.isFinite(baselineRound) &&
        Number.isFinite(currentRound) &&
        baselineRound < currentRound;
      setTournamentRanking(
        Array.isArray(tournamentPayload?.ranking)
          ? tournamentPayload.ranking.map((e, idx) => {
              const posNow = Number.isFinite(e.pos) ? e.pos : idx + 1;
              const basePos = tournamentBaselineRef.current.rankingMap?.get(e.nick);
              const delta =
                useBaselineDelta && Number.isFinite(basePos)
                  ? basePos - posNow
                  : e.delta ?? 0;
              return {
                nick: e.nick,
                score: e.points,
                gobbles: e.gobbles ?? null,
                delta,
                isBot: !!e.isBot,
                isDailyChampion: !!e.isDailyChampion,
              };
            })
          : []
      );
      setTournamentSummary(summary || null);
      setTournamentSummaryAt(summaryAt || null);
      setTargetSummary(targetSummaryPayload || null);
      setResultsRankingMode("round");
      const stableVocabKey =
        endedId ||
        summaryAt ||
        (tournamentPayload?.id
          ? `tournament-${tournamentPayload.id}-${tournamentPayload.round || "end"}`
          : null);
      const vocabResultsKey = stableVocabKey || `results-${Date.now()}`;
      vocabResultsPendingRef.current = vocabResultsKey;
      setVocabResultsReadyKey(null);
      void requestVocabCount().then((count) => {
        if (vocabResultsPendingRef.current !== vocabResultsKey) return;
        if (!Number.isFinite(count)) {
          setVocabRoundDelta(null);
          return;
        }
        const base = vocabBaselineRef.current;
        if (Number.isFinite(base)) {
          setVocabRoundDelta(Math.max(0, count - base));
        } else {
          setVocabRoundDelta(null);
        }
        setVocabResultsReadyKey(vocabResultsKey);
      });

      if (Array.isArray(results)) {
        const selfScore = results.find((r) => r.nick === nicknameRef.current.trim())?.score;
        if (typeof selfScore === "number") {
          setScore(selfScore);
        }
      }
    },
    []
  );

  useEffect(() => {
    processRoundEndedRef.current = processRoundEnded;
  }, [processRoundEnded]);


  const playOutroThenResults = React.useCallback(
    async (payload, { fallback = false } = {}) => {
      const roundKey = payload?.roundId ?? roundIdRef.current ?? null;
      if (outroInFlightRef.current) {
        if (payload) pendingRoundEndRef.current = payload;
        return;
      }
      if (roundKey && outroRoundRef.current === roundKey) {
        if (payload && processRoundEndedRef.current) {
          processRoundEndedRef.current(payload);
        } else if (payload) {
          pendingRoundEndRef.current = payload;
        }
        return;
      }
      if (roundKey) {
        outroRoundRef.current = roundKey;
      }
      outroInFlightRef.current = true;

      pendingRoundEndRef.current = payload || null;
      implodeFallbackRef.current = !!fallback;
      pendingBreakStartRef.current = null;

      const gridEl = gridRef.current;
      const gridRect = gridEl?.getBoundingClientRect?.();
      const holeX =
        gridRect && Number.isFinite(gridRect.left) && Number.isFinite(gridRect.width)
          ? gridRect.left + gridRect.width / 2
          : null;
      const holeY =
        gridRect && Number.isFinite(gridRect.top) && Number.isFinite(gridRect.height)
          ? gridRect.top + gridRect.height / 2
          : null;

      const tileEls = tileRefs.current.filter(Boolean);

      // On laisse les joueurs valider pendant l'anim trou noir (comptage local).
      if (draggingRef.current) {
        draggingRef.current = false;
        clearSelection();
      }

      if (blackHoleSourisLoopRef.current.intervalId) {
        clearInterval(blackHoleSourisLoopRef.current.intervalId);
        blackHoleSourisLoopRef.current.intervalId = null;
      }
      if (blackHoleSourisLoopRef.current.stopTimer) {
        clearTimeout(blackHoleSourisLoopRef.current.stopTimer);
        blackHoleSourisLoopRef.current.stopTimer = null;
      }
      if (blackHoleClavierFadeRef.current) {
        clearTimeout(blackHoleClavierFadeRef.current);
        blackHoleClavierFadeRef.current = null;
      }
      if (blackHoleAuxStopRef.current) {
        clearTimeout(blackHoleAuxStopRef.current);
        blackHoleAuxStopRef.current = null;
      }

      const prevOpacity = gridEl?.style?.opacity;
      const prevTransition = gridEl?.style?.transition;
      if (gridEl) {
        gridEl.style.transition = "opacity 40ms linear";
        gridEl.style.opacity = "0";
      }

      if (!isSfxMuted) {
        const syncToken = ++blackHoleSyncTokenRef.current;
        const stopAux = (fadeMs = 260) => {
          if (blackHoleSyncTokenRef.current !== syncToken) return;
          if (blackHoleSourisLoopRef.current.intervalId) {
            clearInterval(blackHoleSourisLoopRef.current.intervalId);
            blackHoleSourisLoopRef.current.intervalId = null;
          }
          if (blackHoleSourisLoopRef.current.stopTimer) {
            clearTimeout(blackHoleSourisLoopRef.current.stopTimer);
            blackHoleSourisLoopRef.current.stopTimer = null;
          }
          if (blackHoleClavierFadeRef.current) {
            clearTimeout(blackHoleClavierFadeRef.current);
            blackHoleClavierFadeRef.current = null;
          }
          if (blackHoleAuxStopRef.current) {
            clearTimeout(blackHoleAuxStopRef.current);
            blackHoleAuxStopRef.current = null;
          }
          if (blackHoleClavierHandleRef.current) {
            blackHoleClavierHandleRef.current.fadeOut?.(fadeMs);
            blackHoleClavierHandleRef.current = null;
          }
        };

        if (blackHoleHandleRef.current) {
          blackHoleHandleRef.current.stop?.();
          blackHoleHandleRef.current = null;
        }
        if (blackHoleChebHandleRef.current) {
          blackHoleChebHandleRef.current.stop?.();
          blackHoleChebHandleRef.current = null;
        }
        if (blackHoleClavierHandleRef.current) {
          blackHoleClavierHandleRef.current.stop?.();
          blackHoleClavierHandleRef.current = null;
        }

        blackHoleHandleRef.current = playSfxHandle(SFX_KEYS.blackHole, {
          eqKey: "blackHole",
          voiceKey: "blackHole",
        });
        blackHoleChebHandleRef.current = playSfxHandle(SFX_KEYS.chebabeu, {
          eqKey: "chebabeu",
          voiceKey: "chebabeu",
        });
        blackHoleClavierHandleRef.current = playSfxHandle(SFX_KEYS.clavier, {
          eqKey: "clavier",
          voiceKey: "clavier",
        });

        const chebBuffer = AssetManager.getSfxBuffer(SFX_KEYS.chebabeu);
        const chebDuration = chebBuffer?.duration || null;
        const sourisBuffer = AssetManager.getSfxBuffer(SFX_KEYS.souris);
        const sourisDuration = sourisBuffer?.duration || 0.22;
        const clavierBuffer = AssetManager.getSfxBuffer(SFX_KEYS.clavier);
        const clavierDuration = clavierBuffer?.duration || null;

        const chebStartAt = performance.now();
        const playSourisOnce = () => {
          playOneShotAudio(SFX_KEYS.souris, {
            cooldownKey: "souris",
            eqKey: "souris",
            cooldownMs: 0,
          });
        };
        playSourisOnce();
        const scheduleSync = () => {
          if (blackHoleSyncTokenRef.current !== syncToken) return;
          if (!chebDuration) {
            blackHoleAuxStopRef.current = setTimeout(() => {
              stopAux(280);
            }, 6400);
            return;
          }
          const elapsed = performance.now() - chebStartAt;
          const totalMs = Math.max(0, Math.round(chebDuration * 1000));
          const remainingMs = Math.max(0, totalMs - elapsed);
          if (remainingMs <= 40) return;

          const intervalMs = Math.max(180, Math.round(sourisDuration * 1000 * 1.6));
          if (remainingMs > intervalMs + 20) {
            blackHoleSourisLoopRef.current.intervalId = setInterval(
              playSourisOnce,
              intervalMs
            );
            blackHoleSourisLoopRef.current.stopTimer = setTimeout(() => {
              if (blackHoleSourisLoopRef.current.intervalId) {
                clearInterval(blackHoleSourisLoopRef.current.intervalId);
                blackHoleSourisLoopRef.current.intervalId = null;
              }
              blackHoleSourisLoopRef.current.stopTimer = null;
            }, remainingMs);
          }

          if (clavierDuration && clavierDuration * 1000 > totalMs + 10) {
            const fadeMs = Math.min(600, Math.max(180, Math.round(totalMs * 0.22)));
            const delay = Math.max(0, remainingMs - fadeMs);
            blackHoleClavierFadeRef.current = setTimeout(() => {
              if (blackHoleClavierHandleRef.current) {
                blackHoleClavierHandleRef.current.fadeOut?.(fadeMs);
                blackHoleClavierHandleRef.current = null;
              }
              blackHoleClavierFadeRef.current = null;
            }, delay);
          }
          blackHoleAuxStopRef.current = setTimeout(() => {
            stopAux(280);
          }, remainingMs);
        };
        scheduleSync();
      }

      let fxOverlay = null;
      let fxFade = null;
      try {
        if (holeX != null && holeY != null && tileEls.length > 0) {
          const fx = await playBlackHoleOutro3D({
            tileEls,
            holeX,
            holeY,
            durationMs: 6000,
          });
          fxOverlay = fx?.overlay || null;
          fxFade = fx?.fade || null;
        }
      } finally {
        if (gridEl) {
          gridEl.style.opacity = prevOpacity || "";
          gridEl.style.transition = prevTransition || "";
        }
      }

      const pending = pendingRoundEndRef.current;
      pendingRoundEndRef.current = null;
      const shouldFallback = implodeFallbackRef.current;
      implodeFallbackRef.current = false;

      if (pending && processRoundEndedRef.current) {
        processRoundEndedRef.current(pending);
      } else if (shouldFallback) {
        setServerStatus("break");
        setPhase("results");
      }

      if (fxOverlay && fxFade) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        try {
          await fxFade
            .animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 220,
              easing: "ease-out",
              fill: "forwards",
            })
            .finished;
        } catch (_) {}
        fxOverlay.remove();
      }

      const pendingBreak = pendingBreakStartRef.current;
      if (pendingBreak && processBreakStartedRef.current) {
        pendingBreakStartRef.current = null;
        processBreakStartedRef.current(pendingBreak);
      }

      outroInFlightRef.current = false;
    },
    [clearSelection]
  );

  useEffect(() => {
    playOutroThenResultsRef.current = playOutroThenResults;
  }, [playOutroThenResults]);

  const processBreakStarted = React.useCallback(
    ({
      roomId: incomingRoomId,
      nextStartAt: nextTs,
      breakKind: bk = null,
      tournament: tournamentPayload = null,
      nextSpecial = null,
      tournamentSummary: summary = null,
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
    }) => {
      const activeRoomId = currentRoomIdRef.current;
      if (incomingRoomId && activeRoomId && incomingRoomId !== activeRoomId) return;
      syncServerTime();
      setNextStartAt(nextTs || null);
      setBreakKind(bk);
      if (tournamentPayload) {
        ensureTournamentBaseline(tournamentPayload);
      }
      if (bk !== "tournament_end") {
        setTournamentFinaleHoldUntil(null);
      }
      if (bk) {
        setPhase("results");
        setServerStatus("break");
        setServerEndsAt(null);
        setServerRoundDurationMs(null);
        setRoundId(null);
      }
      if (tournamentPayload) setTournament(tournamentPayload);
      setUpcomingSpecial(nextSpecial && nextSpecial.isSpecial ? nextSpecial : null);
      if (summary) setTournamentSummary(summary);
      setTournamentSummaryAt(summaryAt || null);
      setTargetSummary(targetSummaryPayload || null);
    },
    []
  );

  useEffect(() => {
    processBreakStartedRef.current = processBreakStarted;
  }, [processBreakStarted]);

  useEffect(() => {
    return () => {
      stopImplodePhase();
    };
  }, [stopImplodePhase]);

  function maybeAnnounceBestWord(nick, word, pts) {
    if (typeof pts !== "number") return;
    const maxPossiblePts = bestGridMaxRef.current || 0;
    const maxPossibleLen = bestGridMaxLenRef.current || 0;
    const normalizedWord = normalizeWord(word || "");
    const wordLen = normalizedWord.length;

    if (maxPossibleLen === 0 && maxPossiblePts === 0) return;

    // On ne déclenche l'annonce que pour le mot de longueur maximale
    if (maxPossibleLen > 0 && wordLen !== maxPossibleLen) return;
    if (maxPossiblePts > 0 && pts < maxPossiblePts) return;

    const announceKey =
      maxPossibleLen > 0 ? `len-${maxPossibleLen}` : `pts-${maxPossiblePts}`;
    if (bestWordAnnounceRef.current === announceKey) return;
    bestWordAnnounceRef.current = announceKey;
    setAnnouncements((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: `${nick} a battu le record avec (${pts} pts)`,
      },
    ]);
  }

  function showToast(message) {
    setToast({ id: Date.now(), message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1300);
  }

  function getTileIndexFromPoint(x, y, useTolerance = true) {
    for (let i = 0; i < tileRefs.current.length; i++) {
      const el = tileRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // Hitbox tactile : toute la tuile (rapide), + tolérance légère dans l'inter-tuile.
      const minDim = Math.min(rect.width, rect.height);
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return i;
      if (!useTolerance) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const radius = minDim * 0.6; // tolérance (aide en diagonale / inter-tuile)
      if (dist <= radius) return i;
    }
    return null;
  }

  useEffect(() => {
    let cancelled = false;
    const loadDictionary = async () => {
      const fileKey = makeFileKey("/dico.txt");
      const buffer = AssetManager.getFileBuffer(fileKey);
      if (buffer) {
        try {
          const text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
          if (cancelled) return;
          const list = text
            .split(/\r?\n/)
            .map((x) => normalizeWord(x.trim()))
            .filter(Boolean);
          setDictionary(new Set(list));
          return;
        } catch (_) {}
      }
      if (AssetManager.isReady(fileKey)) {
        console.error(`[asset] dico.txt manquant dans AssetManager (${fileKey})`);
        return;
      }
      try {
        const res = await fetch("/dico.txt");
        const text = await res.text();
        if (cancelled) return;
        const list = text
          .split(/\r?\n/)
          .map((x) => normalizeWord(x.trim()))
          .filter(Boolean);
        setDictionary(new Set(list));
      } catch (_) {}
    };
    loadDictionary();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setInstallSupport("available");
    };
    window.addEventListener("beforeinstallprompt", handler);
    const onInstalled = () => {
      setInstallSupport("installed");
      setInstallMessage("Ajout\u00e9 \u00e0 l'\u00e9cran d'accueil");
      setTimeout(() => setInstallMessage(""), 3000);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Verifie si on est deja en mode standalone
  useEffect(() => {
    const standalone = () => {
      if (typeof window === "undefined") return false;
      return (
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone === true
      );
    };
    if (standalone()) {
      setInstallSupport("installed");
    }
  }, []);

  // Fallback : si on est en mobile mais aucun prompt reçu, on marque indisponible
  useEffect(() => {
    if (!isMobileLayout) return;
    if (installSupport !== "unknown") return;
    const id = setTimeout(() => {
      setInstallSupport((prev) => {
        if (prev !== "unknown") return prev;
        return isChromiumMobileRef.current ? "maybe" : "unavailable";
      });
    }, 2500);
    return () => clearTimeout(id);
  }, [isMobileLayout, installSupport]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        syncServerTime();
      }
    };

    const onFocus = () => {
      syncServerTime();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!DEV_MODE) return;
    if (typeof PerformanceObserver === "undefined") return;
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        let count = 0;
        let maxDuration = 0;
        list.getEntries().forEach((entry) => {
          if (entry.duration < 50) return;
          count += 1;
          maxDuration = Math.max(maxDuration, entry.duration);
          const phase = phaseRef.current;
          const tickValue = tickRef.current;
          if (phase === "playing" && typeof tickValue === "number" && tickValue <= 10) {
            console.warn(
              "[perf] longtask",
              Math.round(entry.duration),
              "ms",
              "tick",
              tickValue
            );
          }
        });
        if (count > 0) {
          const now = Date.now();
          setDevPerfStats((prev) => ({
            ...prev,
            longTasks: prev.longTasks + count,
            lastLongTaskMs: Math.round(maxDuration),
            lastLongTaskAt: now,
          }));
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch (_) {}
    return () => {
      try {
        observer?.disconnect();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    function onRoundStarted({
      roomId: incomingRoomId,
      roundId: incomingRoundId,
      grid,
      durationMs,
      endsAt,
      gridSize: payloadSize,
      special = null,
      gridQuality = null,
      roundNumber = null,
      nextSpecial = null,
      tournament: tournamentPayload = null,
      targetLength = null,
    }) {
      if (!grid || !Array.isArray(grid)) return;
      stopImplodePhase();
      pendingBreakStartRef.current = null;
      pendingRoundEndRef.current = null;
      outroInFlightRef.current = false;
      outroRoundRef.current = null;
      setInputLocked(false);
      syncServerTime();
      if (incomingRoomId) {
        setCurrentRoomId(incomingRoomId);
        setRoomId(incomingRoomId);
      }
      setFinalResults([]);
      setProvisionalRanking([]);
      setAnnouncements([]);
      setNextStartAt(null);
      setUpcomingSpecial(nextSpecial && nextSpecial.isSpecial ? nextSpecial : null);
      setBreakKind(null);
      setTournamentSummary(null);
      setTournamentSummaryAt(null);
      setTournamentFinaleHoldUntil(null);
      setTargetSummary(null);
      setTournament(tournamentPayload || null);
      if (tournamentPayload) {
        ensureTournamentBaseline(tournamentPayload);
      }
      if (
        (special?.type === "target_long" || special?.type === "target_score") &&
        typeof targetLength === "number" &&
        targetLength > 0
      ) {
        setSpecialHint({
          kind: special.type,
          pattern: "",
          length: targetLength,
          cells: [],
        });
      } else {
        setSpecialHint(null);
      }
      setSpecialSolvedOverlay(null);
      setFoundTargetThisRound(false);
      setFoundTargetWord("");
      lateWordsRef.current.clear();
      if (Number.isFinite(endsAt) && Number.isFinite(durationMs)) {
        roundStartAtRef.current = Math.max(0, endsAt - durationMs);
      } else {
        roundStartAtRef.current = getNowServerMs();
      }
      setVocabRoundDelta(null);
      setVocabResultsReadyKey(null);
      vocabResultsPendingRef.current = null;
      const vocabRoundKey = incomingRoundId || Date.now();
      vocabBaselineRoundRef.current = vocabRoundKey;
      void requestVocabCount().then((count) => {
        if (vocabBaselineRoundRef.current !== vocabRoundKey) return;
        if (Number.isFinite(count)) {
          vocabBaselineRef.current = count;
        }
      });
      startGameFromServerRef.current?.(
        grid,
        incomingRoundId,
        durationMs,
        endsAt,
        incomingRoomId,
        payloadSize,
        special,
        gridQuality,
        nextSpecial || null
      );
    }

    function onRoundEnded({
      roomId: endedRoomId,
      roundId: endedId,
      results = [],
      tournament: tournamentPayload = null,
      tournamentSummary: summary = null,
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
    }) {
      playOutroThenResultsRef.current?.(
        {
          roomId: endedRoomId,
          roundId: endedId,
          results,
          tournament: tournamentPayload,
          tournamentSummary: summary,
          tournamentSummaryAt: summaryAt,
          targetSummary: targetSummaryPayload,
        },
        { fallback: false }
      );
    }

    function onRoundEnding({ roomId: endingRoomId, roundId: endingId } = {}) {
      const activeRoomId = currentRoomIdRef.current;
      const activeRoundId = roundIdRef.current;
      if (endingRoomId && activeRoomId && endingRoomId !== activeRoomId) return;
      if (endingId && activeRoundId && endingId !== activeRoundId) return;
      if (phaseRef.current !== "playing") return;
      playOutroThenResultsRef.current?.(null, { fallback: false });
    }

    function onBreakStarted(payload = {}) {
      if (!payload || typeof payload !== "object") return;
      if (pendingRoundEndRef.current || inputLockedRef.current) {
        pendingBreakStartRef.current = payload;
        return;
      }
      if (phaseRef.current === "playing") {
        pendingBreakStartRef.current = payload;
        return;
      }
      processBreakStartedRef.current?.(payload);
    }

    function onPlayersUpdate(list = []) {
      const sanitized = Array.isArray(list) ? list : [];
      setPlayers(sanitized);
      const prev = prevPlayersRef.current;
      const current = new Set(
        sanitized
          .filter((p) => p && !p.isBot && !isSystemAuthor(p.nick))
          .map((p) => p.nick)
          .filter(Boolean)
      );
      const joined = [...current].filter((n) => !prev.has(n));
      const left = [...prev].filter((n) => !current.has(n));
      const sysMessages = [
        ...joined.map((n) => ({
          id: `sys-join-${n}-${Date.now()}`,
          author: "Système",
          text: `${n} a rejoint le serveur`,
        })),
        ...left.map((n) => ({
          id: `sys-leave-${n}-${Date.now()}`,
          author: "Système",
          text: `${n} a quitté le serveur`,
        })),
      ];
      if (sysMessages.length) {
        setChatMessages((prevMsgs) =>
          [...prevMsgs, ...sysMessages].slice(-CHAT_BUFFER_MAX)
        );
      }
      prevPlayersRef.current = current;
    }

    function onRankingUpdate({ roomId: incomingRoomId, roundId: rid, ranking = [] } = {}) {
      const activeRoomId = currentRoomIdRef.current;
      const activeRoundId = roundIdRef.current;
      if (incomingRoomId && activeRoomId && incomingRoomId !== activeRoomId) return;
      if (activeRoundId && rid && rid !== activeRoundId) return;
      setProvisionalRanking(ranking);
    }

    function onChatHistory(history = []) {
      if (!Array.isArray(history)) return;
      setChatMessages(history.slice(-CHAT_BUFFER_MAX));
    }

    function onChatNew(msg) {
      if (!msg || typeof msg !== "object") return;
      setChatMessages((prev) => [...prev, msg].slice(-CHAT_BUFFER_MAX));

      const authorInstallId =
        typeof msg.installId === "string" ? msg.installId : "";
      if (authorInstallId && authorInstallId === installId) return;
      const author = (msg.author || msg.nick || "").trim();
      const me = nicknameRef.current.trim();
      if (author && me && author === me) return;
      if (!isChatOpenMobileRef.current) {
        setMobileChatUnreadCount((prev) => prev + 1);
      }
    }

    function appendAnnouncements(entries) {
      if (!entries || entries.length === 0) return;
      setAnnouncements((prev) => [...prev, ...entries].slice(-40));
    }

    function maybeTriggerGobbleFromAnnouncement(entry) {
      if (!entry) return;
      if (
        entry.type !== "best_possible_score" &&
        entry.type !== "longest_possible"
      ) {
        return;
      }
      const selfRaw = (nicknameRef.current || nickname || "").trim();
      const authorRaw = (entry.nick || "").trim();
      const self = selfRaw ? selfRaw.toLowerCase() : "";
      const author = authorRaw ? authorRaw.toLowerCase() : "";
      if (!self || !author || self !== author) return;
      if (Date.now() - lastGobbleAtRef.current < 1600) return;
      triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
      triggerConfettiBurst("gobble");
    }

    function onAnnouncement(data) {
      if (!data) return;
      if (data.type === "big_word" || data.type === "long_word") {
        return;
      }
      maybePlayAnnouncementSound(data);
      maybeTriggerGobbleFromAnnouncement(data);
      appendAnnouncements([data]);
    }

    function onAnnouncements(batch) {
      if (!Array.isArray(batch) || batch.length === 0) return;
      const filtered = batch.filter(
        (entry) =>
          entry && entry.type !== "big_word" && entry.type !== "long_word"
      );
      if (!filtered.length) return;
      filtered.forEach((entry) => {
        maybePlayAnnouncementSound(entry);
        maybeTriggerGobbleFromAnnouncement(entry);
      });
      appendAnnouncements(filtered);
    }

    function onConnectError() {
      setIsConnecting(false);
      const hasSession = hasSavedSession() || autoResumeEnabledRef.current;
      if (!hasSession && !isLoggedInRef.current) {
        setIsLoggedIn(false);
        setLoginError("Connexion au serveur impossible");
      }
      setConnectionError("Connexion au serveur impossible");
      setPlayers([]);
      setProvisionalRanking([]);
      resumeLockRef.current = false;
      resumeLockAtRef.current = 0;
      reconnectAttemptRef.current = false;
    }

    function onDisconnect() {
      const wasIntentional = intentionalDisconnectRef.current;
      intentionalDisconnectRef.current = false;
      if (isBackgroundedRef.current) {
        return;
      }
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
      }
      const hardReset = () => {
        setIsLoggedIn(false);
        setRoundId(null);
        setServerEndsAt(null);
        setServerStatus("waiting");
        setProvisionalRanking([]);
        setFinalResults([]);
        setConnectionError("Deconnecte du serveur, reessaie.");
        setPlayers([]);
        setMedals({});
        setTournament(null);
        setTournamentTotals({});
        setTournamentRanking([]);
        setTournamentRoundPoints({});
        setTournamentSummary(null);
        setTargetSummary(null);
        setBreakKind(null);
        setTournamentFinaleHoldUntil(null);
        setSpecialHint(null);
        setSpecialSolvedOverlay(null);
        setFoundTargetThisRound(false);
        setFoundTargetWord("");
        resumeLockRef.current = false;
        resumeLockAtRef.current = 0;
        reconnectAttemptRef.current = false;
      };
      if (!wasIntentional && !hasSavedSession() && !isLoggedInRef.current) {
        hardReset();
      }
      if (manualDisconnectRef.current) {
        manualDisconnectRef.current = false;
        setConnectionError("");
        return;
      }
      if (!wasIntentional) {
        setConnectionError("Reconnexion...");
        attemptSilentReconnect();
      }
    }

    function onMedalsUpdate(payload) {
      setMedals(payload && typeof payload === "object" ? payload : {});
    }

    function onSpecialHint(payload) {
      if (!payload || typeof payload !== "object") return;
      const activeRoundId = roundIdRef.current;
      if (activeRoundId && payload.roundId && payload.roundId !== activeRoundId) return;
      const hintKind = payload.kind || null;
      const allowCells = hintKind === "target_long" || hintKind === "target_score";
      const hintLength =
        typeof payload.length === "number" ? payload.length : null;
      setSpecialHint((prev) => ({
        kind: hintKind,
        pattern: payload.pattern || "",
        length: hintLength ?? prev?.length ?? null,
        cells:
          allowCells && Array.isArray(payload.revealCells)
            ? payload.revealCells.filter((idx) => Number.isInteger(idx))
            : [],
      }));
    }

    function onSpecialSolved(payload) {
      if (!payload || typeof payload !== "object") return;
      const activeRoundId = roundIdRef.current;
      if (activeRoundId && payload.roundId && payload.roundId !== activeRoundId) return;
      const me = nicknameRef.current.trim();
      const solvedNick = payload.nick || "";
      const isSelf = me && solvedNick === me;
      if (isSelf) {
        setFoundTargetThisRound(true);
        setSpecialSolvedOverlay({
          nick: solvedNick,
          word: "",
          kind: payload.kind || null,
        });
        triggerConfettiBurst("target");
        try {
          playGobbleVoice();
          triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
        } catch (_) {}
        return;
      }
      if (payload.kind === "target_long" || payload.kind === "target_score") {
        playSpecialFoundSound();
      }
    }

    function onTrophiesUpdated(payload) {
      const updates = Array.isArray(payload?.updates) ? payload.updates : [];
      if (!updates.length) return;
      const selfId = installId;
      if (!selfId) return;
      const entry = updates.find((u) => u?.installId === selfId);
      if (!entry) return;
      setTrophyStatus((prev) => ({
        ...(prev || {}),
        trophies: entry.newTrophies,
        league: entry.league,
        progress: entry.progress || prev?.progress,
        shieldCount: entry.shieldCount ?? prev?.shieldCount ?? 0,
        shieldFloor: entry.shieldFloor ?? prev?.shieldFloor ?? 0,
        updatedAt: entry.updatedAt || Date.now(),
        lastDelta: entry.delta,
        lastTournamentId: payload?.tournamentId || null,
      }));
      setTrophyHistory((prev) => {
        const next = [
          {
            ts: entry.updatedAt || Date.now(),
            delta: entry.delta,
            trophies: entry.newTrophies,
            league: entry.league,
            tournamentId: payload?.tournamentId || null,
          },
          ...(prev || []),
        ];
        return next.slice(0, 10);
      });
    }

    roundHandlersRef.current.onRoundStarted = onRoundStarted;
    roundHandlersRef.current.onRoundEnded = onRoundEnded;
    roundHandlersRef.current.onBreakStarted = onBreakStarted;

    socket.on("roundStarted", onRoundStarted);
    socket.on("roundEnding", onRoundEnding);
    socket.on("roundEnded", onRoundEnded);
    socket.on("breakStarted", onBreakStarted);
    socket.on("playersUpdate", onPlayersUpdate);
    socket.on("rankingUpdate", onRankingUpdate);
    socket.on("chat:history", onChatHistory);
    socket.on("chatMessage", onChatNew);
    socket.on("announcement", onAnnouncement);
    socket.on("announcements", onAnnouncements);
    socket.on("medalsUpdate", onMedalsUpdate);
    socket.on("specialHint", onSpecialHint);
    socket.on("specialSolved", onSpecialSolved);
    socket.on("trophiesUpdated", onTrophiesUpdated);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("roundStarted", onRoundStarted);
      socket.off("roundEnding", onRoundEnding);
      socket.off("roundEnded", onRoundEnded);
      socket.off("breakStarted", onBreakStarted);
      socket.off("playersUpdate", onPlayersUpdate);
      socket.off("rankingUpdate", onRankingUpdate);
      socket.off("chat:history", onChatHistory);
      socket.off("chatMessage", onChatNew);
      socket.off("announcement", onAnnouncement);
      socket.off("announcements", onAnnouncements);
      socket.off("medalsUpdate", onMedalsUpdate);
      socket.off("specialHint", onSpecialHint);
      socket.off("specialSolved", onSpecialSolved);
      socket.off("trophiesUpdated", onTrophiesUpdated);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
    };
  }, []);


  useEffect(() => {
    let id = null;

    // Guard: ensure only one timer interval at a time.
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }

    const finalizeRound = () => {
      playOutroThenResultsRef.current?.(null, { fallback: true });
    };

    const setIntervalSafe = (fn) => {
      id = setInterval(fn, 1000);
      tickIntervalRef.current = id;
    };

    if (phase === "countdown") {
      setTick(COUNTDOWN);
      setIntervalSafe(() => {
        setTick((t) => {
          if (t <= 1) {
            clearInterval(id);
            startGame();
            return 0;
          }
          return t - 1;
        });
      });
    } else if (phase === "playing") {
      const maxDuration =
        Number.isFinite(serverRoundDurationMs)
          ? Math.max(1, Math.round(serverRoundDurationMs / 1000))
          : ROOM_OPTIONS[currentRoomId || roomId]?.duration ?? DEFAULT_DURATION;

      // Guard: always derive remaining time from a fixed end timestamp.
      const endTimeMs = serverEndsAt ?? getNowServerMs() + maxDuration * 1000;
      const updateRemaining = () => {
        const now = getNowServerMs();
        const remaining = Math.min(
          maxDuration,
          Math.max(0, Math.round((endTimeMs - now) / 1000))
        );

        if (remaining <= 0) {
          clearInterval(id);
          finalizeRound();
          return 0;
        }

        return remaining;
      };

      setTick(updateRemaining());
      setIntervalSafe(() => {
        setTick(updateRemaining);
      });
    }

    return () => {
      if (id) clearInterval(id);
      if (tickIntervalRef.current === id) tickIntervalRef.current = null;
    };
  }, [phase, serverEndsAt, serverRoundDurationMs, currentRoomId, roomId]);

  useEffect(() => {
    if (phase !== "results") return;
    if (isDailyPlay) return;
    if (!dictionary) return;
    if (specialRound?.type === "target_long") return;
    if (specialRound?.type === "target_score") return;
    if (allWords.length > 0) return;

    scheduleAllWordsCompute(board, {
      updateBestRefs: true,
      jobKey: `results-${roundId || Date.now()}`,
      delayMs: 0,
    });
  }, [
    phase,
    board,
    dictionary,
    allWords.length,
    specialScoreConfig,
    specialRound,
    upcomingSpecial,
    showAllWords,
    roundId,
  ]);

  useEffect(() => {
    if (!isDailyPlay) return;
    if (phase !== "results") return;
    submitDailyScore();
  }, [isDailyPlay, phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (!LIVE_SOLVER_DURING_PLAY) return;
    if (specialRound?.type === "speed") return;
    if (specialRound?.type === "monstrous") return;
    if (specialRound?.type === "target_long") return;
    if (specialRound?.type === "target_score") return;
    if (!dictionary || dictionary.size === 0) return;
    if (!board || board.length === 0) return;
    if (accepted.length === 0) return;
    if (allWords.length) return;
    if (allWordsComputeRef.current.key) return;

    const onlineRound = Boolean(roundId);
    scheduleAllWordsCompute(board, {
      updateBestRefs: !onlineRound,
      jobKey: onlineRound ? `round-${roundId}` : `local-${Date.now()}`,
    });
  }, [phase, dictionary, board, roundId, specialRound, allWords.length, accepted.length]);

  // Attribue des médailles locales à la fin d'une manche
  // Médailles : gérées côté serveur (événement "medalsUpdate")

  function getNowServerMs() {
    return Date.now() + (serverTimeOffsetRef.current || 0);
  }

  function syncServerTime(next) {
    if (!socket?.connected) {
      next?.();
      return;
    }
    const t0 = Date.now();
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      next?.();
    }, 1200);
    socket.emit("timeSync", null, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const t1 = Date.now();
      if (res?.ok && typeof res.serverNow === "number") {
        const rtt = Math.max(0, t1 - t0);
        const offset = res.serverNow + rtt / 2 - t1;
        serverTimeOffsetRef.current = offset;
      }
      next?.();
    });
  }

  function loadSessionFromStorage() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.nick || !parsed?.roomId || !parsed?.installId) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function persistSession(session) {
    if (!session?.nick || !session?.roomId) return;
    const payload = {
      nick: String(session.nick || "").trim(),
      roomId: session.roomId,
      installId: session.installId || installId,
      lastLoginAt: Date.now(),
    };
    sessionRef.current = payload;
    setCanResumeSession(true);
    autoResumeEnabledRef.current = true;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function clearSavedSession() {
    sessionRef.current = null;
    setCanResumeSession(false);
    autoResumeEnabledRef.current = false;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {}
  }

  function hasSavedSession() {
    const s = sessionRef.current;
    return Boolean(s?.nick && s?.roomId && s?.installId);
  }

  function pingServer(reason = "ping") {
    if (!socket.connected) {
      return Promise.reject(new Error("disconnected"));
    }
    if (pingInFlightRef.current) return pingInFlightRef.current;
    const promise = new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("timeout"));
      }, 1500);
      const t0 = Date.now();
      socket.emit("timeSync", null, (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (res?.ok && typeof res.serverNow === "number") {
          const t1 = Date.now();
          const rtt = Math.max(0, t1 - t0);
          const offset = res.serverNow + rtt / 2 - t1;
          serverTimeOffsetRef.current = offset;
          resolve(res);
        } else {
          reject(new Error("bad_response"));
        }
      });
    }).finally(() => {
      pingInFlightRef.current = null;
    });
    pingInFlightRef.current = promise;
    return promise;
  }

  function formatWeeklyDate(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "";
    }
  }

  function formatWeeklyDayTime(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString("fr-FR", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "";
    }
  }

  function formatMsShort(ms) {
    if (!Number.isFinite(ms)) return "";
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(2)}s`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const whole = Math.floor(seconds);
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${mins}m${secs.toString().padStart(2, "0")}s`;
  }

  function formatSecondsShort(totalSeconds) {
    if (!Number.isFinite(totalSeconds)) return "";
    const rounded = Math.max(0, Math.round(totalSeconds));
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}m${secs.toString().padStart(2, "0")}s`;
  }

  function getWeeklyValue(boardKey, entry) {
    if (!entry) return null;
    switch (boardKey) {
      case "medals":
        return Number(entry.total) || 0;
      case "mostWordsInGame":
        return Number(entry.wordsCount) || 0;
      case "totalScore":
        return Number(entry.totalScore) || 0;
      case "bestWord":
        return Number(entry.pts) || 0;
      case "longestWord":
        return Number(entry.len) || 0;
      case "bestRoundScore":
        return Number(entry.pts) || 0;
      case "vocab":
        return Number(entry.vocabCount) || 0;
      case "bestTimeTargetLong":
      case "bestTimeTargetScore":
        return Number.isFinite(entry.ms) ? Number(entry.ms) : null;
      case "mostGobbles":
        return Number(entry.gobbles) || 0;
      default:
        return null;
    }
  }

  function dedupeWeeklyEntries(boardKey, entries, limit = 50) {
    if (!Array.isArray(entries)) return [];
    const byPlayer = new Map();
    for (const entry of entries) {
      const key =
        entry?.playerKey ||
        (entry?.nick ? String(entry.nick).trim().toLowerCase() : null);
      if (!key) continue;
      const current = byPlayer.get(key);
      const value = getWeeklyValue(boardKey, entry);
      if (
        (boardKey === "totalScore" || boardKey === "bestRoundScore") &&
        (!Number.isFinite(value) || value <= 0)
      ) {
        continue;
      }
      const timeBoard =
        boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
      const achieved = Number.isFinite(entry?.achievedAt) ? entry.achievedAt : Infinity;
      const pick = () => byPlayer.set(key, entry);
      if (!current) {
        pick();
        continue;
      }
      const currentValue = getWeeklyValue(boardKey, current);
      const currentAchieved = Number.isFinite(current?.achievedAt)
        ? current.achievedAt
        : Infinity;
      if (timeBoard) {
        if (value == null) continue;
        if (currentValue == null || value < currentValue) {
          pick();
        } else if (value === currentValue && achieved < currentAchieved) {
          pick();
        }
      } else {
        if (value == null) continue;
        if (currentValue == null || value > currentValue) {
          pick();
        } else if (value === currentValue && achieved < currentAchieved) {
          pick();
        }
      }
    }

    const deduped = Array.from(byPlayer.values());
    const timeBoard =
      boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
    deduped.sort((a, b) => {
      const va = getWeeklyValue(boardKey, a);
      const vb = getWeeklyValue(boardKey, b);
      if (timeBoard) {
        const vaOk = Number.isFinite(va);
        const vbOk = Number.isFinite(vb);
        if (vaOk && vbOk && va !== vb) return va - vb;
        if (vaOk !== vbOk) return vaOk ? -1 : 1;
      } else {
        const vaNum = Number.isFinite(va) ? va : -Infinity;
        const vbNum = Number.isFinite(vb) ? vb : -Infinity;
        if (vaNum !== vbNum) return vbNum - vaNum;
      }
      const ta = Number.isFinite(a?.achievedAt) ? a.achievedAt : Infinity;
      const tb = Number.isFinite(b?.achievedAt) ? b.achievedAt : Infinity;
      if (ta !== tb) return ta - tb;
      const na = (a?.nick || "").toLowerCase();
      const nb = (b?.nick || "").toLowerCase();
      return na.localeCompare(nb);
    });
    return deduped.slice(0, limit);
  }

  function getWeeklyVocabRankForCount(countValue) {
    const entries = weeklyStats?.boards?.vocab;
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const installKey = installId ? `install:${installId}` : null;
    const nickKey = selfNick ? `nick:${selfNick}` : null;
    const nickLower = selfNick ? String(selfNick).trim().toLowerCase() : null;
    if (!installKey && !nickKey && !nickLower) return null;
    let replaced = false;
    const now = Date.now();
    const withOverride = entries.map((entry) => {
      if (!entry) return entry;
      const entryNick = entry.nick ? String(entry.nick).trim().toLowerCase() : null;
      const matches =
        (installKey && entry.playerKey === installKey) ||
        (nickKey && entry.playerKey === nickKey) ||
        (nickLower && entryNick === nickLower);
      if (!matches) return entry;
      replaced = true;
      return { ...entry, vocabCount: countValue, achievedAt: now };
    });
    if (!replaced) {
      withOverride.push({
        nick: selfNick || "Toi",
        playerKey: installKey || nickKey,
        vocabCount: countValue,
        achievedAt: now,
      });
    }
    const weeklyLimit = weeklyStats?.topN || weeklyStats?.limits?.topN || 50;
    const ranked = dedupeWeeklyEntries("vocab", withOverride, Math.max(weeklyLimit, 200));
    const idx = ranked.findIndex((entry) => {
      if (!entry) return false;
      if (installKey && entry.playerKey === installKey) return true;
      if (nickKey && entry.playerKey === nickKey) return true;
      const entryNick = entry.nick ? String(entry.nick).trim().toLowerCase() : null;
      return !!(nickLower && entryNick && entryNick === nickLower);
    });
    return idx >= 0 ? idx + 1 : null;
  }

  function fetchWeeklyStats(force = false, topN = null) {
    const now = Date.now();
    const requestedTopN = Number.isFinite(topN)
      ? Math.min(200, Math.max(1, Math.round(topN)))
      : null;
    if (!force && weeklyStatsLoading) return;
    if (
      !force &&
      weeklyFetchRef.current.last &&
      now - weeklyFetchRef.current.last < 4000 &&
      weeklyFetchRef.current.lastTopN === requestedTopN
    ) {
      return;
    }
    weeklyFetchRef.current.last = now;
    weeklyFetchRef.current.lastTopN = requestedTopN;
    setWeeklyStatsLoading(true);
    setWeeklyStatsError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const query = requestedTopN ? `?topN=${requestedTopN}` : "";
    fetch(`/api/stats/weekly${query}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(`http_${res.status || "error"}`);
        try {
          return text ? JSON.parse(text) : null;
        } catch (_) {
          throw new Error("bad_json");
        }
      })
      .then((data) => {
        setWeeklyStats(data || null);
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          setWeeklyStatsError("timeout");
        } else if (err.message === "bad_json") {
          setWeeklyStatsError("format");
        } else {
          setWeeklyStatsError("erreur");
        }
      })
      .finally(() => {
        clearTimeout(timer);
        setWeeklyStatsLoading(false);
      });
  }

  function fetchDailyStatus() {
    setDailyStatus((prev) => ({ ...prev, loading: true, error: "" }));
    const query = installId ? `?installId=${encodeURIComponent(installId)}` : "";
    fetch(`/api/daily/status${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
          throw new Error(data?.error || `http_${res.status || "error"}`);
        }
        return data;
      })
      .then((data) => {
        setDailyStatus({
          loading: false,
          ready: !!data?.ready,
          hasPlayed: !!data?.hasPlayed,
          dateId: data?.dateId || null,
          myResult: data?.myResult || null,
          champion: data?.champion || null,
          error: "",
        });
      })
      .catch(() => {
        setDailyStatus((prev) => ({
          ...prev,
          loading: false,
          error: "erreur",
        }));
      });
  }

  function fetchDailyHistory(days = 10) {
    if (dailyHistoryLoading) return;
    setDailyHistoryLoading(true);
    setDailyHistoryError("");
    fetch(`/api/daily/history?days=${encodeURIComponent(days)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
          throw new Error(data?.error || `http_${res.status || "error"}`);
        }
        return data;
      })
      .then((data) => {
        const safeDays = Array.isArray(data?.days) ? data.days : [];
        const rawCrowns = Array.isArray(data?.crownTotals)
          ? data.crownTotals
          : Array.isArray(data?.medalTotals)
          ? data.medalTotals
          : [];
        const safeCrowns = rawCrowns.map((entry) => ({
          nick: entry?.nick || "Joueur",
          crowns: Number.isFinite(entry?.crowns)
            ? entry.crowns
            : Number.isFinite(entry?.gold)
            ? entry.gold
            : 0,
        }));
        setDailyHistory({ days: safeDays, crownTotals: safeCrowns });
      })
      .catch(() => {
        setDailyHistory({ days: [], crownTotals: [] });
        setDailyHistoryError("erreur");
      })
      .finally(() => {
        setDailyHistoryLoading(false);
      });
  }

  function fetchDailyBoard(dateId = null) {
    setDailyBoard((prev) => ({ ...prev, loading: true, error: "" }));
    const query = dateId ? `?dateId=${encodeURIComponent(dateId)}` : "";
    fetch(`/api/daily/board${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok && !data?.ready) {
          throw new Error(data?.error || `http_${res.status || "error"}`);
        }
        return data;
      })
      .then((data) => {
        setDailyBoard({
          loading: false,
          ready: !!data?.ready,
          dateId: data?.dateId || null,
          entries: Array.isArray(data?.entries) ? data.entries : [],
          error: "",
        });
      })
      .catch(() => {
        setDailyBoard((prev) => ({
          ...prev,
          loading: false,
          error: "erreur",
        }));
      });
  }

  function openDailyHome() {
    setDailyStartError("");
    setDailySubmitError("");
    setDailyResult(null);
    setAppView("daily");
    fetchDailyStatus();
    fetchDailyBoard();
    fetchDailyHistory(10);
  }

  async function startDailyGame(e) {
    requestAudioUnlock(e);
    const pseudo = String(nickname || "").trim();
    if (!pseudo) {
      setDailyStartError("Pseudo requis");
      return;
    }
    setDailyStartError(null);
    setDailySubmitError("");
    const payload = { installId, pseudo };
    try {
      const res = await fetch("/api/daily/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error === "already_played") {
          setDailyStartError("Deja joue");
          fetchDailyStatus();
          fetchDailyBoard();
          return;
        }
        const code = `E${res.status || 0}`;
        setDailyStartError(code);
        console.warn("[daily/start] http", {
          status: res.status,
          error: data?.error || null,
          hasInstallId: !!installId,
          pseudoLen: pseudo.length,
          installIdLen: typeof installId === "string" ? installId.length : 0,
        });
        fetchDailyStatus();
        fetchDailyBoard();
        return;
      }
      if (!data?.grid || !Array.isArray(data.grid)) {
        throw new Error("bad_grid");
      }
      dailySessionRef.current = {
        dateId: data.dateId || null,
        startedAt: Date.now(),
      };
      setDailyResult(null);
      setAppView("daily_play");
      startGameFromServerRef.current?.(
        data.grid,
        null,
        data.durationMs || null,
        null,
        null,
        data.gridSize || null,
        null,
        data.gridQuality || null,
        null
      );
      fetchDailyBoard(data.dateId || null);
    } catch (err) {
      setDailyStartError("ENET");
      console.warn("[daily/start] network", err);
      fetchDailyStatus();
      fetchDailyBoard();
    }
  }

  function submitDailyScore() {
    if (dailySubmitRef.current.inFlight) return;
    dailySubmitRef.current.inFlight = true;
    setDailySubmitError("");
    const session = dailySessionRef.current;
    const dateId = session?.dateId || dailyStatus?.dateId || null;
    const durationMs = session?.startedAt ? Date.now() - session.startedAt : null;
    const payload = {
      dateId,
      installId,
      pseudo: String(nickname || "").trim() || "Joueur",
      foundWords: acceptedRef.current || accepted,
      clientScore: score,
      durationMs,
    };
    fetch("/api/daily/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
          const error = data?.error || "erreur";
          throw new Error(error);
        }
        return data;
      })
      .then((data) => {
        setDailyResult({
          dateId: data?.dateId || dateId,
          score: Number.isFinite(data?.score) ? data.score : score,
          rank: Number.isFinite(data?.rank) ? data.rank : null,
          totalPlayers: Number.isFinite(data?.totalPlayers) ? data.totalPlayers : null,
        });
        if (Array.isArray(data?.board)) {
          setDailyBoard((prev) => ({
            ...prev,
            entries: data.board,
            ready: true,
            dateId: data.dateId || prev.dateId,
            error: "",
          }));
        }
        setDailyStatus((prev) => ({
          ...prev,
          hasPlayed: true,
          myResult: {
            score: Number.isFinite(data?.score) ? data.score : score,
            rank: Number.isFinite(data?.rank) ? data.rank : null,
            submittedAt: Date.now(),
          },
        }));
        setAppView("daily_results");
      })
      .catch((err) => {
        const msg = err?.message === "already_played" ? "Deja joue" : "Erreur";
        setDailySubmitError(msg);
        fetchDailyStatus();
        fetchDailyBoard();
      })
      .finally(() => {
        dailySubmitRef.current.inFlight = false;
      });
  }

  function requestVocabCount() {
    const emitRequest = (resolve) => {
      socket.emit("getVocabCount", { installId }, (res) => {
        const count = Number.isFinite(res?.count) ? res.count : null;
        if (Number.isFinite(count)) {
          setVocabCount(count);
          setVocabUpdatedAt(Date.now());
        }
        setVocabLoading(false);
        resolve(count);
      });
    };

    setVocabLoading(true);
    if (!socket.connected) {
      return new Promise((resolve) => {
        const onConnect = () => {
          cleanup();
          emitRequest(resolve);
        };
        const onError = () => {
          cleanup();
          setVocabLoading(false);
          resolve(null);
        };
        const cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("connect_error", onError);
        };
        socket.once("connect", onConnect);
        socket.once("connect_error", onError);
        socket.connect();
      });
    }

    return new Promise((resolve) => {
      emitRequest(resolve);
    });
  }

  function fetchVocabStats() {
    if (!installId) return;
    const now = Date.now();
    if (now - lastVocabFetchAtRef.current < 2000) return;
    lastVocabFetchAtRef.current = now;
    void requestVocabCount();
  }

  function requestTrophyStatus() {
    const emitRequest = (resolve) => {
      socket.emit("getTrophyStatus", { installId }, (res) => {
        const status = res?.status || null;
        if (status && typeof status === "object") {
          setTrophyStatus(status);
          if (Array.isArray(status.history)) {
            setTrophyHistory(status.history.slice(0, 10));
          }
        }
        setTrophyLoading(false);
        resolve(status);
      });
    };

    setTrophyLoading(true);
    if (!socket.connected) {
      return new Promise((resolve) => {
        const onConnect = () => {
          cleanup();
          emitRequest(resolve);
        };
        const onError = () => {
          cleanup();
          setTrophyLoading(false);
          resolve(null);
        };
        const cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("connect_error", onError);
        };
        socket.once("connect", onConnect);
        socket.once("connect_error", onError);
        socket.connect();
      });
    }

    return new Promise((resolve) => {
      emitRequest(resolve);
    });
  }

  function openWeeklyStatsOverlay() {
    setWeeklyActiveIndex((idx) => (idx >= 0 && idx < WEEKLY_BOARDS.length ? idx : 0));
    setIsWeeklyOpen(true);
    setStatsTab("weekly");
    fetchWeeklyStats(true);
    void requestVocabCount();
    void requestTrophyStatus();
  }

  function closeWeeklyStatsOverlay() {
    setIsWeeklyOpen(false);
  }

  useEffect(() => {
    if (phase !== "results") return;
    const playersCount = Array.isArray(players) ? players.length : 0;
    const desiredTopN = Math.min(200, Math.max(50, playersCount));
    const currentTopN = Number.isFinite(weeklyStats?.topN) ? weeklyStats.topN : 0;
    if (!weeklyStats || currentTopN < desiredTopN) {
      fetchWeeklyStats(true, desiredTopN);
      return;
    }
    fetchWeeklyStats();
  }, [phase, players.length, weeklyStats?.topN, !!weeklyStats]);

  function buildPlayersSnapshot(list) {
    const safe = Array.isArray(list) ? list : [];
    const seen = new Set();
    const snapshot = [];
    safe.forEach((entry, idx) => {
      const nick = entry?.nick ? String(entry.nick) : "";
      if (!nick || seen.has(nick)) return;
      seen.add(nick);
      snapshot.push({
        nick,
        rank: Number.isFinite(entry?.rank) ? entry.rank : idx + 1,
        score: typeof entry?.score === "number" ? entry.score : null,
      });
    });
    snapshot.sort((a, b) => {
      const ra = Number.isFinite(a.rank) ? a.rank : Infinity;
      const rb = Number.isFinite(b.rank) ? b.rank : Infinity;
      return ra - rb;
    });
    return snapshot;
  }

  function openPlayersOverlaySnapshot(list) {
    setPlayersOverlaySnapshot(buildPlayersSnapshot(list));
    setPlayersOverlayMode("snapshot");
    setIsPlayersOverlayOpen(true);
  }

  function fetchLobbyPlayers() {
    const lobbyRoomId = roomId || getDefaultRoomId();
    setLobbyPlayersLoading(true);
    fetch(`/api/players?roomId=${encodeURIComponent(lobbyRoomId)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.players) ? data.players : [];
        setLobbyPlayersList(list);
        setLobbyRoomStatus(data?.status && typeof data.status === "object" ? data.status : null);
      })
      .catch(() => {
        setLobbyPlayersList([]);
        setLobbyRoomStatus(null);
      })
      .finally(() => {
        setLobbyPlayersLoading(false);
      });
  }

  function openPlayersOverlayAlpha() {
    setPlayersOverlaySnapshot([]);
    setPlayersOverlayMode("alpha");
    setIsPlayersOverlayOpen(true);
    if (!isLoggedIn) {
      fetchLobbyPlayers();
    }
  }

  function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }

  function closePlayersOverlay() {
    setIsPlayersOverlayOpen(false);
  }

  function shiftWeeklyBoard(delta) {
    const total = WEEKLY_BOARDS.length;
    if (!Number.isInteger(delta) || total <= 1) return;
    setWeeklyActiveIndex((prev) => {
      const next = (prev + delta + total) % total;
      return next;
    });
    playSwipeSound();
  }

  function shouldIgnoreSwipeClick(ref, delayMs = 450) {
    const last = ref?.current || 0;
    return Date.now() - last < delayMs;
  }

  function getSeasonPages() {
    return ["vocab_rank", "vocab_personal"];
  }

  function shiftSeasonPage(delta) {
    const pages = getSeasonPages();
    const total = pages.length;
    if (!Number.isInteger(delta) || total <= 1) return;
    setSeasonActiveIndex((prev) => {
      const next = (prev + delta + total) % total;
      return next;
    });
    playSwipeSound();
  }

  function goToSeasonPage(nextIndex) {
    const pages = getSeasonPages();
    const total = pages.length;
    if (total <= 1) return;
    const next = clampValue(nextIndex, 0, total - 1);
    setSeasonActiveIndex(next);
    setSeasonDragOffset(0);
    setSeasonDragging(false);
  }

  function triggerWeeklyArrowHint({ blink = false, showForMs = 1600 } = {}) {
    if (weeklyArrowTimerRef.current) {
      clearTimeout(weeklyArrowTimerRef.current);
      weeklyArrowTimerRef.current = null;
    }
    if (weeklyArrowBlinkTimerRef.current) {
      clearTimeout(weeklyArrowBlinkTimerRef.current);
      weeklyArrowBlinkTimerRef.current = null;
    }
    if (weeklyArrowBumpTimerRef.current) {
      clearTimeout(weeklyArrowBumpTimerRef.current);
      weeklyArrowBumpTimerRef.current = null;
    }
    if (isMobileLayout) {
      setWeeklyArrowVisible(true);
    }
    setWeeklyArrowBump(false);
    setTimeout(() => setWeeklyArrowBump(true), 20);
    weeklyArrowBumpTimerRef.current = setTimeout(() => {
      setWeeklyArrowBump(false);
    }, 520);
    if (blink) {
      setWeeklyArrowBlink(true);
      weeklyArrowBlinkTimerRef.current = setTimeout(() => {
        setWeeklyArrowBlink(false);
      }, 1800);
    }
    if (isMobileLayout) {
      weeklyArrowTimerRef.current = setTimeout(() => {
        setWeeklyArrowVisible(false);
        setWeeklyArrowBlink(false);
        setWeeklyArrowBump(false);
      }, showForMs);
    }
  }

  function handleWeeklyTouchStart(e) {
    if (statsTab !== "weekly") return;
    const touch = e?.touches?.[0];
    const x = touch?.clientX ?? null;
    const y = touch?.clientY ?? null;
    weeklyTouchRef.current.startX = x;
    weeklyTouchRef.current.startY = y;
    weeklySlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    triggerWeeklyArrowHint();
    setWeeklyDragOffset(0);
    setWeeklyDragging(false);
  }

  function handleWeeklyTouchMove(e) {
    if (statsTab !== "weekly") return;
    const startX = weeklyTouchRef.current.startX;
    const startY = weeklyTouchRef.current.startY;
    if (startX == null || startY == null) return;
    const touch = e?.touches?.[0];
    const currentX = touch?.clientX ?? null;
    const currentY = touch?.clientY ?? null;
    if (currentX == null || currentY == null) return;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    if (!weeklyDragging) {
      if (Math.abs(deltaX) < 6) return;
      if (Math.abs(deltaX) < Math.abs(deltaY)) {
        weeklyTouchRef.current.startX = null;
        weeklyTouchRef.current.startY = null;
        setWeeklyDragging(false);
        setWeeklyDragOffset(0);
        return;
      }
      setWeeklyDragging(true);
      triggerWeeklyArrowHint();
    }
    if (e?.cancelable) e.preventDefault();
    const width = weeklySlideWidthRef.current || window.innerWidth || 1;
    const clamped = clampValue(deltaX, -width * 0.35, width * 0.35);
    setWeeklyDragOffset(clamped);
  }

  function handleWeeklyTouchEnd(e) {
    if (statsTab !== "weekly") return;
    const startX = weeklyTouchRef.current.startX;
    const startY = weeklyTouchRef.current.startY;
    weeklyTouchRef.current.startX = null;
    weeklyTouchRef.current.startY = null;
    const width = weeklySlideWidthRef.current || window.innerWidth || 1;
    const touch = e?.changedTouches?.[0];
    setWeeklyDragging(false);
    if (startX == null || startY == null || !touch) {
      setWeeklyDragOffset(0);
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const threshold = Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.1);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      weeklySwipeBlockRef.current = Date.now();
      shiftWeeklyBoard(deltaX < 0 ? 1 : -1);
    }
    setWeeklyDragOffset(0);
  }

  function handleSeasonTouchStart(e) {
    if (statsTab !== "season") return;
    const touch = e?.touches?.[0];
    const x = touch?.clientX ?? null;
    const y = touch?.clientY ?? null;
    seasonTouchRef.current.startX = x;
    seasonTouchRef.current.startY = y;
    seasonSlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    setSeasonDragOffset(0);
    setSeasonDragging(false);
  }

  function handleSeasonTouchMove(e) {
    if (statsTab !== "season") return;
    const startX = seasonTouchRef.current.startX;
    const startY = seasonTouchRef.current.startY;
    if (startX == null || startY == null) return;
    const touch = e?.touches?.[0];
    const currentX = touch?.clientX ?? null;
    const currentY = touch?.clientY ?? null;
    if (currentX == null || currentY == null) return;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    if (!seasonDragging) {
      if (Math.abs(deltaX) < 6) return;
      if (Math.abs(deltaX) < Math.abs(deltaY)) {
        seasonTouchRef.current.startX = null;
        seasonTouchRef.current.startY = null;
        setSeasonDragging(false);
        setSeasonDragOffset(0);
        return;
      }
      setSeasonDragging(true);
    }
    if (e?.cancelable) e.preventDefault();
    const width = seasonSlideWidthRef.current || window.innerWidth || 1;
    const clamped = clampValue(deltaX, -width * 0.35, width * 0.35);
    setSeasonDragOffset(clamped);
  }

  function handleSeasonTouchEnd(e) {
    if (statsTab !== "season") return;
    const startX = seasonTouchRef.current.startX;
    const startY = seasonTouchRef.current.startY;
    seasonTouchRef.current.startX = null;
    seasonTouchRef.current.startY = null;
    const width = seasonSlideWidthRef.current || window.innerWidth || 1;
    const touch = e?.changedTouches?.[0];
    setSeasonDragging(false);
    if (startX == null || startY == null || !touch) {
      setSeasonDragOffset(0);
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const threshold = Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.1);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      seasonSwipeBlockRef.current = Date.now();
      shiftSeasonPage(deltaX < 0 ? 1 : -1);
    }
    setSeasonDragOffset(0);
  }

  function handleStatsTouchStart(e) {
    if (statsTab === "weekly") return handleWeeklyTouchStart(e);
    if (statsTab === "season") return handleSeasonTouchStart(e);
  }

  function handleStatsTouchMove(e) {
    if (statsTab === "weekly") return handleWeeklyTouchMove(e);
    if (statsTab === "season") return handleSeasonTouchMove(e);
  }

  function handleStatsTouchEnd(e) {
    if (statsTab === "weekly") return handleWeeklyTouchEnd(e);
    if (statsTab === "season") return handleSeasonTouchEnd(e);
  }

  function getResultsPages() {
    return isTargetRound
      ? ["round", "total", "vocab"]
      : ["round", "total", "found", "all", "vocab"];
  }

  function setResultsPageInstant(nextPage) {
    clearResultsSlideTimers();
    setResultsSlidePhase("idle");
    resultsDraggingRef.current = false;
    setMobileResultsPage(nextPage);
  }

  function clearResultsSlideTimers() {
    if (resultsSlideOutTimerRef.current) {
      clearTimeout(resultsSlideOutTimerRef.current);
      resultsSlideOutTimerRef.current = null;
    }
    if (resultsSlideInTimerRef.current) {
      clearTimeout(resultsSlideInTimerRef.current);
      resultsSlideInTimerRef.current = null;
    }
  }

  function startResultsSlide(nextPage) {
    clearResultsSlideTimers();
    setResultsSlidePhase("out");
    resultsDraggingRef.current = false;
    resultsSlideOutTimerRef.current = setTimeout(() => {
      setMobileResultsPage(nextPage);
      setResultsSlidePhase("in");
      resultsSlideInTimerRef.current = setTimeout(() => {
        setResultsSlidePhase("idle");
      }, RESULTS_SLIDE_IN_MS);
    }, RESULTS_SLIDE_OUT_MS);
  }

  function goToResultsPage(nextIndex) {
    const pages = getResultsPages();
    const totalPages = pages.length;
    if (totalPages <= 1) return;
    const current = clampValue(mobileResultsPage, 0, totalPages - 1);
    const next = clampValue(nextIndex, 0, totalPages - 1);
    if (next === current) return;
    const currentKey = pages[current];
    const nextKey = pages[next];
    const isWordsJump =
      (currentKey === "found" || currentKey === "all") &&
      (nextKey === "found" || nextKey === "all");
    const isRankingJump =
      (currentKey === "round" || currentKey === "total") &&
      (nextKey === "round" || nextKey === "total");
    if (isWordsJump) {
      setResultsPageInstant(next);
    } else if (isRankingJump) {
      triggerResultsMetaPulse({ immediate: true });
      setResultsPageInstant(next);
    } else {
      startResultsSlide(next);
    }
    playSwipeSound();
  }

  function shiftResultsPage(delta) {
    if (!Number.isInteger(delta)) return;
    goToResultsPage(mobileResultsPage + delta);
  }

  function triggerResultsMetaPulse({ immediate = false } = {}) {
    if (resultsMetaPulseStartTimerRef.current) {
      clearTimeout(resultsMetaPulseStartTimerRef.current);
      resultsMetaPulseStartTimerRef.current = null;
    }
    if (resultsMetaPulseEndTimerRef.current) {
      clearTimeout(resultsMetaPulseEndTimerRef.current);
      resultsMetaPulseEndTimerRef.current = null;
    }
    if (immediate) {
      setResultsMetaPulse(true);
    } else {
      setResultsMetaPulse(false);
      resultsMetaPulseStartTimerRef.current = setTimeout(() => {
        setResultsMetaPulse(true);
      }, 20);
    }
    resultsMetaPulseEndTimerRef.current = setTimeout(() => {
      setResultsMetaPulse(false);
    }, 520);
  }

  function handleResultsTouchStart(e) {
    const touch = e?.touches?.[0];
    if (!touch) return;
    clearResultsSlideTimers();
    setResultsSlidePhase("idle");
    resultsTouchRef.current.startX = touch.clientX;
    resultsTouchRef.current.startY = touch.clientY;
    resultsSlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    resultsDraggingRef.current = false;
  }

  function handleResultsTouchMove(e) {
    const startX = resultsTouchRef.current.startX;
    const startY = resultsTouchRef.current.startY;
    if (startX == null || startY == null) return;
    const touch = e?.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!resultsDraggingRef.current) {
      if (Math.abs(deltaX) < 8) return;
      if (Math.abs(deltaX) < Math.abs(deltaY)) {
        resultsTouchRef.current.startX = null;
        resultsTouchRef.current.startY = null;
        resultsDraggingRef.current = false;
        return;
      }
      resultsDraggingRef.current = true;
    }
  }

  function handleResultsTouchEnd(e) {
    const startX = resultsTouchRef.current.startX;
    const startY = resultsTouchRef.current.startY;
    resultsTouchRef.current.startX = null;
    resultsTouchRef.current.startY = null;
    const width = resultsSlideWidthRef.current || window.innerWidth || 1;
    const touch = e?.changedTouches?.[0];
    resultsDraggingRef.current = false;
    if (startX == null || startY == null || !touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const threshold = Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.12);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      shiftResultsPage(deltaX < 0 ? 1 : -1);
    }
  }

  function getFinalePagesCount() {
    return 1 + FINALE_WEEKLY_BOARDS.length;
  }

  function goToFinalePage(nextIndex) {
    const total = getFinalePagesCount();
    if (total <= 1) return;
    const current = clampValue(finalePage, 0, total - 1);
    const next = clampValue(nextIndex, 0, total - 1);
    if (next === current) return;
    setFinalePage(next);
    playSwipeSound();
  }

  function shiftFinalePage(delta) {
    if (!Number.isInteger(delta)) return;
    goToFinalePage(finalePage + delta);
  }

  function handleFinaleTouchStart(e) {
    const touch = e?.touches?.[0];
    if (!touch) return;
    finaleTouchRef.current.startX = touch.clientX;
    finaleTouchRef.current.startY = touch.clientY;
    finaleSlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    finaleDraggingRef.current = false;
  }

  function handleFinaleTouchMove(e) {
    const startX = finaleTouchRef.current.startX;
    const startY = finaleTouchRef.current.startY;
    if (startX == null || startY == null) return;
    const touch = e?.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!finaleDraggingRef.current) {
      if (Math.abs(deltaX) < 8) return;
      if (Math.abs(deltaX) < Math.abs(deltaY)) {
        finaleTouchRef.current.startX = null;
        finaleTouchRef.current.startY = null;
        finaleDraggingRef.current = false;
        return;
      }
      finaleDraggingRef.current = true;
    }
  }

  function handleFinaleTouchEnd(e) {
    const startX = finaleTouchRef.current.startX;
    const startY = finaleTouchRef.current.startY;
    finaleTouchRef.current.startX = null;
    finaleTouchRef.current.startY = null;
    const width = finaleSlideWidthRef.current || window.innerWidth || 1;
    const touch = e?.changedTouches?.[0];
    finaleDraggingRef.current = false;
    if (startX == null || startY == null || !touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const threshold = Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.12);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      shiftFinalePage(deltaX < 0 ? 1 : -1);
    }
  }

  function applyResumeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    if (snapshot.roomId) {
      setCurrentRoomId(snapshot.roomId);
      setRoomId(snapshot.roomId);
    }
    const phase = snapshot.phase || "lobby";
    const currentRound = snapshot.currentRound || null;
    const breakState = snapshot.breakState || null;
    const lastRound = snapshot.lastRoundResults || null;
    const playerState = snapshot.player || null;

    if (phase === "playing" && currentRound?.grid && Array.isArray(currentRound.grid)) {
      roundHandlersRef.current.onRoundStarted?.(currentRound);
      if (Array.isArray(snapshot.ranking)) {
        setProvisionalRanking(snapshot.ranking);
      }
      const words = Array.isArray(playerState?.words)
        ? Array.from(new Set(playerState.words.map((w) => normalizeWord(w)).filter(Boolean)))
        : [];
      setAccepted(words);
      acceptedRef.current = words;
      const scores = new Map();
      const scoreConfig =
        currentRound.special?.type === "bonus_letter" && currentRound.special?.bonusLetter
          ? {
              bonusLetter: currentRound.special.bonusLetter,
              bonusLetterScore: currentRound.special.bonusLetterScore ?? 20,
              disableBonuses: true,
            }
          : null;
      if (currentRound.grid && words.length) {
        words.forEach((word) => {
          const path = findBestPathForWord(currentRound.grid, word, scoreConfig);
          if (path) {
            scores.set(word, computeScore(word, path, currentRound.grid, scoreConfig));
          }
        });
      }
      acceptedScoresRef.current = scores;
      setScore(Number(playerState?.score) || 0);
      submissionStatusRef.current.clear();
      resetSubmissionQueue();
      return;
    }

    if (lastRound?.payload) {
      roundHandlersRef.current.onRoundEnded?.(lastRound.payload);
      if (lastRound.round?.grid && Array.isArray(lastRound.round.grid)) {
        setBoard(lastRound.round.grid);
        setGridSize(lastRound.round.gridSize || getGridSizeForRoom(snapshot.roomId));
        setSpecialRound(
          lastRound.round.special && lastRound.round.special.isSpecial ? lastRound.round.special : null
        );
        if (lastRound.round.gridQuality) {
          const stats = {
            words: lastRound.round.gridQuality.words ?? null,
            totalPts:
              lastRound.round.gridQuality.possibleScore ??
              lastRound.round.gridQuality.totalPts ??
              lastRound.round.gridQuality.maxPts ??
              null,
            maxPts: lastRound.round.gridQuality.maxPts ?? null,
            maxLen: lastRound.round.gridQuality.maxLen ?? null,
            longWords: lastRound.round.gridQuality.longWords ?? null,
          };
          setRoundStats(stats);
          bestGridMaxRef.current = stats?.maxPts ?? 0;
          bestGridMaxLenRef.current = stats?.maxLen ?? 0;
        }
      }
      if (breakState) {
        roundHandlersRef.current.onBreakStarted?.(breakState);
      }
      const words = Array.isArray(playerState?.words)
        ? Array.from(new Set(playerState.words.map((w) => normalizeWord(w)).filter(Boolean)))
        : [];
      setAccepted(words);
      acceptedRef.current = words;
      if (lastRound.round?.grid && Array.isArray(lastRound.round.grid) && words.length) {
        const scoreConfig =
          lastRound.round.special?.type === "bonus_letter" && lastRound.round.special?.bonusLetter
            ? {
                bonusLetter: lastRound.round.special.bonusLetter,
                bonusLetterScore: lastRound.round.special.bonusLetterScore ?? 20,
                disableBonuses: true,
              }
            : null;
        const scores = new Map();
        words.forEach((word) => {
          const path = findBestPathForWord(lastRound.round.grid, word, scoreConfig);
          if (path) {
            scores.set(word, computeScore(word, path, lastRound.round.grid, scoreConfig));
          }
        });
        acceptedScoresRef.current = scores;
      } else {
        acceptedScoresRef.current = new Map();
      }
      setScore(Number(playerState?.score) || 0);
      submissionStatusRef.current.clear();
      resetSubmissionQueue();
      return;
    }

    if (breakState) {
      roundHandlersRef.current.onBreakStarted?.(breakState);
    }
  }

  function requestSessionResumeSnapshot(reason = "probe") {
    if (!hasSavedSession()) return;
    const session = sessionRef.current;
    const nick = session?.nick?.trim();
    const roomToUse = session?.roomId || roomId;
    const install = session?.installId || installId;
    if (!nick || !roomToUse || !install) return;
    const now = Date.now();
    if (resumeProbeRef.current.inFlight && now - resumeProbeRef.current.lastAt < 2500) return;
    resumeProbeRef.current.inFlight = true;
    resumeProbeRef.current.lastAt = now;
    setResumePending(true);

    const finish = () => {
      resumeProbeRef.current.inFlight = false;
      setResumePending(false);
    };
    const doProbe = () => {
      socket.emit(
        "session:resume",
        { roomId: roomToUse, installId: install, nick, takeover: false },
        (res) => {
          finish();
          if (res?.ok && res?.available && res?.snapshot) {
            setResumeSnapshot(res.snapshot);
            setCanResumeSession(true);
          } else {
            setResumeSnapshot(null);
          }
        }
      );
    };

    if (socket.connected) {
      doProbe();
      return;
    }
    const onError = () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      finish();
    };
    const onConnect = () => {
      socket.off("connect_error", onError);
      doProbe();
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
    socket.connect();
  }

  function resumeLoginFromSession(reason = "resume") {
    if (!hasSavedSession()) return;
    const session = sessionRef.current;
    const nick = session?.nick?.trim();
    const roomToUse = session?.roomId || roomId;
    const install = session?.installId || installId;
    if (!nick || !roomToUse || !install) return;
    const force = reason === "resume_button";
    const now = Date.now();
    if (resumeLockRef.current) {
      const elapsed = now - (resumeLockAtRef.current || 0);
      if (!force && elapsed < 6000) return;
      resumeLockRef.current = false;
      resumeLockAtRef.current = 0;
    }
    resumeLockRef.current = true;
    resumeLockAtRef.current = now;
    setLoginError("");
    setConnectionError("Reconnexion...");
    setIsConnecting(true);

    let settled = false;
    const cleanup = () => {
      socket.off("connect", doResume);
      socket.off("connect_error", onResumeError);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      resumeLockRef.current = false;
      resumeLockAtRef.current = 0;
      cleanup();
      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = null;
      }
    };
    const onResumeError = () => {
      setConnectionError("Connexion au serveur impossible");
      setIsConnecting(false);
      finish();
    };
    let resumeTimeout = setTimeout(() => {
      setConnectionError("Connexion au serveur impossible");
      setIsConnecting(false);
      finish();
    }, 8000);

    const doResume = () => {
      socket.emit(
        "session:resume",
        { roomId: roomToUse, installId: install, nick, takeover: true },
        (res) => {
          finish();
          if (!res?.ok || !res?.available || !res?.snapshot) {
            setConnectionError("Session expiree");
            setIsConnecting(false);
            setIsLoggedIn(false);
            return;
          }
          persistSession({ nick, roomId: roomToUse, installId: install });
          lastLoginPayloadRef.current = { nick, roomId: roomToUse };
          setIsLoggedIn(true);
          setIsConnecting(false);
          setLoginError("");
          setConnectionError("");
          setResumeSnapshot(null);
          applyResumeSnapshot(res.snapshot);
          void requestTrophyStatus();
        }
      );
    };

    if (socket.connected) {
      doResume();
    } else {
      socket.once("connect", doResume);
      socket.once("connect_error", onResumeError);
      socket.connect();
    }
  }

  function setResultsRankingModeWithPulse(nextMode) {
    if (resultsRankingMode === nextMode) return;
    triggerResultsMetaPulse({ immediate: true });
    setResultsRankingMode(nextMode);
  }

  function runHealthCheck(reason = "watchdog") {
    if (!socket.connected) return;
    pingServer(reason)
      .then(() => {
        console.debug(`[watchdog] pong (${reason})`);
      })
      .catch(() => {
        console.warn(`[watchdog] reconnect (${reason})`);
        intentionalDisconnectRef.current = true;
        socket.disconnect();
        if (isLoggedInRef.current && !isDailyView) {
          resumeLoginFromSession("watchdog");
        } else {
          requestSessionResumeSnapshot("watchdog");
        }
      });
  }

  useEffect(() => {
    const stored = loadSessionFromStorage();
    if (stored?.nick && stored?.roomId) {
      sessionRef.current = stored;
      if (!nickname) {
        setNickname(stored.nick);
      }
      setCanResumeSession(true);
      autoResumeEnabledRef.current = true;
      requestSessionResumeSnapshot("boot");
    }
    const onConnect = () => {
      if (!hasSavedSession()) return;
      if (isLoggedInRef.current) return;
      requestSessionResumeSnapshot("socket_connect");
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, []);

  useEffect(() => {
    const onConnect = () => {
      if (isDailyView) return;
      if (!hasSavedSession()) return;
      if (isLoggedInRef.current) return;
      if (resumeLockRef.current) return;
      resumeLoginFromSession("connect");
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [isDailyView]);

  useEffect(() => {
    const onConnect = () => {
      const queue = pendingQueueRef.current;
      const queued = new Set(queue);
      submissionStatusRef.current.forEach((meta, word) => {
        if (meta?.status !== "pending") return;
        if (queued.has(word)) return;
        queued.add(word);
        queue.push(word);
      });
      if (queue.length) {
        scheduleBatchFlush({ immediate: true });
      }
    };
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, []);

  useEffect(() => {
    fetchWeeklyStats(true);
    const onConnect = () => fetchWeeklyStats(true);
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
  }, []);

  useEffect(() => {
    weeklyStatsSnapshotRef.current = weeklyStats;
    if (tournamentBaselineRef.current.id && !tournamentBaselineRef.current.weeklyStats) {
      tournamentBaselineRef.current.weeklyStats = weeklyStats;
    }
  }, [weeklyStats]);

  useEffect(() => {
    if (isDailyView) return;
    if (!installId) return;
    fetchVocabStats();
  }, [installId, isDailyView]);

  useEffect(() => {
    if (appView !== "daily") return;
    setDailyHistoryIndex(0);
    setDailyRankingView("today");
    if (dailyHistoryScrollRef.current) {
      dailyHistoryScrollRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [
    appView,
    Array.isArray(dailyHistory?.days) ? dailyHistory.days.length : 0,
    Array.isArray(dailyHistory?.crownTotals) ? dailyHistory.crownTotals.length : 0,
  ]);

  useEffect(() => {
    const onConnect = () => {
      if (isDailyView) return;
      if (!installId) return;
      fetchVocabStats();
    };
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
  }, [installId, isDailyView]);

  useEffect(() => {
    const onRoomsStats = (payload) => {
      setRoomsStats(Array.isArray(payload) ? payload : []);
    };
    socket.on("roomsStats", onRoomsStats);
    return () => socket.off("roomsStats", onRoomsStats);
  }, []);

  useEffect(() => {
    if (isLoggedIn) return;
    fetchLobbyPlayers();
    const onConnect = () => fetchLobbyPlayers();
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
  }, [isLoggedIn, roomId]);

  useEffect(() => {
    if (!isWeeklyOpen || statsTab !== "weekly") {
      if (weeklyArrowTimerRef.current) {
        clearTimeout(weeklyArrowTimerRef.current);
        weeklyArrowTimerRef.current = null;
      }
      if (weeklyArrowBlinkTimerRef.current) {
        clearTimeout(weeklyArrowBlinkTimerRef.current);
        weeklyArrowBlinkTimerRef.current = null;
      }
      if (weeklyArrowBumpTimerRef.current) {
        clearTimeout(weeklyArrowBumpTimerRef.current);
        weeklyArrowBumpTimerRef.current = null;
      }
      setWeeklyArrowVisible(false);
      setWeeklyArrowBlink(false);
      setWeeklyArrowBump(false);
      return;
    }
    const firstOpen = !weeklyArrowSeenRef.current;
    if (firstOpen) {
      weeklyArrowSeenRef.current = true;
    }
    triggerWeeklyArrowHint({ blink: firstOpen, showForMs: firstOpen ? 2600 : 1600 });
  }, [isWeeklyOpen, statsTab]);

  useEffect(() => {
    if (!isWeeklyOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        closeWeeklyStatsOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isWeeklyOpen]);

  useEffect(() => {
    if (!isWeeklyOpen) return;
    if (statsTab === "season") {
      void requestTrophyStatus();
    }
  }, [isWeeklyOpen, statsTab]);

  useEffect(() => {
    if (statsTab !== "season") return;
    setSeasonActiveIndex(0);
    setSeasonDragOffset(0);
    setSeasonDragging(false);
    seasonTouchRef.current.startX = null;
    seasonTouchRef.current.startY = null;
  }, [statsTab]);

  useEffect(() => {
    if (!isPlayersOverlayOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        closePlayersOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPlayersOverlayOpen]);

  // Countdown entre les manches
  useEffect(() => {
    if (!nextStartAt) {
      setBreakCountdown(null);
      return;
    }
    const update = () =>
      setBreakCountdown(
        Math.max(0, Math.round((nextStartAt - getNowServerMs()) / 1000))
      );
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [nextStartAt]);

  function handleForeground(reason = "foreground") {
    const now = Date.now();
    if (now - foregroundAttemptRef.current < 800) return;
    foregroundAttemptRef.current = now;
    if (!hasSavedSession() && !isLoggedInRef.current) {
      lastBackgroundTimeRef.current = 0;
      return;
    }
    const canAutoResume = isLoggedInRef.current && !isDailyView;
    const lastBackgroundTime = lastBackgroundTimeRef.current;
    const timeSinceBackground =
      lastBackgroundTime > 0 ? Date.now() - lastBackgroundTime : 0;
    const shouldForceReconnect = timeSinceBackground > 5000;
    if (shouldForceReconnect) {
      try {
        intentionalDisconnectRef.current = true;
        socket.disconnect();
      } catch (_) {}
      if (!autoResumeEnabledRef.current && !isLoggedInRef.current) return;
      setTimeout(() => {
        lastBackgroundTimeRef.current = 0;
        if (canAutoResume) {
          resumeLoginFromSession(reason);
        } else {
          socket.connect();
          requestSessionResumeSnapshot(reason);
        }
      }, 200);
      return;
    }
    if (lastBackgroundTime) {
      lastBackgroundTimeRef.current = 0;
    }
    if (!socket.connected) {
      if (!autoResumeEnabledRef.current && !isLoggedInRef.current) return;
      if (canAutoResume) {
        resumeLoginFromSession(reason);
      } else {
        socket.connect();
        requestSessionResumeSnapshot(reason);
      }
      return;
    }
    runHealthCheck(reason);
  }

  function handleManualRefresh() {
    if (manualRefreshTimerRef.current) {
      clearTimeout(manualRefreshTimerRef.current);
      manualRefreshTimerRef.current = null;
    }
    try {
      intentionalDisconnectRef.current = true;
      socket.disconnect();
    } catch (_) {}
    manualRefreshTimerRef.current = setTimeout(() => {
      manualRefreshTimerRef.current = null;
      socket.connect();
    }, 300);
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        isBackgroundedRef.current = true;
        lastBackgroundTimeRef.current = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        isBackgroundedRef.current = false;
        handleForeground("visibility");
      }
    };
    const onFocus = () => handleForeground("focus");
    const onOnline = () => handleForeground("online");
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (phase === "playing") {
      watchdogTimerRef.current = setInterval(
        () => runHealthCheck("watchdog_playing"),
        12000
      );
    }
    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [phase]);


  function handleLogin(e) {
    if (e) e.preventDefault();
    const nick = nickname.trim();
    if (!nick) {
      setLoginError("Choisis un pseudo");
      return;
    }
    if (nick.length > 25) {
      setLoginError("25 caracteres max");
      return;
    }

    setIsConnecting(true);
    setLoginError("");
    setConnectionError("");
    lastLoginPayloadRef.current = { nick, roomId };
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }
    reconnectAttemptRef.current = false;

    const attemptLogin = () => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (loginTimeout) clearTimeout(loginTimeout);
      };
      const loginTimeout = setTimeout(() => {
        finish();
        setLoginError("Connexion timeout");
        setIsConnecting(false);
      }, 6000);
      socket.emit("login", { nick, roomId, installId }, (res) => {
        finish();
        if (!res?.ok) {
        if (res?.error === "pseudo_taken") {
          setLoginError("Pseudo deja utilise");
        } else if (res?.error === "nick_too_long") {
          setLoginError("25 caracteres max");
          } else if (res?.error === "invalid_room") {
            setLoginError("Salle indisponible");
          } else if (res?.error === "invalid_install_id") {
            setLoginError("Identifiant appareil invalide");
          } else {
            setLoginError("Connexion refusee");
          }
          setIsConnecting(false);
          return;
        }

        const joinedRoom = res?.roomId || roomId;
        lastLoginPayloadRef.current = { nick, roomId: joinedRoom };
        persistSession({ nick, roomId: joinedRoom, installId });
        autoResumeEnabledRef.current = true;
        setCurrentRoomId(joinedRoom);
        setRoomId(joinedRoom);
        const nextSize = getGridSizeForRoom(joinedRoom);
        setGridSize(nextSize);
        setBoard(Array(nextSize * nextSize).fill({ letter: "?", bonus: null }));
        setResumeSnapshot(null);
        setIsLoggedIn(true);
        setIsConnecting(false);
        setServerStatus("waiting");
        setScore(0);
        void requestTrophyStatus();
        try {
          localStorage.setItem("boggle_nick", nick);
        } catch (_) {}
      });
    };

    const onConnectError = () => {
      setLoginError("Impossible de joindre le serveur");
      setIsConnecting(false);
      socket.off("connect", attemptLogin);
    };

    socket.once("connect_error", onConnectError);

    if (socket.connected) {
      syncServerTime(attemptLogin);
    } else {
      socket.once("connect", () => {
        socket.off("connect_error", onConnectError);
        syncServerTime(attemptLogin);
      });
      socket.connect();
    }
  }

  function openTutorial({ pendingLogin = false } = {}) {
    setTutorialPendingLogin(pendingLogin);
    setIsTutorialOpen(true);
  }

  function completeTutorial() {
    setIsTutorialOpen(false);
    setTutorialPendingLogin(false);
    try {
      localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, installId);
    } catch (_) {}
    setTutorialSeenInstallId(installId);
    if (tutorialPendingLogin) {
      handleLogin();
    }
  }

  function openTutorialFromHome() {
    openTutorial({ pendingLogin: false });
  }

  function handleLoginOrResume(e) {
    if (e) e.preventDefault();
    requestAudioUnlock(e);
    if (!isTutorialOpen && shouldShowTutorial) {
      openTutorial({ pendingLogin: true });
      return;
    }
    handleLogin();
  }

  function handleResumeFromPrompt(e) {
    requestAudioUnlock(e);
    resumeLoginFromSession("resume_button");
  }

  function dismissResumePrompt() {
    setResumeSnapshot(null);
  }

  function startGameFromServer(
    serverGrid,
    newRoundId,
    durationMs,
    endsAt,
    sourceRoomId = null,
    incomingGridSize = null,
    specialInfo = null,
    gridQuality = null,
    nextSpecial = null
  ) {
    const derivedSize =
      incomingGridSize ||
      Math.max(1, Math.round(Math.sqrt((serverGrid || []).length || gridSize * gridSize)));
    setGridSize(derivedSize);
    if (sourceRoomId) {
      setRoomId(sourceRoomId);
      setCurrentRoomId(sourceRoomId);
    }
    setBoard(serverGrid);
    setCurrentTiles([]);
    currentTilesRef.current = [];
    setHighlightPath([]);
    setAnalysis(null);
    setHighlightPlayers([]);
    setBigScoreFlash(null);
    setToast(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    solutionsRef.current = new Map();
    bestGridMaxRef.current = 0;
    bestGridMaxLenRef.current = 0;
    setAccepted([]);
    acceptedScoresRef.current = new Map();
    acceptedRef.current = [];
    resetSubmissionQueue();
    setAllWords([]);
    setShowAllWords(false);
    setSpecialRound(specialInfo && specialInfo.isSpecial ? specialInfo : null);
    if (false && specialInfo?.isSpecial) {
      setAnnouncements((prev) => [
        {
          id: Date.now() + Math.random(),
          ts: Date.now(),
          type: "special_start",
          text:
            specialInfo.type === "speed"
              ? `MANCHE SPéCIALE : ${specialInfo.label} - tous les mots valent ${specialInfo.fixedWordScore} pts`
              : `MANCHE SPéCIALE : ${specialInfo.label} - gros potentiel de points et de mots longs`,
        },
        ...prev,
      ]);
    }
    const stats =
      gridQuality && typeof gridQuality === "object"
        ? {
            words: gridQuality.words ?? null,
            totalPts: gridQuality.possibleScore ?? gridQuality.totalPts ?? gridQuality.maxPts ?? null,
            maxPts: gridQuality.maxPts ?? null,
            maxLen: gridQuality.maxLen ?? null,
            longWords: gridQuality.longWords ?? null,
          }
        : null;
    setRoundStats(stats);
    bestGridMaxRef.current = stats?.maxPts ?? 0;
    bestGridMaxLenRef.current = stats?.maxLen ?? 0;
    setScore(0);
    setLastWords([]);
    clearStatusMessage({ force: true });
    bestWordAnnounceRef.current = -1;
    setFinalResults([]);
    setProvisionalRanking([]);
    const maxDuration =
      Number.isFinite(durationMs)
        ? Math.max(1, Math.round(durationMs / 1000))
        : ROOM_OPTIONS[sourceRoomId || currentRoomId || roomId]?.duration ??
          DEFAULT_DURATION;
    const initialTick = endsAt
      ? Math.max(0, Math.round((endsAt - getNowServerMs()) / 1000))
      : maxDuration;
    setTick(Math.min(maxDuration, initialTick));
    setRoundId(newRoundId || null);
    setServerEndsAt(endsAt || null);
    const roundEndAt = Number.isFinite(endsAt) ? endsAt : null;
    const roundStartAt =
      Number.isFinite(endsAt) && Number.isFinite(durationMs)
        ? endsAt - Math.max(1, Math.round(durationMs))
        : null;
    lastRoundWindowRef.current = { startAt: roundStartAt, endAt: roundEndAt };
    setServerRoundDurationMs(
      Number.isFinite(durationMs) ? Math.max(1, Math.round(durationMs)) : null
    );
    setServerStatus("running");
    setConnectionError("");
    setPhase("playing");
  }

  useEffect(() => {
    startGameFromServerRef.current = startGameFromServer;
  });

  function cancelAllWordsCompute() {
    const job = allWordsComputeRef.current;
    if (job.kickoff) {
      clearTimeout(job.kickoff);
      job.kickoff = null;
    }
    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }
    if (job.idle && typeof window !== "undefined" && window.cancelIdleCallback) {
      try {
        window.cancelIdleCallback(job.idle);
      } catch (_) {}
      job.idle = null;
    }
    job.key = null;
  }

  function buildAllWordsLocal(sourceBoard = board, opts = {}) {
    const updateBestRefs = opts.updateBestRefs !== false;
    if (!dictionary) return [];
    if (!sourceBoard || sourceBoard.length === 0) return [];
    if (DEV_MODE) {
      console.info("[solver] solveAll start", {
        phase: phaseRef.current,
        size: sourceBoard.length,
      });
      setDevPerfStats((prev) => ({
        ...prev,
        lastSolveAllAt: Date.now(),
      }));
    }
    const filtered = filterDictionary(dictionary, sourceBoard);
    const solved = solveAll(sourceBoard, filtered, specialScoreConfig);
    solutionsRef.current = solved;

    const all = [...solved.entries()].map(([word, path]) => ({
      word,
      pts: computeScore(word, path, sourceBoard, specialScoreConfig),
      path,
    }));

    all.sort((a, b) => b.pts - a.pts);
    const maxPts = all.length ? all[0].pts : 0;
    const maxLen = all.length
      ? Math.max(...all.map(({ word }) => normalizeWord(word).length))
      : 0;
    if (updateBestRefs) {
      bestGridMaxRef.current = maxPts;
      bestGridMaxLenRef.current = maxLen;
    }
    return all;
  }

  function scheduleAllWordsCompute(
    sourceBoard,
    { updateBestRefs = true, jobKey, delayMs } = {}
  ) {
    // Guard: never compute solveAll during playing.
    if (phaseRef.current === "playing" && !LIVE_SOLVER_DURING_PLAY) return;
    cancelAllWordsCompute();
    if (!dictionary || dictionary.size === 0) return;
    if (!sourceBoard || sourceBoard.length === 0) return;

    const key = jobKey || `solve-${Date.now()}-${Math.random()}`;
    allWordsComputeRef.current.key = key;

    const run = () => {
      if (allWordsComputeRef.current.key !== key) return;
      const all = buildAllWordsLocal(sourceBoard, { updateBestRefs });
      if (allWordsComputeRef.current.key !== key) return;
      setAllWords(all);
    };

    const kickoff = () => {
      if (typeof window !== "undefined" && window.requestIdleCallback) {
        allWordsComputeRef.current.idle = window.requestIdleCallback(run, {
          timeout: 15000,
        });
      } else {
        allWordsComputeRef.current.timer = setTimeout(run, 600);
      }
    };

    const kickoffDelay =
      typeof delayMs === "number" && Number.isFinite(delayMs)
        ? Math.max(0, Math.round(delayMs))
        : 4500;
    allWordsComputeRef.current.kickoff = setTimeout(kickoff, kickoffDelay);
  }

  function attemptSilentReconnect() {
    if (reconnectAttemptRef.current) return;
    reconnectAttemptRef.current = true;
    setConnectionError("Reconnexion...");
    if (isLoggedInRef.current && !isDailyView) {
      resumeLoginFromSession("disconnect");
    } else {
      requestSessionResumeSnapshot("disconnect");
    }
    setTimeout(() => {
      reconnectAttemptRef.current = false;
    }, 1500);
  }

  function startGame() {
    const base = generateGrid(gridSize);

    setBoard(base);
    setCurrentTiles([]);
    currentTilesRef.current = [];
    setHighlightPath([]);
    setAnalysis(null);
    setHighlightPlayers([]);
    setBigScoreFlash(null);
    setToast(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    solutionsRef.current = new Map();
    bestGridMaxRef.current = 0;
    bestGridMaxLenRef.current = 0;
    setAccepted([]);
    acceptedScoresRef.current = new Map();
    acceptedRef.current = [];
    resetSubmissionQueue();
    setAllWords([]);
    setShowAllWords(false);
    setSpecialRound(null);
    setUpcomingSpecial(null);
    setRoundStats(null);
    setTargetSummary(null);
    setScore(0);
    setLastWords([]);
    clearStatusMessage({ force: true });
    bestWordAnnounceRef.current = -1;
    setFinalResults([]);
    setProvisionalRanking([]);
    setRoundId(null);
    setServerEndsAt(null);
    setServerStatus("running");
    setNextStartAt(null);
    setBreakCountdown(null);
    setTick(ROOM_OPTIONS[currentRoomId || roomId]?.duration ?? DEFAULT_DURATION);
    setPhase("playing");
  }

  function captureListPositions(list) {
    const map = new Map();
    list.forEach((entry) => {
      const el = listItemRefs.current.get(entry.word);
      if (el) {
        const rect = el.getBoundingClientRect();
        map.set(entry.word, rect);
      }
    });
    prevPositionsRef.current = map;
  }


  function rotateGridClockwise() {
    if (isGridRotating) return;
    if (draggingRef.current) {
      draggingRef.current = false;
      clearSelection();
    }
    const prevRects = new Map();
    for (let i = 0; i < board.length; i++) {
      const el = tileRefs.current[i];
      if (!el) continue;
      prevRects.set(i, el.getBoundingClientRect());
    }
    gridRotateAnimRef.current = { prevRects, spin: 90 };
    setIsGridRotating(true);
    if (gridRotateTimerRef.current) clearTimeout(gridRotateTimerRef.current);
    gridRotateTimerRef.current = setTimeout(() => {
      setIsGridRotating(false);
      gridRotateTimerRef.current = null;
    }, GRID_ROTATE_ANIM_MS);
    setGridRotationTurns((prev) => normalizeRotationTurns(prev + 1));
  }

  function pushWordHistory(wordNorm) {
    if (!wordNorm) return;
    const hist = wordHistoryRef.current;
    if (hist[0] !== wordNorm) {
      wordHistoryRef.current = [wordNorm, ...hist].slice(0, 30);
    }
    wordHistoryIndexRef.current = -1;
  }

  function loadWordFromHistory(wordNorm) {
    if (!wordNorm || phase !== "playing") return;
    const path = findBestPathForWord(board, wordNorm, specialScoreConfig);
    if (!path || path.length === 0) return;
    const letters = path.map((idx) => board[idx].letter);
    setCurrentTiles(letters);
    currentTilesRef.current = letters;
    setHighlightPath(path);
    clearStatusMessage();
    setActiveArea("game");
  }

  function cycleWordHistory(direction) {
    const hist = wordHistoryRef.current;
    if (!hist.length || phase !== "playing") return;
    let idx = wordHistoryIndexRef.current;
    if (direction < 0) {
      idx = idx === -1 ? 0 : Math.min(hist.length - 1, idx + 1);
    } else if (direction > 0) {
      idx = idx === -1 ? -1 : idx - 1;
    }
    if (idx < 0) {
      wordHistoryIndexRef.current = -1;
      clearSelection();
      return;
    }
    wordHistoryIndexRef.current = idx;
    loadWordFromHistory(hist[idx]);
  }

  function pushChatHistory(text) {
    if (!text) return;
    const hist = chatHistoryRef.current;
    if (hist[0] !== text) {
      chatHistoryRef.current = [text, ...hist].slice(0, 50);
    }
    chatHistoryIndexRef.current = -1;
  }

  function cycleChatHistory(direction) {
    const hist = chatHistoryRef.current;
    if (!hist.length) return;
    let idx = chatHistoryIndexRef.current;
    if (direction < 0) {
      idx = idx === -1 ? 0 : Math.min(hist.length - 1, idx + 1);
    } else if (direction > 0) {
      idx = idx === -1 ? -1 : idx - 1;
    }
    chatHistoryIndexRef.current = idx;
    const nextValue = idx === -1 ? "" : hist[idx] || "";
    setChatInput(nextValue);
    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }

  function normalizeInstallId(raw) {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 160) return "";
    return trimmed;
  }

  function updateBlockedInstallIds(updater) {
    setBlockedInstallIds((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const sanitized = Array.isArray(next)
        ? Array.from(new Set(next.map(normalizeInstallId).filter(Boolean)))
        : [];
      try {
        localStorage.setItem(
          BLOCKED_INSTALL_IDS_STORAGE_KEY,
          JSON.stringify(sanitized)
        );
      } catch (_) {}
      return sanitized;
    });
  }

  function blockInstallId(targetInstallId, nick = "") {
    const key = normalizeInstallId(targetInstallId);
    if (!key || key === installId) return;
    updateBlockedInstallIds((prev) =>
      prev.includes(key) ? prev : [...prev, key]
    );
    showToast(nick ? `${nick} bloqué` : "Joueur bloqué");
  }

  function unblockInstallId(targetInstallId) {
    const key = normalizeInstallId(targetInstallId);
    if (!key) return;
    updateBlockedInstallIds((prev) => prev.filter((entry) => entry !== key));
  }

  function captureChatViewportBaseline() {
    if (typeof window === "undefined") return;
    const baseHeight = Math.round(
      window.innerHeight || document.documentElement?.clientHeight || 0
    );
    if (baseHeight > 0) {
      chatBodyLockHeightRef.current = baseHeight;
      setChatViewportHeight((prev) => (prev === baseHeight ? prev : baseHeight));
    }
  }

  function openChatPanel() {
    if (chatCloseTimerRef.current) {
      clearTimeout(chatCloseTimerRef.current);
      chatCloseTimerRef.current = null;
    }
    suppressChatResizeRef.current = false;
    setIsChatClosing(false);
    setMobileChatUnreadCount(0);
    captureChatViewportBaseline();

    // Figer la hauteur du jeu (layout viewport) pour que le fond ne "réponde" pas au clavier.
    if (typeof window !== "undefined") {
      const candidates = [
        window.innerHeight,
        typeof document !== "undefined" ? document.documentElement?.clientHeight : null,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const h = candidates.length ? Math.max(...candidates) : 0;
      if (h > 0) gameViewportFreezeHeightRef.current = Math.round(h);
    }

    setIsChatOpenMobile(true);
  }

  function closeChatPanel() {
    if (!isChatOpenMobile) return;
    if (chatCloseTimerRef.current) {
      clearTimeout(chatCloseTimerRef.current);
    }
    suppressChatResizeRef.current = true;
    setIsChatClosing(true);
    if (chatInputRef.current) {
      try {
        chatInputRef.current.blur();
      } catch (_) {}
    }
    chatBodyLockHeightRef.current = 0;
    gameViewportFreezeHeightRef.current = 0;
    chatCloseTimerRef.current = window.setTimeout(() => {
      setIsChatOpenMobile(false);
      setIsChatClosing(false);
      suppressChatResizeRef.current = false;
      lastKeyboardInsetRef.current = 0;
      chatCloseTimerRef.current = null;
    }, CHAT_DRAWER_ANIM_MS);
  }

  function requestOpenChat() {
    openChatPanel();
    if (!chatRulesAccepted) {
      setIsChatRulesOpen(true);
    }
  }

  function confirmChatRules() {
    try {
      localStorage.setItem(CHAT_RULES_STORAGE_KEY, "1");
    } catch (_) {}
    setChatRulesAccepted(true);
    setIsChatRulesOpen(false);
  }

  function cancelChatRules() {
    setIsChatRulesOpen(false);
  }

  function closeUserMenu() {
    setUserMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
  }

  function openUserMenu(e, { nick, installId: targetInstallId, messageId = null }) {
    const key = normalizeInstallId(targetInstallId);
    if (!key || key === installId) return;
    if (e?.preventDefault) e.preventDefault();
    if (e?.stopPropagation) e.stopPropagation();
    const rect = e?.currentTarget?.getBoundingClientRect?.();
    const viewportWidth = window.innerWidth || 360;
    const viewportHeight = window.innerHeight || 640;
    const menuWidth = 180;
    const menuHeight = 120;
    const padding = 8;
    const baseLeft = rect?.left ?? padding;
    const baseTop = rect?.bottom ?? padding;
    let left = Math.min(
      Math.max(padding, Math.round(baseLeft)),
      Math.max(padding, viewportWidth - menuWidth - padding)
    );
    let top = Math.round(baseTop + 6);
    if (top + menuHeight > viewportHeight - padding) {
      const fallbackTop = rect?.top ?? top;
      top = Math.max(padding, Math.round(fallbackTop - menuHeight - 6));
    }
    setUserMenu({
      open: true,
      left,
      top,
      nick: nick || "Joueur",
      installId: key,
      messageId: messageId || null,
    });
  }

  function openReportDialog({ installId: targetInstallId, nick, messageId }) {
    const key = normalizeInstallId(targetInstallId);
    if (!key || key === installId) return;
    setReportDialog({
      open: true,
      reportedInstallId: key,
      reportedNick: nick || "",
      messageId: messageId || null,
      reason: "",
      details: "",
    });
  }

  function closeReportDialog() {
    setReportDialog((prev) =>
      prev.open
        ? {
            open: false,
            reportedInstallId: null,
            reportedNick: "",
            messageId: null,
            reason: "",
            details: "",
          }
        : prev
    );
  }

  function submitReport() {
    const targetId = normalizeInstallId(reportDialog.reportedInstallId);
    if (!targetId) return;
    const baseReason = String(reportDialog.reason || "").trim();
    const detail = String(reportDialog.details || "").trim();
    let reason = baseReason;
    if (baseReason === "Autre" && detail) {
      reason = `Autre: ${detail}`;
    }
    reason = reason.trim().slice(0, 160);
    if (!reason) return;
    if (!socket.connected) {
      showToast("Signalement non envoyé");
      closeReportDialog();
      return;
    }
    socket.emit(
      "reportMessage",
      {
        messageId: reportDialog.messageId || null,
        reportedInstallId: targetId,
        reason,
      },
      (res) => {
        if (res?.ok) {
          showToast("Signalement envoyé");
        } else {
          showToast("Signalement refusé");
        }
      }
    );
    closeReportDialog();
  }

  function openDefinition(term, { fromWordInfo = false } = {}) {
    const clean = String(term || "").trim();
    if (!clean) return;
    const originFromWordInfo = !!fromWordInfo;
    if (guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_DEFINITION) {
      completeGuidedResultsTutorial();
    }
    const requestId = ++definitionRequestIdRef.current;
    if (definitionBlinkTimerRef.current) {
      clearTimeout(definitionBlinkTimerRef.current);
      definitionBlinkTimerRef.current = null;
    }
    setDefinitionBlink(true);
    definitionBlinkTimerRef.current = setTimeout(() => {
      setDefinitionBlink(false);
      definitionBlinkTimerRef.current = null;
    }, 550);
    setDefinitionModal({
      open: true,
      loading: true,
      word: clean,
      lemma: "",
      lemmaLabel: "",
      lemmaGuess: false,
      participleBase: "",
      participleLabel: "",
      participleGuess: false,
      inflectionBase: "",
      inflectionLabel: "",
      inflectionGuess: false,
      matchedTitle: "",
      phraseGuess: false,
      title: "",
      definition: "",
      source: "",
      url: "",
      ok: false,
      fromWordInfo: originFromWordInfo,
    });

    const tried = new Set();
    const baseKey = normalizeWord(clean);
    if (baseKey) tried.add(baseKey);

    const fetchDefinition = (word) => {
      fetch(`/api/define?word=${encodeURIComponent(word)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (requestId !== definitionRequestIdRef.current) return;
          if (!data) {
            setDefinitionModal((prev) => ({ ...prev, loading: false, ok: false }));
            return;
          }
          const definitionText = pickDefinitionText(data);
          const ok = !!definitionText || !!data.ok;
          if (!definitionText) {
            const fallbacks = buildDefinitionFallbacks(clean, data, tried);
            if (fallbacks.length) {
              fetchDefinition(fallbacks[0]);
              return;
            }
          }
          setDefinitionModal({
            open: true,
            loading: false,
            word: data.displayWord || data.word || clean,
            lemma: data.lemma || "",
            lemmaLabel: data.lemmaLabel || "",
            lemmaGuess: !!data.lemmaGuess,
            participleBase: data.participleBase || "",
            participleLabel: data.participleLabel || "",
            participleGuess: !!data.participleGuess,
            inflectionBase: data.inflectionBase || "",
            inflectionLabel: data.inflectionLabel || "",
            inflectionGuess: !!data.inflectionGuess,
            matchedTitle: data.matchedTitle || "",
            phraseGuess: !!data.phraseGuess,
            title: data.title || "",
            definition: definitionText,
            source: data.source || "",
            url: data.url || "",
            ok,
            fromWordInfo: originFromWordInfo,
          });
        })
        .catch(() => {
          if (requestId !== definitionRequestIdRef.current) return;
          setDefinitionModal((prev) => ({ ...prev, loading: false, ok: false }));
        });
    };

    fetchDefinition(clean);
  }

  function closeDefinition() {
    setDefinitionModal((prev) => ({ ...prev, open: false }));
  }

  function openRecordModal(record) {
    const recordList = Array.isArray(record) ? record : record ? [record] : [];
    if (!recordList.length) return;
    const primary = recordList[0] || {};
    setRecordModal({
      open: true,
      categoryKey: primary.categoryKey || "",
      categoryLabel: primary.categoryLabel || "",
      nick: primary.nick || "",
      rank: primary.rank ?? null,
      rankTotal: primary.rankTotal ?? null,
      word: primary.word || "",
      timeMs: Number.isFinite(primary.timeMs) ? primary.timeMs : null,
      wordsCount: Number.isFinite(primary.wordsCount) ? primary.wordsCount : null,
      records: recordList,
    });
  }

  function closeRecordModal() {
    setRecordModal((prev) => ({ ...prev, open: false }));
  }

  /**
   * Ajout de lettres via le clavier, avec pathfinder optimisé.
   */
  function addLetterFromKeyboard(label) {
    clearStatusMessage();

    setCurrentTiles((prev) => {
      const next = [...prev, label];
      currentTilesRef.current = next;
      if (next.length === 1) {
        tileStepRef.current = 0;
        playTileStepSound(0);
      }

      const raw = normalizeWord(next.join(""));
      if (!raw) return prev;

      const path = findBestPathForWord(board, raw, specialScoreConfig);
      if (path) setHighlightPath(path);
      else setHighlightPath([]);

      return next;
    });
  }

  function removeLastLetterFromKeyboard() {
    clearStatusMessage();
    setCurrentTiles((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      currentTilesRef.current = next;
      if (next.length > 0) {
        const step = Math.max(0, next.length - 1);
        tileStepRef.current = step;
        playTileStepSound(step);
      }
      if (!next.length) {
        setHighlightPath([]);
        return next;
      }
      const raw = normalizeWord(next.join(""));
      if (!raw) {
        setHighlightPath([]);
        return next;
      }
      const path = findBestPathForWord(board, raw, specialScoreConfig);
      if (path) setHighlightPath(path);
      else setHighlightPath([]);
      return next;
    });
  }

  /**
   * Gestion clavier globale : Tab pour switch game/chat,
   * lettres pour le jeu uniquement quand activeArea === "game".
   */
  useEffect(() => {
    function onKey(e) {
      // Tab : bascule jeu <-> chat
      if (e.key === "Tab") {
        e.preventDefault();

        setActiveArea((prev) => {
          const next = prev === "game" ? "chat" : "game";

          if (next === "chat") {
            setTimeout(() => {
              if (chatInputRef.current) {
                chatInputRef.current.focus();
              }
            }, 0);
          } else {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }

          return next;
        });

        return;
      }

      // On ne gère le reste que si le jeu est la zone active
      if (activeArea !== "game") return;
      if (phase !== "playing") return;
      if (inputLockedRef.current) return;

      const target = e.target;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const k = e.key.toLowerCase();

      if (/^[a-z]$/.test(k)) {
        e.preventDefault();
        setLastInputMode("keyboard");
        addLetterFromKeyboard(k.toUpperCase());
      }
      if (k === "arrowup") {
        e.preventDefault();
        setLastInputMode("keyboard");
        cycleWordHistory(-1);
      }
      if (k === "arrowdown") {
        e.preventDefault();
        setLastInputMode("keyboard");
        cycleWordHistory(1);
      }
      if (k === "enter") {
        e.preventDefault();
        setLastInputMode("keyboard");
        submit();
      }
      if (k === "backspace") {
        e.preventDefault();
        setLastInputMode("keyboard");
        removeLastLetterFromKeyboard();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeArea, phase, board, dictionary]);

  function playDefeatTone(freqs = [280, 220], soundKey = "error") {
    if (isSfxMuted) return;
    if (!shouldPlay(soundKey, AUDIO_COOLDOWNS_MS[soundKey] ?? 120)) return;
    const system = getAudioSystem();
    if (!system) return;
    const { ctx } = system;
    const start = () => {
      if (ctx.state !== "running") return;
      const now = ctx.currentTime + 0.01;
      const master = ctx.createGain();
      master.gain.setValueAtTime(humanizeGain(0.9, 1.0), now);
      const fxNodes = connectSfxChain(
        ctx,
        system,
        master,
        {
          filter: { type: "lowpass", base: 1800, peak: 4200, q: 0.8, attack: 0.02, release: 0.12 },
          saturation: 0.7,
          panRange: 0.12,
          reverbSend: 0.06,
        },
        now
      );
      const nodes = [master, ...fxNodes];
      let lastStop = now;
      let lastOsc = null;
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + idx * 0.1;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(humanizeFreq(freq, 5), t0);
        const endTime = withEnvelope(
          gain,
          t0,
          0.006,
          humanizeGain(0.14, 1.4),
          0.05,
          0.16
        );
        const stopTime = endTime + 0.02;
        osc.connect(gain);
        gain.connect(master);
        nodes.push(osc, gain);
        if (stopTime > lastStop) lastStop = stopTime;
        lastOsc = osc;
        try {
          osc.start(t0);
          osc.stop(stopTime);
        } catch (_) {}
      });
      const finalStopTime = lastStop;
      const cleanup = startVoiceCount(soundKey, finalStopTime - ctx.currentTime + 0.1);
      const finalize = scheduleNodeCleanup(ctx, finalStopTime + 0.05, nodes, cleanup);
      if (lastOsc) lastOsc.onended = finalize;
    };
    ctx.resume().then(start).catch(start);
  }

  function playErrorSound() {
    playDefeatTone([290, 230], "error");
  }

  function playInvalidWordSound() {
    if (isSfxMuted) return;
    playOneShotAudio(SFX_KEYS.invalidWord, {
      cooldownKey: "invalidWord",
      eqKey: "invalidWord",
    });
  }

  function playShortWordSound() {
    if (isSfxMuted) return;
    playOneShotAudio(SFX_KEYS.shortWord, {
      cooldownKey: "shortWord",
      eqKey: "shortWord",
    });
  }

  function playAlreadyPlayedSound() {
    if (isSfxMuted) return;
    playOneShotAudio(SFX_KEYS.dejaJoue, {
      cooldownKey: "dejaJoue",
      eqKey: "dejaJoue",
    });
  }

  function playDuplicateErrorTone() {
    playDefeatTone([320, 260], "duplicate");
  }

    // =============== VIBRATIONS (optionnelles, mobile) ===============
  function vibrateLight() {
    if (!canVibrateRef.current || !isVibrationEnabledRef.current) return;
    try {
      navigator.vibrate(15);
    } catch (_) {}
  }

  function vibrateSuccess(wordLength) {
    // Haptique supprimé sur validation : on réserve la vibration aux erreurs.
    return;
  }


  function vibrateErrorPattern() {
    if (!canVibrateRef.current || !isVibrationEnabledRef.current) return;
    try {
      navigator.vibrate([40, 60, 40]);
    } catch (_) {}
  }

  function setStatusMessageWithHold(msg, holdMs = 1000) {
    const text = typeof msg === "string" ? msg : "";
    setStatusMessage(text);
    if (!text) return;
    const until = Date.now() + holdMs;
    statusHoldRef.current = { text, until };
    if (statusHoldTimerRef.current) {
      clearTimeout(statusHoldTimerRef.current);
    }
    statusHoldTimerRef.current = setTimeout(() => {
      statusHoldTimerRef.current = null;
      setStatusHoldTick((tick) => tick + 1);
    }, holdMs);
  }

  function clearStatusMessage({ force = false } = {}) {
    setStatusMessage("");
    if (!force) return;
    statusHoldRef.current = { text: "", until: 0 };
    if (statusHoldTimerRef.current) {
      clearTimeout(statusHoldTimerRef.current);
      statusHoldTimerRef.current = null;
    }
    setStatusHoldTick((tick) => tick + 1);
  }

  function queueVocabOverlayTimer(timerId) {
    if (!timerId) return;
    vocabOverlayTimersRef.current.push(timerId);
  }

  function clearVocabOverlayTimers() {
    vocabOverlayTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    vocabOverlayTimersRef.current = [];
    if (vocabOverlayRafRef.current) {
      cancelAnimationFrame(vocabOverlayRafRef.current);
      vocabOverlayRafRef.current = null;
    }
  }

    function error(msg) {
    setStatusMessageWithHold(msg);
    setShake(false);
    // restart the animation even if the state was already true
    requestAnimationFrame(() => setShake(true));
    const lower = (msg || "").toLowerCase();
    const isDuplicate = lower.includes("déjà") || lower.includes("deja");
    const isInvalidDico =
      lower.includes("dico") || lower.includes("dictionnaire") || lower.includes("absent");
    const isTooShort = lower.includes("trop court");
    if (isInvalidDico) {
      playInvalidWordSound();
    } else if (isTooShort) {
      playShortWordSound();
    } else if (isDuplicate) {
      playAlreadyPlayedSound();
    } else {
      playErrorSound();
    }
    vibrateErrorPattern();
    setTimeout(() => setShake(false), 300);
    clearSelection();
  }


  /**
   * Drag souris : démarrage
   */
  function handleMouseDown(index, mode = "mouse") {
    if (phase !== "playing" || inputLocked) return;
    setActiveArea("game");
    draggingRef.current = true;
    setLastInputMode(mode);
    clearStatusMessage();

    const letter = board[index].letter;
      tileStepRef.current = 0;                 // <-- reset
       playTileStepSound(tileStepRef.current);

    setCurrentTiles([letter]);
    currentTilesRef.current = [letter];
    setHighlightPath([index]);
  }

  /**
   * Drag souris : survol d'une case, avec rognage des coins orthogonaux.
   */
  function handleMouseEnter(index, e) {
    if (!draggingRef.current) return;

    setHighlightPath((prevPath) => {
      if (prevPath.length === 0) {
        const letter = board[index].letter;
        setCurrentTiles([letter]);
        currentTilesRef.current = [letter];
        return [index];
      }

      const lastIndex = prevPath[prevPath.length - 1];
      const prevIndex = prevPath[prevPath.length - 2];

      if (prevPath.length >= 2 && index === prevIndex) {
        // Safe zone: only allow backtrack when pointer is close to the previous tile center.
        if (lastInputMode === "touch" || lastInputMode === "mouse") {
          const el = tileRefs.current[index];
          if (el && e) {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX ?? cx) - cx;
            const dy = (e.clientY ?? cy) - cy;
            const dist = Math.hypot(dx, dy);
            const safeRadius = Math.min(rect.width, rect.height) * 0.38;
            if (dist > safeRadius) return prevPath;
          }
        }
        const nextPath = prevPath.slice(0, -1);
        setCurrentTiles((prevLetters) => {
          const newLetters = prevLetters.slice(0, -1);
          currentTilesRef.current = newLetters;
          const step = Math.max(0, newLetters.length - 1);
          tileStepRef.current = step;
          if (newLetters.length > 0) {
            playTileStepSound(step);
          }
          return newLetters;
        });
        return nextPath;
      }

      const neigh = neighbors(lastIndex, gridSize);
      if (!neigh.includes(index)) return prevPath;
      if (prevPath.includes(index)) return prevPath;

      {
        const el = tileRefs.current[index];
        if (el && e) {
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = (e.clientX ?? cx) - cx;
          const dy = (e.clientY ?? cy) - cy;
          const dist = Math.hypot(dx, dy);
          const safeRadius = Math.min(rect.width, rect.height) * 0.5; // si plus petit, moins permissif
          if (dist > safeRadius) return prevPath;
        }
      }

      const lastRow = Math.floor(lastIndex / gridSize);
      const lastCol = lastIndex % gridSize;
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      const dr = row - lastRow;
      const dc = col - lastCol;

      const isOrthogonal = Math.abs(dr) + Math.abs(dc) === 1;

      if (isOrthogonal) {
        const el = tileRefs.current[index];
        if (el && e) {
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;

          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const halfW = rect.width / 2;
          const halfH = rect.height / 2;

          const nx = dx / halfW;
          const ny = dy / halfH;

          // Zone "anti-corner" : on ignore UNIQUEMENT le coin du voisin orthogonal
          // du côté d'où l'on arrive (pour faciliter les diagonales sans rendre
          // les cases trop difficiles ‡ sélectionner au doigt).
          const CORNER_THRESHOLD = 0.5; //si plus petit, moins permissif
          const inRejectedCorner =
            (dc === 1 && nx < -CORNER_THRESHOLD && Math.abs(ny) > CORNER_THRESHOLD) ||
            (dc === -1 && nx > CORNER_THRESHOLD && Math.abs(ny) > CORNER_THRESHOLD) ||
            (dr === 1 && ny < -CORNER_THRESHOLD && Math.abs(nx) > CORNER_THRESHOLD) ||
            (dr === -1 && ny > CORNER_THRESHOLD && Math.abs(nx) > CORNER_THRESHOLD);

          if (inRejectedCorner) {
            return prevPath;
          }
        }
      }

      const letter = board[index].letter;
setCurrentTiles((prevLetters) => {
  const newLetters = [...prevLetters, letter];
  currentTilesRef.current = newLetters;

  // son progressif : index de la tuile dans le mot
  const step = newLetters.length - 1; // 0 pour la première, 1 pour la 2e, etc.
  tileStepRef.current = step;
  playTileStepSound(step);

  return newLetters;
});

return [...prevPath, index];

    });
  }

  function handleMouseUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    submit();
  }

 function handleTouchStart(e, index) {
  if (phase !== "playing" || inputLocked) return;
  if (!e.touches || e.touches.length === 0) return;

  setActiveArea("game");
  draggingRef.current = true;
  setLastInputMode("touch");
  clearStatusMessage();

  const letter = board[index].letter;
  tileStepRef.current = 0;
  playTileStepSound(0);
  setCurrentTiles([letter]);
  currentTilesRef.current = [letter];
  setHighlightPath([index]);
}

function handleTouchMove(e) {
  if (!draggingRef.current) return;
  if (!e.touches || e.touches.length === 0) return;

  const touch = e.touches[0];
  const idx = getTileIndexFromPoint(touch.clientX, touch.clientY, true);
  if (idx == null) return;

  // on ne passe plus l???event souris, on laisse juste la logique de chemin faire son job
  handleMouseEnter(idx, touch);
}

function handleMouseMove(e) {
  if (!draggingRef.current) return;
  if (!e || typeof e.clientX !== "number" || typeof e.clientY !== "number") return;
  const idx = getTileIndexFromPoint(e.clientX, e.clientY, false);
  if (idx == null) return;
  handleMouseEnter(idx, e);
}

function handleTouchEnd() {
  if (!draggingRef.current) return;
  draggingRef.current = false;
  submit();
}

  function touchSubmissionState() {
    setSubmissionTick((tick) => tick + 1);
  }

  function resetSubmissionQueue() {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    for (const entry of inFlightBatchesRef.current.values()) {
      if (entry?.timeoutId) clearTimeout(entry.timeoutId);
    }
    inFlightBatchesRef.current.clear();
    pendingQueueRef.current = [];
    pendingWordsRef.current.clear();
    submissionStatusRef.current.clear();
    touchSubmissionState();
  }

  function markRejectedWord(word, reason = "") {
    if (!word) return;
    const meta = submissionStatusRef.current.get(word) || {};
    submissionStatusRef.current.set(word, {
      ...meta,
      status: "rejected",
      reason,
      ts: meta.ts || Date.now(),
    });
    pendingWordsRef.current.delete(word);
    touchSubmissionState();
    const cleanupDelay = 2500;
    setTimeout(() => {
      const current = submissionStatusRef.current.get(word);
      if (current?.status === "rejected") {
        submissionStatusRef.current.delete(word);
        touchSubmissionState();
      }
    }, cleanupDelay);
  }

  function applyServerWordResult(word, result) {
    if (!word) return;
    const meta = submissionStatusRef.current.get(word) || {};
    const reason = result?.reason || result?.error || "";
    const acceptedByServer = !!result?.ok || reason === "already_played";
    if (!acceptedByServer) {
      if (reason === "not_target") {
        setStatusMessageWithHold("Pas le mot cible", 1400);
      } else if (reason === "already_found") {
        setStatusMessageWithHold("Deja trouve", 1200);
        playAlreadyPlayedSound();
      }
      markRejectedWord(word, reason || "error");
      return;
    }

    submissionStatusRef.current.delete(word);
    pendingWordsRef.current.delete(word);
    touchSubmissionState();

    const pts =
      Number.isFinite(result?.points)
        ? result.points
        : Number.isFinite(result?.wordScore)
        ? result.wordScore
        : meta.optimisticPts;
    const totalScore =
      Number.isFinite(result?.totalScore)
        ? result.totalScore
        : Number.isFinite(result?.score)
        ? result.score
        : null;
    const safePts = Number.isFinite(pts) ? pts : 0;
    const display = meta.display || word.toUpperCase();
    const path =
      Array.isArray(meta.path) && meta.path.length > 0
        ? meta.path
        : findBestPathForWord(board, word, specialScoreConfig);

    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";

    const alreadyAccepted = acceptedRef.current.includes(word);
    if (Number.isFinite(totalScore)) {
      setScore(totalScore);
    } else if (!alreadyAccepted && Number.isFinite(safePts)) {
      setScore((s) => s + safePts);
    }

    if (Number.isFinite(pts)) {
      acceptedScoresRef.current.set(word, pts);
    }
    pushWordHistory(word);

    if (!alreadyAccepted) {
      const wordBonuses = path ? summarizeBonuses(path, board) : null;
      setLastWords((prev) => {
        const now = Date.now();
        const feedLabel = isTargetRoundNow ? "gobble" : null;
        const next = [
          {
            id: now,
            ts: now,
            display,
            pts: safePts,
            label: feedLabel,
            bonuses: wordBonuses,
          },
          ...prev,
        ];
        return next.slice(0, 24);
      });

      const wordLen = normalizeWord(display || word || "").length || 3;
      if (isTargetRoundNow) {
        setFoundTargetThisRound(true);
        setFoundTargetWord(word);
        triggerConfettiBurst("target");
        showToast("Trouv\u00e9 !");
      } else {
        maybeAnnounceBestWord(nickname.trim() || "Moi", display || word, safePts);
        playScoreSound(safePts);
        showToast(`+${safePts} pts`);
      }

      const isSpeedRound = specialRound?.type === "speed";
      const maxPossiblePts = bestGridMaxRef.current || 0;
      const maxPossibleLen = bestGridMaxLenRef.current || 0;
      const allowScoreGobble = !isSpeedRound;
      const allowLenGobble = true;
      const isGobbleNow =
        (allowScoreGobble && maxPossiblePts > 0 && safePts === maxPossiblePts) ||
        (allowLenGobble && maxPossibleLen > 0 && wordLen === maxPossibleLen);

      if (!isTargetRoundNow) {
        if (isGobbleNow) {
          playGobbleVoice();
          triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
          triggerConfettiBurst("gobble");
        } else if (safePts > 29) {
          triggerPraiseFlash("EPIQUE !", { kind: "epic", shakeGrid: true });
        } else if (safePts > 19) {
          triggerPraiseFlash("ENORME !", { kind: "gold", shakeGrid: true });
        } else if (safePts > 9) {
          triggerPraiseFlash("FABULEUX !", { kind: "purple" });
        } else if (safePts > 5) {
          triggerPraiseFlash("EXCELLENT !", { kind: "blue" });
        }
        if (safePts >= BIG_SCORE_THRESHOLD) {
          triggerBigScoreFlash(safePts);
        }
      }
    }

    setAccepted((prev) => {
      if (prev.includes(word)) {
        acceptedRef.current = prev;
        return prev;
      }
      const updated = [...prev, word];
      acceptedRef.current = updated;
      return updated;
    });

    if (!alreadyAccepted) {
      setStatusMessageWithHold(isTargetRoundNow ? "Trouv\u00e9 !" : `+${safePts} pts`);
    }
  }

  function sendFallbackWords(words, roundIdValue) {
    if (!Array.isArray(words) || words.length === 0) return;
    if (!socket.connected || !isLoggedIn || !roundIdValue) return;
    for (const word of words) {
      if (!word) continue;
      const meta = submissionStatusRef.current.get(word) || {};
      const path =
        Array.isArray(meta.path) && meta.path.length > 0
          ? meta.path
          : findBestPathForWord(board, word, specialScoreConfig);
      if (!path || path.length === 0) {
        applyServerWordResult(word, { ok: false, reason: "invalid_word" });
        continue;
      }
      socket.emit("submitWord", { roundId: roundIdValue, word, path }, (res) => {
        applyServerWordResult(word, res);
      });
    }
  }

  function handleBatchTimeout(clientSeq) {
    const inFlight = inFlightBatchesRef.current.get(clientSeq);
    if (!inFlight) return;
    inFlightBatchesRef.current.delete(clientSeq);
    const pending = inFlight.words.filter(
      (word) => submissionStatusRef.current.get(word)?.status === "pending"
    );
    if (!pending.length) return;
    batchUnsupportedRef.current = true;
    sendFallbackWords(pending, roundIdRef.current);
  }

  function handleBatchAck(clientSeq, res) {
    const inFlight = inFlightBatchesRef.current.get(clientSeq);
    if (!inFlight) return;
    if (inFlight.timeoutId) clearTimeout(inFlight.timeoutId);
    inFlightBatchesRef.current.delete(clientSeq);
    const results = Array.isArray(res?.results) ? res.results : [];
    const byWord = new Map();
    results.forEach((entry) => {
      const norm = normalizeWord(entry?.word || "");
      if (norm) byWord.set(norm, entry);
    });
    inFlight.words.forEach((word) => {
      const result = byWord.get(word) || { word, ok: false, reason: "no_response" };
      applyServerWordResult(word, result);
    });
  }

  function flushPendingBatch() {
    if (!socket.connected || !isLoggedIn) return;
    const activeRoundId = roundIdRef.current;
    if (!activeRoundId) return;
    const queue = pendingQueueRef.current;
    if (!Array.isArray(queue) || queue.length === 0) return;

    const unique = [];
    const seen = new Set();
    for (const word of queue) {
      if (!word || seen.has(word)) continue;
      seen.add(word);
      unique.push(word);
    }
    pendingQueueRef.current = [];
    if (unique.length === 0) return;

    if (batchUnsupportedRef.current) {
      sendFallbackWords(unique, activeRoundId);
      return;
    }

    const clientSeq = batchSeqRef.current++;
    const timeoutId = setTimeout(
      () => handleBatchTimeout(clientSeq),
      WORD_BATCH_ACK_TIMEOUT_MS
    );
    inFlightBatchesRef.current.set(clientSeq, { words: unique, timeoutId });

    const items = unique.map((word) => {
      const meta = submissionStatusRef.current.get(word) || {};
      const path =
        Array.isArray(meta.path) && meta.path.length > 0
          ? meta.path
          : findBestPathForWord(board, word, specialScoreConfig);
      return { word, path };
    });
    const payload = {
      roundId: activeRoundId,
      items,
      clientSeq,
    };
    socket.emit("submitWordsBatch", payload, (res) => {
      handleBatchAck(clientSeq, res);
    });
  }

  function scheduleBatchFlush({ immediate = false } = {}) {
    if (immediate || pendingQueueRef.current.length >= WORD_BATCH_MAX) {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      flushPendingBatch();
      return;
    }
    if (batchTimerRef.current) return;
    batchTimerRef.current = setTimeout(() => {
      batchTimerRef.current = null;
      flushPendingBatch();
    }, WORD_BATCH_FLUSH_MS);
  }

  function enqueuePendingWord(word, meta = {}) {
    if (!word) return;
    if (pendingWordsRef.current.has(word)) return;
    pendingWordsRef.current.add(word);
    submissionStatusRef.current.set(word, {
      status: "pending",
      ts: Date.now(),
      ...meta,
    });
    pendingQueueRef.current.push(word);
    touchSubmissionState();
    scheduleBatchFlush();
  }

  function applyLocalWordScoring({ raw, display, path, markLate = false }) {
    const pts = computeScore(raw, path, board, specialScoreConfig);
    const displayStr = display || raw.toUpperCase();
    const now = Date.now();

    if (markLate) {
      if (!lateWordsRef.current.has(raw)) {
        lateWordsRef.current.set(raw, { raw: displayStr, pts, ts: now });
      }
    }

    setScore((s) => s + pts);
    acceptedScoresRef.current.set(raw, pts);
    pushWordHistory(raw);

    const wordBonuses = summarizeBonuses(path, board);
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    if (isTargetRoundNow) {
      setFoundTargetThisRound(true);
      setFoundTargetWord(raw);
      triggerConfettiBurst("target");
    }
    setLastWords((prev) => {
      const feedLabel = isTargetRoundNow ? "gobble" : null;
      const next = [
        { id: now, ts: now, display: displayStr, pts, label: feedLabel, bonuses: wordBonuses },
        ...prev,
      ];
      return next.slice(0, 24);
    });

    const wordLen = normalizeWord(displayStr || raw || "").length || 3;

    playScoreSound(pts);
    maybeAnnounceBestWord(nickname.trim() || "Moi", displayStr || raw, pts);
    const isSpeedRound = specialRound?.type === "speed";
    const maxPossiblePts = bestGridMaxRef.current || 0;
    const maxPossibleLen = bestGridMaxLenRef.current || 0;
    const allowScoreGobble = !isSpeedRound;
    const allowLenGobble = true;
    const isGobbleNow =
      (allowScoreGobble && maxPossiblePts > 0 && pts === maxPossiblePts) ||
      (allowLenGobble && maxPossibleLen > 0 && wordLen === maxPossibleLen);

    if (isGobbleNow) {
      playGobbleVoice();
      triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
      triggerConfettiBurst("gobble");
    } else if (pts > 29) {
      triggerPraiseFlash("EPIQUE !", { kind: "epic", shakeGrid: true });
    } else if (pts > 19) {
      triggerPraiseFlash("ENORME !", { kind: "gold", shakeGrid: true });
    } else if (pts > 9) {
      triggerPraiseFlash("FABULEUX !", { kind: "purple" });
    } else if (pts > 5) {
      triggerPraiseFlash("EXCELLENT !", { kind: "blue" });
    }
    if (pts >= BIG_SCORE_THRESHOLD) {
      triggerBigScoreFlash(pts);
    }
    showToast(`+${pts} pts`);

    setAccepted((prev) => {
      const updated = [...prev, raw];
      acceptedRef.current = updated;
      return updated;
    });

    setStatusMessageWithHold(`+${pts} pts`);
    clearSelection();
  }

  function submit()  {
  if (inputLocked) return;
  if (typeof window !== "undefined") {
    window.scrollTo(0, 0);
  }

  if (foundTargetThisRound) {
    return error("Tu as déjà trouvé !");
  }
    
    const display = currentTilesRef.current.join("");
    const raw = normalizeWord(display);

    if (!raw || raw.length < 2) return error("Mot trop court");
    if (!dictionary || !dictionary.has(raw)) return error("Absent du dico");
    if (acceptedRef.current.includes(raw)) return error("D\u00e9j\u00e0 trouv\u00e9");
    if (pendingWordsRef.current.has(raw)) return error("D\u00e9j\u00e0 envoy\u00e9");
    if (submissionStatusRef.current.get(raw)?.status === "rejected") {
      return error("D\u00e9j\u00e0 tent\u00e9");
    }

    let path;
    const touchContext =
      lastInputMode === "touch" || (isTouchDeviceRef.current && lastInputMode !== "keyboard");
    const usesManualPath = touchContext || lastInputMode === "mouse";

    if (usesManualPath) {
      path = highlightPath;
      if (!path || path.length === 0) return error("Mot absent de la grille");
    } else {
      path = findBestPathForWord(board, raw, specialScoreConfig);
      if (!path) return error("Mot absent de la grille");
      setHighlightPath(path);
    }

    const allowLateLocal =
      outroInFlightRef.current && Boolean(pendingRoundEndRef.current);
    if (allowLateLocal) {
      applyLocalWordScoring({ raw, display, path, markLate: true });
      return;
    }

    // Mode en ligne : envoi optimiste + batch
    if (roundId && socket.connected && isLoggedIn) {
      const isTargetRoundNow =
        specialRound?.type === "target_long" || specialRound?.type === "target_score";
      const optimisticPts = isTargetRoundNow
        ? 0
        : specialRound?.type === "speed" && Number.isFinite(specialRound?.fixedWordScore)
        ? specialRound.fixedWordScore
        : computeScore(raw, path, board, specialScoreConfig);

      enqueuePendingWord(raw, {
        display: display || raw.toUpperCase(),
        path,
        optimisticPts,
      });
      clearSelection();
      return;
    }

    if (roundId && (!socket.connected || !isLoggedIn)) {
      return error("Reconnecte-toi au serveur pour valider");
    }

    // Mode solo local : on garde le scoring existant
    applyLocalWordScoring({ raw, display, path });
  }


  function analyzeWord(word) {
    if (!word) return;
    const path =
      solutionsRef.current.get(word) || findBestPathForWord(board, word, specialScoreConfig);
    if (!path || path.length === 0) {
      setAnalysis(null);
      setHighlightPath([]);
      setHighlightPlayers([]);
      return;
    }
    const bonuses = summarizeBonuses(path, board);
    const pts = computeScore(word, path, board, specialScoreConfig);
    const matchedPlayers = finalResults
      .filter((res) => Array.isArray(res.words) && res.words.some((w) => normalizeWord(w) === normalizeWord(word)))
      .map((res) => res.nick);
    setAnalysis({ word, pts, bonuses });
    setHighlightPath([]); // ne pas afficher le chemin en fin de partie
    setHighlightPlayers(matchedPlayers);
  }

  function getWordFinders(word) {
    if (!word || !Array.isArray(finalResults)) return [];
    const norm = normalizeWord(word);
    if (!norm) return [];
    const found = [];
    const seen = new Set();
    finalResults.forEach((res) => {
      const nick = res?.nick ? String(res.nick).trim() : "";
      if (!nick || seen.has(nick)) return;
      const words = Array.isArray(res.words) ? res.words : [];
      const hit = words.some((w) => normalizeWord(w) === norm);
      if (hit) {
        seen.add(nick);
        found.push(nick);
      }
    });
    return found;
  }

  function openWordInfoModal(word) {
    const clean = String(word || "").trim();
    if (!clean) return;
    const foundBy = getWordFinders(clean);
    setWordInfoModal({ open: true, word: clean, foundBy });
    if (guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_WORD) {
      setGuidedResultsStep(GUIDED_RESULTS_STEPS.TAP_DEFINITION);
    }
  }

  function closeWordInfoModal() {
    setWordInfoModal((prev) => (prev?.open ? { ...prev, open: false } : prev));
  }

  // Chat
  function submitChat(e, forcedText = null) {
    if (e) e.preventDefault();
    const text = (forcedText ?? chatInput).trim();
    if (!text) return;
    if (!chatRulesAccepted) {
      setIsChatRulesOpen(true);
      return;
    }
    const now = Date.now();
    if (now - chatLastSentRef.current < CHAT_MIN_DELAY) return;
    chatLastSentRef.current = now;

    if (!socket.connected) {
      setConnectionError("Connecte-toi au serveur pour envoyer un message.");
      return;
    }

    socket.emit("chat:send", text, (res) => {
      if (!res?.ok) {
        if (res?.error === "muted") {
          showToast("Chat temporairement bloqué");
        } else {
          setConnectionError("Message non envoyé");
        }
      } else {
        setConnectionError("");
      }
    });

    pushChatHistory(text);
    if (!forcedText) setChatInput("");
  }

  function handleChatInputFocus() {
    if (!chatRulesAccepted) {
      setIsChatRulesOpen(true);
    }
  }

  function handleChatInputKeyDown(e) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      cycleChatHistory(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cycleChatHistory(1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitChat(null);
    }
  }

  const usedSet = phase === "playing" ? new Set(highlightPath) : new Set();
  const hintCellSet = React.useMemo(() => {
    if (specialHint?.kind !== "target_long" || !specialHint?.cells?.length) {
      return new Set();
    }
    return new Set(specialHint.cells.filter((idx) => Number.isInteger(idx)));
  }, [specialHint]);
  const hintOutlineCellSet = React.useMemo(() => {
    if (specialHint?.kind !== "target_score" || !specialHint?.cells?.length) {
      return new Set();
    }
    return new Set(specialHint.cells.filter((idx) => Number.isInteger(idx)));
  }, [specialHint]);
  const solvedTargetWord =
    foundTargetThisRound && typeof foundTargetWord === "string"
      ? foundTargetWord.trim()
      : "";
  const shouldDefinitionBlink = definitionBlink && phase === "playing";
  const specialHintDisplay = solvedTargetWord
    ? buildCompletedTargetPattern(specialHint?.pattern || "", solvedTargetWord)
    : specialHint?.pattern || buildTargetBlankPattern(specialHint?.length);
  const isTargetHintRound =
    specialRound?.type === "target_long" || specialRound?.type === "target_score";
  const targetScoreMax =
    specialRound?.type === "target_score"
      ? Number.isFinite(roundStats?.maxPts) && roundStats.maxPts > 0
        ? roundStats.maxPts
        : bestGridMaxRef.current || null
      : null;
  const nextHintSeconds =
    isTargetHintRound &&
    phase === "playing" &&
    Number.isFinite(serverEndsAt) &&
    Number.isFinite(serverRoundDurationMs) &&
    specialHint?.length &&
    !solvedTargetWord
      ? (() => {
          const startAt = serverEndsAt - serverRoundDurationMs;
          if (!Number.isFinite(startAt)) return null;
          const now = getNowServerMs();
          const elapsed = Math.max(0, now - startAt);
          let nextAt = startAt + TARGET_HINT_FIRST_MS;
          if (elapsed >= TARGET_HINT_FIRST_MS) {
            const steps =
              Math.floor((elapsed - TARGET_HINT_FIRST_MS) / TARGET_HINT_STEP_MS) + 1;
            nextAt = startAt + TARGET_HINT_FIRST_MS + steps * TARGET_HINT_STEP_MS;
          }
          const remainingMs = nextAt - now;
          return Math.max(0, Math.ceil(remainingMs / 1000));
        })()
      : null;
  const nextHintLabel =
    nextHintSeconds !== null
      ? `Nouvel indice dans : ${nextHintSeconds}s.`
      : "Nouvel indice dans : -- s.";
  const showSolvedTargetLoupe = Boolean(solvedTargetWord);
  const statusHold = statusHoldRef.current;
  const statusHoldText =
    statusHold?.text && Date.now() < statusHold.until ? statusHold.text : "";
  const currentDisplay = statusHoldText;
        // Mot en cours d'écriture : on prend l'état, et si jamais
  // il est vide on tombe sur la ref (utile pour certains cas tactile)
  const liveWord =
    currentTiles.length > 0
      ? currentTiles.join("")
      : currentTilesRef.current.join("");
  const previewScale = liveWord
    ? clampValue(11 / Math.max(1, liveWord.length), 0.6, 1)
    : 1;
  const previewTotals = React.useMemo(() => {
    if (isTargetHintRound) {
      return { totalWords: null, totalScore: null };
    }
    const totalWords = Number.isFinite(roundStats?.words)
      ? roundStats.words
      : allWords.length > 0
      ? allWords.length
      : null;
    let totalScore = null;
    if (Number.isFinite(roundStats?.totalPts)) {
      totalScore = roundStats.totalPts;
    } else if (allWords.length > 0) {
      totalScore = allWords.reduce((sum, entry) => sum + (entry?.pts || 0), 0);
    }
    return { totalWords, totalScore };
  }, [roundStats, allWords, isTargetHintRound]);
  const currentBonuses = summarizeBonuses(highlightPath, board);
  const wordMultiplier =
    Math.pow(2, currentBonuses.M2 || 0) * Math.pow(3, currentBonuses.M3 || 0);
  const showBonuses =
    !bonusLetterKey &&
    highlightPath.length > 0 &&
    (currentBonuses.L2 ||
      currentBonuses.L3 ||
      currentBonuses.M2 ||
      currentBonuses.M3);
  const chipCompact = currentTiles.length > 10;
  const foundDotStyle = {
    width: "0.4rem",
    height: "0.4rem",
    borderRadius: "9999px",
    backgroundColor: darkMode ? "#f8fafc" : "#0f172a",
    flexShrink: 0,
  };
  const highlightPlayersSet = new Set(highlightPlayers);
  const bestPtsByFoundWord = React.useMemo(() => {
    const map = new Map();
    if (!accepted || accepted.length === 0) return map;
    for (const word of accepted) {
      const norm = normalizeWord(word);
      const path = findBestPathForWord(board, norm, specialScoreConfig);
      if (path) {
        map.set(word, computeScore(norm, path, board, specialScoreConfig));
      }
    }
    return map;
  }, [accepted, board, specialScoreConfig]);

  const pendingWordEntries = React.useMemo(() => {
    const entries = [];
    submissionStatusRef.current.forEach((meta, word) => {
      if (!meta || meta.status === "accepted") return;
      entries.push({
        word,
        status: meta.status || "pending",
        userPts: meta.optimisticPts,
        reason: meta.reason || "",
        ts: meta.ts || 0,
      });
    });
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return entries;
  }, [submissionTick]);

  const pendingStatusMap = React.useMemo(() => {
    const map = new Map();
    pendingWordEntries.forEach((entry) => {
      map.set(entry.word, entry);
    });
    return map;
  }, [pendingWordEntries]);

  const pendingCount = pendingWordEntries.filter((e) => e.status === "pending").length;
  const foundWordsCount = accepted.length + pendingCount;
  const wordsFoundLabel = formatNumber(foundWordsCount) ?? "0";
  const scoreLabel = formatNumber(score) ?? "0";
  const totalWordsLabel = Number.isFinite(previewTotals.totalWords)
    ? formatNumber(previewTotals.totalWords)
    : "?";
  const totalScoreLabel = Number.isFinite(previewTotals.totalScore)
    ? formatNumber(previewTotals.totalScore)
    : "?";
  const showPreviewStatus = Boolean(statusHoldText) && !liveWord;
  const showPreviewStats = !liveWord && !statusHoldText && !isTargetHintRound;
  const vocabDeltaValue = Number.isFinite(vocabRoundDelta) ? Math.max(0, vocabRoundDelta) : 0;
  const vocabHasDelta = vocabDeltaValue > 0;
  const vocabDeltaLabel = vocabHasDelta ? `+${formatNumber(vocabDeltaValue)}` : "inchangé";
  const vocabTotalLabel = Number.isFinite(vocabCount)
    ? `${formatNumber(vocabCount)} mots uniques`
    : vocabLoading
    ? "Calcul en cours..."
    : "\u2014";
  const vocabTotalValue = Number.isFinite(vocabCount) ? vocabCount : 0;
  const vocabLevel = getVocabLevelMeta(vocabTotalValue);
  const vocabProgress = getVocabProgress(vocabTotalValue);
  const vocabPrevValue = vocabHasDelta
    ? Math.max(0, vocabTotalValue - vocabDeltaValue)
    : vocabTotalValue;
  const vocabPrevLevel = getVocabLevelMeta(vocabPrevValue);
  const vocabLevelUp =
    vocabHasDelta && vocabPrevLevel?.key && vocabLevel?.key && vocabPrevLevel.key !== vocabLevel.key;
  const vocabBaseValue = vocabPrevValue;
  const vocabBaseProgress = getVocabProgress(vocabBaseValue);
  const vocabProgressPct = clampValue(vocabProgress.pct * 100, 0, 100);
  const vocabBasePct = clampValue(vocabBaseProgress.pct * 100, 0, 100);
  const vocabDeltaPct = Math.max(0, vocabProgressPct - vocabBasePct);
  const vocabLevelMin = Number.isFinite(vocabLevel?.min) ? vocabLevel.min : 0;
  const vocabLevelMax = Number.isFinite(vocabLevel?.max) ? vocabLevel.max : vocabTotalValue;
  const vocabLevelRange = Math.max(1, vocabLevelMax - vocabLevelMin);
  const vocabLevelProgressPct = clampValue(
    ((vocabTotalValue - vocabLevelMin) / vocabLevelRange) * 100,
    0,
    100
  );
  const vocabCursorStyle = {
    left: `${vocabProgressPct}%`,
    borderTopColor: vocabLevel?.color || (darkMode ? "#f8fafc" : "#0f172a"),
  };
  const vocabImageSrc = vocabLevel?.imageKey ? getImageUrl(vocabLevel.imageKey) : "";
  const renderVocabPanel = ({
    panelClassName = "",
    showDelta = true,
    showHeading = true,
  } = {}) => (
    <div
      className={`flex flex-col items-center ${showDelta ? "gap-3" : "gap-2"} ${panelClassName}`}
    >
      {showHeading ? (
        <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
          Vocabulaire
        </div>
      ) : null}
      {showDelta ? (
        <div className="text-4xl font-black tabular-nums">{vocabDeltaLabel}</div>
      ) : null}
      <div
        className={
          showDelta
            ? "text-xs font-semibold opacity-75 -mt-1"
            : "text-lg font-extrabold tabular-nums"
        }
      >
        {vocabTotalLabel}
      </div>
      <div className="mt-2 w-full max-w-lg flex flex-col items-center gap-2">
        {vocabImageSrc ? (
          <div className="relative">
            <img
              src={vocabImageSrc}
              alt={vocabLevel?.label || "Niveau vocabulaire"}
              className="h-28 sm:h-32 w-auto select-none"
              draggable={false}
            />
            {vocabLevelUp ? (
              <div className="absolute -top-2 -right-3 rotate-6 rounded-full bg-red-500 text-white text-[9px] font-extrabold px-2 py-0.5 shadow-lg animate-pulse">
                nouveau !!
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm font-extrabold uppercase tracking-widest">
            {vocabLevel?.label || "Niveau"}
          </div>
        )}
        <div className="w-full">
          <div className="relative w-full px-1">
            <div
              className={`h-3 rounded-full overflow-hidden ${
                darkMode ? "bg-slate-800/80" : "bg-slate-200/80"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{
                  width: `${showDelta ? vocabBasePct : vocabLevelProgressPct}%`,
                  background: darkMode
                    ? "rgba(248, 250, 252, 0.85)"
                    : "rgba(15, 23, 42, 0.85)",
                }}
              />
              {showDelta && vocabDeltaValue && vocabDeltaValue > 0 ? (
                <div
                  className="absolute inset-y-0 vocab-delta-fill"
                  style={{
                    left: `${vocabBasePct}%`,
                    width: `${vocabDeltaPct}%`,
                  }}
                />
              ) : null}
            </div>
            <div
              className="absolute -top-3"
              style={{
                ...vocabCursorStyle,
                left: showDelta ? vocabCursorStyle.left : `${vocabLevelProgressPct}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className="w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent border-t-[8px]"
                style={{ borderTopColor: vocabCursorStyle.borderTopColor }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const vocabOverlayTotalValue = Number.isFinite(vocabOverlayAnimatedTotal)
    ? vocabOverlayAnimatedTotal
    : 0;
  const vocabOverlayDeltaValue = Number.isFinite(vocabOverlayAnimatedDelta)
    ? vocabOverlayAnimatedDelta
    : 0;
  const vocabOverlayDeltaLabel = `+${formatNumber(vocabOverlayDeltaValue)}`;
  const vocabOverlayTotalLabel = `${formatNumber(vocabOverlayTotalValue)} mots uniques`;
  const vocabOverlayActiveLevel = vocabOverlayImageLevel || getVocabLevelMeta(vocabOverlayTotalValue);
  const vocabOverlayRange = Math.max(
    1,
    (vocabOverlayActiveLevel?.max ?? vocabOverlayTotalValue) -
      (vocabOverlayActiveLevel?.min ?? 0)
  );
  const vocabOverlayCurrentWithin = clampValue(
    vocabOverlayTotalValue - (vocabOverlayActiveLevel?.min ?? 0),
    0,
    vocabOverlayRange
  );
  const vocabOverlayBaseWithin = clampValue(
    vocabOverlayBaseCount - (vocabOverlayActiveLevel?.min ?? 0),
    0,
    vocabOverlayRange
  );
  const vocabOverlayTargetWithin = clampValue(
    vocabOverlayTargetCount - (vocabOverlayActiveLevel?.min ?? 0),
    0,
    vocabOverlayRange
  );
  const vocabOverlayProgressPct = clampValue(
    (vocabOverlayCurrentWithin / vocabOverlayRange) * 100,
    0,
    100
  );
  const vocabOverlayBasePct = clampValue(
    (vocabOverlayBaseWithin / vocabOverlayRange) * 100,
    0,
    100
  );
  const vocabOverlayFinalPct = clampValue(
    (vocabOverlayTargetWithin / vocabOverlayRange) * 100,
    0,
    100
  );
  const vocabOverlayDeltaPct = Math.max(0, vocabOverlayProgressPct - vocabOverlayBasePct);
  const vocabOverlayBaseFillPct = vocabOverlayAbsorbing
    ? vocabOverlayFinalPct
    : vocabOverlayBasePct;
  const vocabOverlayDeltaFillPct = vocabOverlayAbsorbing ? 0 : vocabOverlayDeltaPct;
  const vocabOverlayCursorStyle = {
    left: `${vocabOverlayProgressPct}%`,
    borderTopColor:
      vocabOverlayImageLevel?.color || (darkMode ? "#f8fafc" : "#0f172a"),
  };
  const vocabOverlayImage = vocabOverlayActiveLevel || vocabLevel;
  const vocabOverlayImageSrc = vocabOverlayImage?.imageKey
    ? getImageUrl(vocabOverlayImage.imageKey)
    : "";
  const vocabOverlayImageAlt = vocabOverlayImage?.label || "Niveau vocabulaire";
  const vocabOverlayImageClass =
    vocabOverlayImagePhase === "out"
      ? "vocab-image-fade-out"
      : vocabOverlayImagePhase === "in"
      ? "vocab-image-fade-in"
      : "";
  const vocabOverlayCountClass = vocabOverlayBounce ? "vocab-count-bounce" : "";
  const vocabOverlayAbsorbClass = vocabOverlayAbsorbing ? "vocab-count-absorb" : "";
  const vocabOverlayAbsorbStyle = {
    "--vocab-absorb-x": `${vocabOverlayAbsorbVec.x}px`,
    "--vocab-absorb-y": `${vocabOverlayAbsorbVec.y}px`,
  };
  useEffect(() => {
    if (!vocabOverlayAbsorbing) return undefined;
    const rafId = requestAnimationFrame(() => {
      const deltaEl = vocabOverlayDeltaRef.current;
      const cursorEl = vocabOverlayCursorRef.current;
      if (!deltaEl || !cursorEl) return;
      const deltaRect = deltaEl.getBoundingClientRect();
      const cursorRect = cursorEl.getBoundingClientRect();
      const dx =
        cursorRect.left +
        cursorRect.width / 2 -
        (deltaRect.left + deltaRect.width / 2);
      const dy =
        cursorRect.top +
        cursorRect.height / 2 -
        (deltaRect.top + deltaRect.height / 2);
      setVocabOverlayAbsorbVec({
        x: Math.round(dx),
        y: Math.round(dy),
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [vocabOverlayAbsorbing, vocabOverlayProgressPct, isMobileLayout]);
  const vocabOverlayRankLabel = Number.isFinite(vocabOverlayRank)
    ? `#${vocabOverlayRank}`
    : null;
  const renderVocabOverlayPanel = () => (
    <div className="flex flex-col items-center gap-3">
      <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
        Vocabulaire
      </div>
      <div
        ref={vocabOverlayDeltaRef}
        className={`text-4xl font-black tabular-nums ${vocabOverlayCountClass} ${vocabOverlayAbsorbClass}`}
        style={vocabOverlayAbsorbStyle}
      >
        {vocabOverlayDeltaLabel}
      </div>
      <div className={`text-xs font-semibold opacity-75 -mt-1 ${vocabOverlayCountClass}`}>
        {vocabOverlayTotalLabel}
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em] min-h-[14px]">
        {vocabOverlayShowRanking ? (
          <div className="flex items-center justify-center gap-2 vocab-word-fade-in">
            <span className="opacity-70">Classement : </span>
            <span className="font-bold">
              {Number.isFinite(vocabOverlayRankEnd) ? `#${vocabOverlayRankEnd}` : "—"}
            </span>
            {Number.isFinite(vocabOverlayRankStart) &&
            Number.isFinite(vocabOverlayRankEnd) ? (
              vocabOverlayRankStart - vocabOverlayRankEnd > 0 ? (
                <span className="text-green-500 font-bold flex items-center gap-1">
                  <span aria-hidden="true">?</span>
                  <span>
                    +{vocabOverlayRankStart - vocabOverlayRankEnd}
                  </span>
                </span>
              ) : (
                <span className="opacity-60">—</span>
              )
            ) : (
              <span className="opacity-60">—</span>
            )}
          </div>
        ) : (
          <div
            className={`truncate text-center ${vocabOverlayWordFading ? "vocab-word-fade-out" : ""}`}
          >
            {vocabOverlayCurrentWord || ""}
          </div>
        )}
      </div>
      <div className="mt-2 w-full max-w-lg flex flex-col items-center gap-2">
        {vocabOverlayImageSrc ? (
          <div className="relative">
            <img
              src={vocabOverlayImageSrc}
              alt={vocabOverlayImageAlt}
              className={`h-28 sm:h-32 w-auto select-none ${vocabOverlayImageClass}`}
              draggable={false}
            />
            {vocabOverlayHasLevelUp ? (
              <div className="absolute -top-2 -right-3 rotate-6 rounded-full bg-red-500 text-white text-[9px] font-extrabold px-2 py-0.5 shadow-lg animate-pulse">
                nouveau !!
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm font-extrabold uppercase tracking-widest">
            {vocabOverlayImageAlt}
          </div>
        )}
        <div className="w-full">
          <div className="relative w-full px-1">
            <div
              className={`h-3 rounded-full overflow-hidden ${
                darkMode ? "bg-slate-800/80" : "bg-slate-200/80"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{
                  width: `${vocabOverlayBaseFillPct}%`,
                  background: darkMode
                    ? "rgba(248, 250, 252, 0.85)"
                    : "rgba(15, 23, 42, 0.85)",
                  transition: vocabOverlayAbsorbing
                    ? `width ${VOCAB_OVERLAY_ABSORB_MS}ms ease`
                    : "none",
                }}
              />
              <div
                className="absolute inset-y-0 vocab-delta-fill"
                style={{
                  left: `${vocabOverlayBasePct}%`,
                  width: `${vocabOverlayDeltaFillPct}%`,
                  opacity: vocabOverlayAbsorbing ? 0 : 1,
                  transition: vocabOverlayAbsorbing
                    ? `width ${VOCAB_OVERLAY_ABSORB_MS}ms ease, opacity 0.6s ease`
                    : "none",
                }}
              />
            </div>
            <div
              ref={vocabOverlayCursorRef}
              className="absolute -top-3"
              style={{
                ...vocabOverlayCursorStyle,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className="w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent border-t-[8px]"
                style={{ borderTopColor: vocabOverlayCursorStyle.borderTopColor }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const allWordsMap = new Map(allWords.map((w) => [w.word, w]));
  const isSpeedRound = specialRound?.type === "speed";
  const speedWordScore = isSpeedRound
    ? specialRound?.fixedWordScore ?? SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK
    : null;
  const foundList = acceptedRef.current.map((word) => ({
    word,
    isFound: true,
    status: "accepted",
    userPts: acceptedScoresRef.current.get(word),
    bestPts: allWordsMap.get(word)?.pts ?? bestPtsByFoundWord.get(word),
  }));
  pendingWordEntries.forEach((entry) => {
    if (acceptedRef.current.includes(entry.word)) return;
    foundList.push({
      word: entry.word,
      isFound: entry.status !== "rejected",
      status: entry.status,
      userPts: entry.userPts,
      bestPts: allWordsMap.get(entry.word)?.pts ?? bestPtsByFoundWord.get(entry.word),
      reason: entry.reason,
    });
  });
  const scoreForSort = (entry) =>
    typeof entry.bestPts === "number" ? entry.bestPts : entry.userPts || 0;
  foundList.sort((a, b) => scoreForSort(b) - scoreForSort(a));
  const baseList = allWords.length > 0 ? allWords : foundList;
  const displayList = baseList.map((entry) => ({
    word: entry.word,
    isFound: acceptedRef.current.includes(entry.word),
    status: pendingStatusMap.get(entry.word)?.status || entry.status || "idle",
    reason: pendingStatusMap.get(entry.word)?.reason || entry.reason || "",
    userPts: (() => {
      const raw =
        pendingStatusMap.get(entry.word)?.userPts ??
        acceptedScoresRef.current.get(entry.word);
      if (speedWordScore == null) return raw;
      const status = pendingStatusMap.get(entry.word)?.status || entry.status || "idle";
      const isPending = status === "pending";
      const isFound = acceptedRef.current.includes(entry.word) || isPending;
      return isFound ? speedWordScore : raw;
    })(),
    bestPts:
      speedWordScore == null
        ? typeof entry.pts === "number"
          ? entry.pts
          : entry.bestPts
        : speedWordScore,
  }));
  const flipList = displayList.filter(
    (entry) =>
      entry &&
      (entry.isFound || entry.status === "pending" || entry.status === "rejected")
  );
  const gobbleBadgeUrl = getImageUrl(IMAGE_KEYS.gobbleBadge);
  const isSpeedRoundForResults = specialRound?.type === "speed";
  const gobbleMaxPts = isSpeedRoundForResults
    ? 0
    : displayList.reduce((max, entry) => {
        const pts = entry.bestPts;
        if (!Number.isFinite(pts)) return max;
        return Math.max(max, pts);
      }, 0);
  const gobbleMaxLen = displayList.reduce((max, entry) => {
    const len = normalizeWord(entry.word || "").length;
    return Math.max(max, len);
  }, 0);
  const gobbleCandidates = new Map();
  if (gobbleMaxPts > 0 || gobbleMaxLen > 0) {
    displayList.forEach((entry) => {
      const len = normalizeWord(entry.word || "").length;
      const isBest =
        !isSpeedRoundForResults &&
        Number.isFinite(entry.bestPts) &&
        entry.bestPts === gobbleMaxPts;
      const isLong = len > 0 && len === gobbleMaxLen;
      if (!isBest && !isLong) return;
      gobbleCandidates.set(entry.word, { best: isBest, long: isLong });
    });
  }
  const renderGobbleCandidate = (word) => {
    const meta = gobbleCandidates.get(word);
    if (!meta) return null;
    const count = (meta.best ? 1 : 0) + (meta.long ? 1 : 0);
    if (!count) return null;
    return (
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: count }).map((_, idx) =>
          gobbleBadgeUrl ? (
            <img
              key={`gobble-candidate-${word}-${idx}`}
              src={gobbleBadgeUrl}
              alt="G"
              className="block h-3 w-auto"
              style={{ imageRendering: "auto" }}
            />
          ) : (
            <span
              key={`gobble-candidate-${word}-${idx}`}
              className={darkMode ? "text-white" : "text-black"}
            >
              G
            </span>
          )
        )}
      </span>
    );
  };
  const resultLabelClass = darkMode ? "text-gray-300" : "text-gray-600";
  const resultPillClass = darkMode
    ? "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-gray-100 text-xs sm:text-sm"
    : "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-800 text-xs sm:text-sm";
  const renderEndStatsCard = (className = "", withBg = true) => {
    if (!endStats) return null;
    const themeClasses = darkMode
      ? `${withBg ? "bg-slate-900/90" : "bg-transparent"} border-slate-500 text-gray-100`
      : `${withBg ? "bg-white/90" : "bg-transparent"} border-gray-300 text-gray-900`;

    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    const inResults = serverStatus === "break" || phase === "results";
    const showOverlay = inResults && bc !== null && bc > 0 && bc <= 10;
    const minHeightStyle = inResults
      ? { minHeight: "clamp(240px, 40vh, 380px)" }
      : undefined;
    const longestWordRaw =
      typeof endStats.longestWord?.word === "string" ? endStats.longestWord.word.trim() : "";
    const longestWordLen = longestWordRaw ? normalizeWord(longestWordRaw).length : 0;
    const longestWordScale = clampValue(
      Math.pow(0.94, Math.max(0, longestWordLen - 10)),
      0.58,
      1
    );
    const longestWordStyle = {
      fontSize: `${longestWordScale}em`,
      lineHeight: 1.05,
      letterSpacing: longestWordScale < 0.82 ? "-0.02em" : undefined,
      whiteSpace: "nowrap",
    };

    const specialTypeLabel = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (upcomingSpecial.type === "speed") return "JEU RAPIDE";
      if (upcomingSpecial.type === "monstrous") return "GRILLE MONSTRUEUSE";
      if (upcomingSpecial.type === "target_long") return "MOT LE PLUS LONG";
      if (upcomingSpecial.type === "target_score") return "MEILLEUR MOT";
      if (upcomingSpecial.type === "bonus_letter") return "LETTRE EN OR";
      return String(upcomingSpecial.label || "MANCHE SPECIALE").toUpperCase();
    })();

    const nextRoundLabel = (() => {
      if (breakKind === "tournament_end") return "Nouveau tournoi";
      if (tournament?.nextRound && tournament?.totalRounds) {
        if (tournament.nextRound === tournament.totalRounds) return "Manche finale";
        return `Manche ${tournament.nextRound}`;
      }
      return null;
    })();

    const upcomingSpecialName = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (typeof upcomingSpecial.label === "string" && upcomingSpecial.label.trim()) {
        return upcomingSpecial.label.trim();
      }
      return specialTypeLabel;
    })();

    const selfNickForResults = nicknameRef.current.trim();
    const selfResultEntry =
      selfNickForResults && Array.isArray(finalResults)
        ? finalResults.find((entry) => entry.nick === selfNickForResults)
        : null;
    const showOfflineLabel = !selfResultEntry;

    return (
      <div
        className={`border rounded-xl shadow-xl p-4 text-sm leading-snug space-y-4 relative overflow-hidden ${themeClasses} ${className}`}
        style={minHeightStyle}
      >
        {showOverlay && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center text-center px-4 backdrop-blur-sm pointer-events-none ${
              darkMode ? "bg-black/45 text-white" : "bg-white/65 text-slate-900"
            }`}
          >
            <div className="space-y-2">
               {nextRoundLabel && (
                 <div className="text-xl sm:text-2xl font-black tracking-tight">
                   {nextRoundLabel}
                 </div>
               )}
               {upcomingSpecial?.isSpecial && (
                 <div className="space-y-1">
                   <div className="text-xs font-extrabold tracking-widest text-orange-600 dark:text-orange-300">
                     MANCHE SPECIALE
                   </div>
                   {upcomingSpecialName && (
                     <div className="text-sm font-bold opacity-90">
                       {upcomingSpecialName}
                     </div>
                   )}
                 </div>
               )}
              <div className="text-5xl sm:text-6xl font-black leading-none tabular-nums">
                {bc}s
              </div>
            </div>
          </div>
        )}
        <div className="text-center text-lg font-bold">Bilan</div>
        {showOfflineLabel ? (
          <div className="text-center text-[11px] text-amber-500">
            Vous etiez hors ligne sur cette manche.
          </div>
        ) : null}
        <div className="space-y-4">
          {!isSpeedRound && endStats.bestWord && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className={`${resultLabelClass} text-xs sm:text-sm font-semibold`}>
                  Meilleur mot
                </span>
                <span className="flex items-center gap-2 text-right flex-wrap justify-end">
                  <span className="font-bold break-all text-sm sm:text-base">
                    {endStats.bestWord.word}
                  </span>
                  {endStats.bestWord.word && (
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                        darkMode
                          ? "bg-slate-800 border-slate-600 text-slate-100"
                          : "bg-white border-gray-300 text-gray-700"
                      } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDefinition(endStats.bestWord.word);
                      }}
                      aria-label="Voir la définition"
                      title="Voir la définition"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <line x1="16.65" y1="16.65" x2="21" y2="21" />
                      </svg>
                    </button>
                  )}
                  <span className={`${resultLabelClass} text-xs whitespace-nowrap`}>
                    ({endStats.bestWord.pts} pts)
                  </span>
                </span>
              </div>
              <div className="flex justify-start">
                <span className={`${resultPillClass} break-all`}>{endStats.bestWord.nick}</span>
              </div>
            </div>
          )}
          {endStats.longestWord && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className={`${resultLabelClass} text-xs sm:text-sm font-semibold`}>
                  Mot le plus long
                </span>
                <span className="flex items-center gap-2 text-right justify-end flex-nowrap">
                  <span className="font-bold text-sm sm:text-base" style={longestWordStyle}>
                    {endStats.longestWord.word}
                  </span>
                  {endStats.longestWord.word && (
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                        darkMode
                          ? "bg-slate-800 border-slate-600 text-slate-100"
                          : "bg-white border-gray-300 text-gray-700"
                      } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDefinition(endStats.longestWord.word);
                      }}
                      aria-label="Voir la définition"
                      title="Voir la définition"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <line x1="16.65" y1="16.65" x2="21" y2="21" />
                      </svg>
                    </button>
                  )}
                  <span className={`${resultLabelClass} text-xs whitespace-nowrap`}>
                    ({endStats.longestWord.len} lettres)
                  </span>
                </span>
              </div>
              <div className="flex justify-start items-center gap-2">
                <span className={`${resultPillClass} break-all`}>{endStats.longestWord.nick}</span>
              </div>
            </div>
          )}
          {endStats.mostWords && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className={`${resultLabelClass} text-xs sm:text-sm font-semibold`}>
                  Plus de mots
                </span>
                <span className="font-bold text-sm sm:text-base text-right">
                  {endStats.mostWords.count}
                </span>
              </div>
              <div className="flex justify-start">
                <span className={`${resultPillClass} break-all`}>{endStats.mostWords.nick}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
  const renderTargetSummaryCard = (className = "", withBg = true) => {
    if (!isTargetRound || !targetSummary) return null;
    const themeClasses = darkMode
      ? `${withBg ? "bg-slate-900/90" : "bg-transparent"} border-slate-500 text-gray-100`
      : `${withBg ? "bg-white/90" : "bg-transparent"} border-gray-300 text-gray-900`;

    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    const inResults = serverStatus === "break" || phase === "results";
    const showOverlay = inResults && bc !== null && bc > 0 && bc <= 10;

    const specialTypeLabel = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (upcomingSpecial.type === "speed") return "JEU RAPIDE";
      if (upcomingSpecial.type === "monstrous") return "GRILLE MONSTRUEUSE";
      if (upcomingSpecial.type === "target_long") return "MOT LE PLUS LONG";
      if (upcomingSpecial.type === "target_score") return "MEILLEUR MOT";
      if (upcomingSpecial.type === "bonus_letter") return "LETTRE EN OR";
      return String(upcomingSpecial.label || "MANCHE SPECIALE").toUpperCase();
    })();

    const nextRoundLabel = (() => {
      if (breakKind === "tournament_end") return "Nouveau tournoi";
      if (tournament?.nextRound && tournament?.totalRounds) {
        if (tournament.nextRound === tournament.totalRounds) return "Manche finale";
        return `Manche ${tournament.nextRound}`;
      }
      return null;
    })();

    const upcomingSpecialName = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (typeof upcomingSpecial.label === "string" && upcomingSpecial.label.trim()) {
        return upcomingSpecial.label.trim();
      }
      return specialTypeLabel;
    })();

    const rawWord = typeof targetSummary.word === "string" ? targetSummary.word : "";
    const cleanWord = rawWord.trim();
    const word = cleanWord ? cleanWord.toUpperCase() : "";
    const normWord = cleanWord ? normalizeWord(cleanWord) : "";
    const wordLength = normWord ? normWord.length : 0;
    const targetScore =
      specialRound?.type === "target_score" && normWord && board && board.length
        ? (() => {
            const path = findBestPathForWord(board, normWord, specialScoreConfig);
            if (!path) return null;
            return computeScore(normWord, path, board, specialScoreConfig);
          })()
        : null;

    return (
      <div
        className={`border rounded-xl shadow-xl p-4 text-sm leading-snug space-y-4 relative overflow-hidden ${themeClasses} ${className}`}
      >
        {showOverlay && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center text-center px-4 backdrop-blur-sm ${
              darkMode ? "bg-black/60 text-white" : "bg-white/75 text-slate-900"
            }`}
          >
            <div className="space-y-2">
              {nextRoundLabel && (
                <div className="text-xl sm:text-2xl font-black tracking-tight">
                  {nextRoundLabel}
                </div>
              )}
              {upcomingSpecial?.isSpecial && (
                <div className="space-y-1">
                  <div className="text-xs font-extrabold tracking-widest text-orange-600 dark:text-orange-300">
                    MANCHE SPECIALE
                  </div>
                  {upcomingSpecialName && (
                    <div className="text-sm font-bold opacity-90">
                      {upcomingSpecialName}
                    </div>
                  )}
                </div>
              )}
              <div className="text-6xl sm:text-7xl font-black leading-none tabular-nums">
                {bc}s
              </div>
            </div>
          </div>
        )}
        <div className="text-center text-xs font-semibold tracking-widest text-slate-500">
          LE MOT ETAIT
        </div>
        <div className="text-center text-2xl sm:text-3xl font-black tracking-tight break-all">
          <span className="inline-flex items-center justify-center gap-2">
            <span>{word || "?"}</span>
            {cleanWord ? (
              <button
                type="button"
                className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-gray-300 text-gray-700"
                } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openDefinition(cleanWord);
                }}
                aria-label="Voir la définition"
                title="Voir la définition"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.65" y1="16.65" x2="21" y2="21" />
                </svg>
              </button>
            ) : null}
          </span>
        </div>
        {wordLength ? (
          <div className="text-center text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-300">
            {wordLength} lettres
            {Number.isFinite(targetScore) ? ` · ${formatNumber(targetScore)} pts` : ""}
          </div>
        ) : null}
        <div className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-300 leading-snug">
          {targetDefinition.loading ? (
            <span>Définition en cours...</span>
          ) : targetDefinition.ok && targetDefinition.definition ? (
            <span>{targetDefinition.definition}</span>
          ) : (
            <span>Définition indisponible</span>
          )}
        </div>
      </div>
    );
  };

  // messages visibles dans le chat (dynamique), ancrés en bas
  const blockedInstallIdSet = React.useMemo(
    () => new Set(blockedInstallIds),
    [blockedInstallIds]
  );
  const filteredChatMessages = React.useMemo(() => {
    if (!blockedInstallIdSet.size) return chatMessages;
    return chatMessages.filter((msg) => {
      const authorInstallId = typeof msg.installId === "string" ? msg.installId : "";
      return !authorInstallId || !blockedInstallIdSet.has(authorInstallId);
    });
  }, [chatMessages, blockedInstallIdSet]);
  const visibleMessages = filteredChatMessages.slice(-chatVisibleLimit);
  const lastMessageId =
    visibleMessages[visibleMessages.length - 1]?.id ?? null;

  const selfNick = nickname.trim();
  const blockedCount = blockedInstallIds.length;
  const chatInputDisabled = !chatRulesAccepted;
  const chatInputPlaceholder = chatRulesAccepted
    ? "Écrire un message..."
    : "Accepte les règles pour discuter";
  const blockedEntries = React.useMemo(() => {
    if (!blockedInstallIds.length) return [];
    const labelMap = new Map();
    players.forEach((player) => {
      if (player?.installId && player?.nick) {
        labelMap.set(player.installId, player.nick);
      }
    });
    chatMessages.forEach((msg) => {
      const id = typeof msg.installId === "string" ? msg.installId : "";
      const nick = (msg.nick || msg.author || "").trim();
      if (id && nick) labelMap.set(id, nick);
    });
    return blockedInstallIds.map((id) => ({
      id,
      label: labelMap.get(id) || `Joueur ${id.slice(0, 6)}`,
    }));
  }, [blockedInstallIds, players, chatMessages]);
  const visiblePlayerList = React.useMemo(() => {
    if (!blockedInstallIdSet.size) return players;
    return players.filter((player) => {
      if (!player?.installId) return true;
      return !blockedInstallIdSet.has(player.installId);
    });
  }, [players, blockedInstallIdSet]);
  const playersAlphaList = React.useMemo(() => {
    const safe = Array.isArray(visiblePlayerList) ? visiblePlayerList : [];
    const seen = new Set();
    const entries = [];
    safe.forEach((player) => {
      const nick = player?.nick ? String(player.nick).trim() : "";
      if (!nick || seen.has(nick)) return;
      seen.add(nick);
      entries.push({ nick });
    });
    entries.sort((a, b) => a.nick.localeCompare(b.nick));
    return entries;
  }, [visiblePlayerList]);
  const playersCountForLobby = React.useMemo(() => {
    const safeRooms = Array.isArray(roomsStats) ? roomsStats : [];
    const lobbyRoomId = roomId || getDefaultRoomId();
    const roomEntry = safeRooms.find((entry) => entry?.roomId === lobbyRoomId);
    if (Number.isFinite(roomEntry?.players)) return roomEntry.players;
    if (lobbyPlayersList.length) return lobbyPlayersList.length;
    const safe = Array.isArray(players) ? players : [];
    const seen = new Set();
    safe.forEach((player) => {
      const nick = player?.nick ? String(player.nick).trim() : "";
      if (!nick) return;
      seen.add(nick);
    });
    return seen.size;
  }, [roomsStats, roomId, lobbyPlayersList, players]);
  const botRankingEntries = [];

  function buildRanking() {
    const entries = [];
    const seen = new Set();

    provisionalRanking.forEach((entry) => {
      entries.push({
        nick: entry.nick,
        score: typeof entry.score === "number" ? entry.score : null,
        rank: typeof entry.rank === "number" ? entry.rank : null,
        isDailyChampion: !!entry.isDailyChampion,
      });
      seen.add(entry.nick);
    });

    players.forEach((player) => {
      if (!player?.nick) return;
      if (seen.has(player.nick)) return;
      entries.push({
        nick: player.nick,
        score: typeof player.score === "number" ? player.score : null,
        rank: null,
        isDailyChampion: !!player.isDailyChampion,
      });
      seen.add(player.nick);
    });

    const currentScore = typeof score === "number" ? score : null;
    if (selfNick) {
      const selfEntry = entries.find((entry) => entry.nick === selfNick);
      if (selfEntry) {
        if (
          currentScore !== null &&
          (selfEntry.score === null || currentScore > selfEntry.score)
        ) {
          selfEntry.score = currentScore;
        }
      } else {
        entries.push({ nick: selfNick, score: currentScore, rank: null, isDailyChampion: false });
        seen.add(selfNick);
      }
    }

    if (entries.length === 0) {
      entries.push({
        nick: selfNick || "Moi",
        score: currentScore ?? 0,
        rank: null,
      });
    }

    entries.sort((a, b) => {
      const aRank = typeof a.rank === "number" ? a.rank : Infinity;
      const bRank = typeof b.rank === "number" ? b.rank : Infinity;
      if (aRank !== bRank) return aRank - bRank;
      const aScore = typeof a.score === "number" ? a.score : -Infinity;
      const bScore = typeof b.score === "number" ? b.score : -Infinity;
      if (aScore !== bScore) return bScore - aScore;
      return (a.nick || "").localeCompare(b.nick || "");
    });

    return entries.map((entry, idx) => ({
      ...entry,
      rank: entry.rank ?? idx + 1,
    }));
  }

  const liveRankingSource = buildRanking();
  const dailyEntriesRaw = Array.isArray(dailyBoard?.entries) ? dailyBoard.entries : [];
  const dailyEntries = dailyEntriesRaw.filter((entry) => !entry?.isPalier);
  const dailyWidgetEntries = isMobileLayout ? dailyEntriesRaw : dailyEntries;
  const dailyRankingSource = React.useMemo(() => {
    const base = Array.isArray(dailyWidgetEntries) ? dailyWidgetEntries : [];
    if (!isDailyPlay || !selfNick || !Number.isFinite(score)) return base;
    const hasSelf = base.some(
      (entry) => entry && !entry.isPalier && entry.nick === selfNick
    );
    if (hasSelf) return base;
    const selfEntry = {
      nick: selfNick,
      score,
      wordsCount: Number.isFinite(accepted?.length) ? accepted.length : null,
      installId: installId || null,
      isPalier: false,
      playerKey: installId ? `install:${installId}` : `nick:${selfNick}`,
    };
    const merged = [...base, selfEntry];
    merged.sort((a, b) => {
      const diff = (b?.score || 0) - (a?.score || 0);
      if (diff !== 0) return diff;
      const aPalier = a?.isPalier ? 1 : 0;
      const bPalier = b?.isPalier ? 1 : 0;
      if (aPalier !== bPalier) return aPalier - bPalier;
      return String(a?.nick || "").localeCompare(String(b?.nick || ""));
    });
    return merged;
  }, [dailyWidgetEntries, isDailyPlay, selfNick, score, accepted?.length, installId]);
  const rankingSource = isDailyPlay ? dailyRankingSource : liveRankingSource;

  // Animation FLIP pour la liste de mots (uniquement les mots visibles)
  useEffect(() => {
    // Guard: only run when the list is actually visible in results.
    if (phase !== "results") return;
    if (!Array.isArray(flipList) || flipList.length === 0) return;
    if (!listItemRefs.current || listItemRefs.current.size === 0) return;

    const MAX_FLIP_ITEMS = 120;
    if (flipList.length > MAX_FLIP_ITEMS) {
      // Too many items: skip FLIP (avoid layout thrash).
      prevPositionsRef.current = new Map();
      return;
    }

    const prev = prevPositionsRef.current;
    const hasPrev = prev && prev.size > 0;
    let rafId = 0;

    rafId = requestAnimationFrame(() => {
      const next = new Map();

      flipList.forEach((entry, idx) => {
        const el = listItemRefs.current.get(entry.word);
        if (!el) return;

        const rect = el.getBoundingClientRect();
        next.set(entry.word, rect);

        // Si on a des positions précédentes, on anime les déplacements (FLIP)
        if (hasPrev) {
          const prevRect = prev.get(entry.word);

          if (prevRect) {
            const dx = prevRect.left - rect.left;
            const dy = prevRect.top - rect.top;

            if (dx !== 0 || dy !== 0) {
              el.style.transition = "none";
              el.style.transform = `translate(${dx}px, ${dy}px)`;
              requestAnimationFrame(() => {
                el.style.transition = "transform 220ms ease, opacity 200ms ease";
                el.style.transform = "";
              });
              setTimeout(() => {
                el.style.transition = "";
                el.style.transform = "";
              }, 260);
            }
          } else {
            // Nouvel élément : petite anim d'apparition
            el.style.transition = "none";
            el.style.transform = "translateY(-8px) scale(0.96)";
            el.style.opacity = "0";
            requestAnimationFrame(() => {
              el.style.transition = "transform 220ms ease, opacity 200ms ease";
              el.style.transform = "";
              el.style.opacity = "";
            });
            setTimeout(() => {
              el.style.transition = "";
              el.style.transform = "";
            }, 260);
          }

          const delay = Math.min(idx * 8, 120);
          el.style.transitionDelay = `${delay}ms`;
        }
      });

      // On conserve les positions courantes pour la prochaine transition
      prevPositionsRef.current = next;
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [phase, showAllWords, flipList.length, accepted.length]);

  useEffect(() => {
    if (phase !== "results") {
      // Reset positions when leaving results to avoid stale deltas.
      prevPositionsRef.current = new Map();
    }
  }, [phase]);


  useEffect(() => {
    if (phase === "results") {
      setMobileResultsPage(0);
    }
  }, [phase]);
  useEffect(() => {
    return () => {
      clearResultsSlideTimers();
      if (resultsMetaPulseStartTimerRef.current) {
        clearTimeout(resultsMetaPulseStartTimerRef.current);
        resultsMetaPulseStartTimerRef.current = null;
      }
      if (resultsMetaPulseEndTimerRef.current) {
        clearTimeout(resultsMetaPulseEndTimerRef.current);
        resultsMetaPulseEndTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (phase === "results") return;
    clearResultsSlideTimers();
    if (resultsMetaPulseStartTimerRef.current) {
      clearTimeout(resultsMetaPulseStartTimerRef.current);
      resultsMetaPulseStartTimerRef.current = null;
    }
    if (resultsMetaPulseEndTimerRef.current) {
      clearTimeout(resultsMetaPulseEndTimerRef.current);
      resultsMetaPulseEndTimerRef.current = null;
    }
    setResultsSlidePhase("idle");
    resultsDraggingRef.current = false;
    setResultsMetaPulse(false);
  }, [phase]);
  function buildRankingWindow(list, you, maxTop = 5, context = 2, maxItems = 12) {
    if (list.length <= maxItems) return list;
    const youIdx = list.findIndex((r) => r.nick === you);
    if (youIdx === -1 || youIdx < maxTop + context) {
      return list.slice(0, maxItems);
    }
    const windowStart = Math.max(maxTop, youIdx - context);
    const windowEnd = Math.min(list.length, youIdx + context + 1);
    const tail = list.slice(windowStart, windowEnd);
    const result = [...list.slice(0, maxTop), { gap: true, key: "gap" }, ...tail];
    return result.slice(0, maxItems);
  }

  const rankingList =
    phase === "playing" ? buildRankingWindow(rankingSource, selfNick) : rankingSource;
  const isTargetRound =
    specialRound?.type === "target_long" ||
    specialRound?.type === "target_score" ||
    (phase === "results" && !!targetSummary);
  const guidedResultsEligible =
    !isDailyView && isMobileLayout && phase === "results" && !isTargetRound;
  const guidedResultsPages = guidedResultsEligible ? getResultsPages() : [];
  const guidedResultsPageKey = guidedResultsPages.length
    ? guidedResultsPages[clampValue(mobileResultsPage, 0, guidedResultsPages.length - 1)]
    : null;
  const guidedWordTarget =
    guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_WORD &&
    guidedResultsPageKey === "all" &&
    displayList.length > 0
      ? displayList[1]?.word || displayList[0]?.word
      : null;
  useEffect(() => {
    if (!isMobileLayout || phase !== "results") return;
    const pages = isTargetRound
      ? ["round", "total", "vocab"]
      : ["round", "total", "found", "all", "vocab"];
    setMobileResultsPage((prev) => clampValue(prev, 0, pages.length - 1));
  }, [isMobileLayout, phase, isTargetRound]);

  useEffect(() => {
    if (!isMobileLayout || phase !== "results") return;
    const pages = isTargetRound
      ? ["round", "total", "vocab"]
      : ["round", "total", "found", "all", "vocab"];
    const pageKey = pages[clampValue(mobileResultsPage, 0, pages.length - 1)];
    if (pageKey === "round") setResultsRankingMode("round");
    if (pageKey === "total") setResultsRankingMode("total");
    if (pageKey === "found" && showAllWords) {
      captureListPositions(flipList);
      setShowAllWords(false);
    }
    if (pageKey === "all" && !showAllWords) {
      captureListPositions(flipList);
      setShowAllWords(true);
    }
  }, [isMobileLayout, phase, isTargetRound, mobileResultsPage, showAllWords, flipList]);
  useEffect(() => {
    if (phase !== "playing" || !specialRound?.isSpecial) return;
    if (!installId) return;
    const seenTypes = specialTutorialSeen?.types || {};
    if (seenTypes[specialRound.type]) return;
    if (isSpecialTutorialOpen) return;
    setSpecialTutorialPlan(specialRound);
    setIsSpecialTutorialOpen(true);
  }, [
    phase,
    roundId,
    specialRound,
    specialTutorialSeen,
    installId,
    isSpecialTutorialOpen,
  ]);
  useEffect(() => {
    if (phase === "playing" && specialRound?.isSpecial) return;
    if (isSpecialTutorialOpen) {
      setIsSpecialTutorialOpen(false);
    }
    if (specialTutorialPlan) {
      setSpecialTutorialPlan(null);
    }
  }, [phase, specialRound, isSpecialTutorialOpen, specialTutorialPlan]);
  useEffect(() => {
    if (!guidedResultsEligible || !installId) return;
    if (guidedResultsSeenInstallId === installId) return;
    setGuidedResultsStep((prev) => prev || GUIDED_RESULTS_STEPS.SWIPE_TOTAL);
  }, [guidedResultsEligible, guidedResultsSeenInstallId, installId]);
  useEffect(() => {
    if (!guidedResultsEligible || !guidedResultsStep || !guidedResultsPageKey) return;
    const targetStep = GUIDED_RESULTS_PAGE_TO_STEP[guidedResultsPageKey];
    if (!targetStep) return;
    const currentIndex = GUIDED_RESULTS_STEP_ORDER.indexOf(guidedResultsStep);
    const targetIndex = GUIDED_RESULTS_STEP_ORDER.indexOf(targetStep);
    const maxAutoIndex = GUIDED_RESULTS_STEP_ORDER.indexOf(GUIDED_RESULTS_STEPS.TAP_WORD);
    if (currentIndex === -1 || targetIndex === -1) return;
    if (currentIndex <= maxAutoIndex && targetIndex > currentIndex) {
      setGuidedResultsStep(targetStep);
    }
  }, [guidedResultsEligible, guidedResultsStep, guidedResultsPageKey]);
  const formatTargetTime = (ms) => {
    if (!Number.isFinite(ms)) return "PAS TROUVÉ";
    const seconds = Math.max(0, ms) / 1000;
    return `${seconds.toFixed(1).replace(".", ",")}s`;
  };
  const finalRanking = finalResults.length
    ? [...finalResults]
        .map((entry) => {
          const roundAward = tournamentRoundPoints?.[entry.nick];
          const roundPoints =
            typeof roundAward?.points === "number" ? roundAward.points : null;
          const roundGobbles =
            typeof roundAward?.gobbles === "number" ? roundAward.gobbles : 0;
          if (isTargetRound) {
            const timeMs = Number.isFinite(entry.targetFoundMs) ? entry.targetFoundMs : null;
            return {
              ...entry,
              wordsCount: null,
              roundPoints,
              roundGobbles,
              rightLabel: Number.isFinite(timeMs) ? formatTargetTime(timeMs) : "PAS TROUVÉ",
            };
          }
          return {
            ...entry,
            wordsCount: Array.isArray(entry.words) ? entry.words.length : null,
            roundPoints,
            roundGobbles,
          };
        })
        .sort((a, b) => {
          if (!isTargetRound) return (b.score || 0) - (a.score || 0);
          const aFound = Number.isFinite(a.targetFoundAt);
          const bFound = Number.isFinite(b.targetFoundAt);
          if (aFound && bFound) {
            const d = a.targetFoundAt - b.targetFoundAt;
            if (d !== 0) return d;
            return (a.nick || "").localeCompare(b.nick || "");
          }
          if (aFound) return -1;
          if (bFound) return 1;
          return (a.nick || "").localeCompare(b.nick || "");
        })
    : [];
  const resultsRankingList =
    resultsRankingMode === "total" ? tournamentRanking || [] : finalRanking;
  const livePosition =
    rankingList.find((r) => r.nick === selfNick)?.rank ?? null;
  const mixedFeed = React.useMemo(
    () => buildMixedFeed({ announcements, lastWords }),
    [announcements, lastWords]
  );

  const endStats = React.useMemo(() => {
    if (!finalResults || finalResults.length === 0) return null;
    if (!board || board.length === 0) return null;

    const winner = [...finalResults].sort((a, b) => b.score - a.score)[0];
    let bestWord = null; // { nick, word, pts }
    let longestWord = null; // { nick, word, len }
    let mostWords = null; // { nick, count }
    const getWordTs = (entry, norm) => {
      const map = entry?.wordTimes;
      if (!map || typeof map !== "object") return null;
      const ts = map[norm];
      return Number.isFinite(ts) ? ts : null;
    };

    for (const entry of finalResults) {
      const words = Array.isArray(entry.words) ? entry.words : [];
      if (!mostWords || words.length > mostWords.count) {
        mostWords = { nick: entry.nick, count: words.length };
      }

      for (const raw of words) {
        const norm = normalizeWord(raw);
        const path = findBestPathForWord(board, norm, specialScoreConfig);
        if (!path) continue;
        const pts = computeScore(norm, path, board, specialScoreConfig);
        const wordTs = getWordTs(entry, norm);
        if (
          !bestWord ||
          pts > bestWord.pts ||
          (pts === bestWord.pts &&
            wordTs != null &&
            (!Number.isFinite(bestWord.ts) || wordTs < bestWord.ts))
        ) {
          bestWord = { nick: entry.nick, word: raw, pts, ts: wordTs };
        }
        if (
          !longestWord ||
          norm.length > longestWord.len ||
          (norm.length === longestWord.len &&
            wordTs != null &&
            (!Number.isFinite(longestWord.ts) || wordTs < longestWord.ts))
        ) {
          longestWord = { nick: entry.nick, word: raw, len: norm.length, ts: wordTs };
        }
      }
    }

    return { winner, bestWord, longestWord, mostWords };
  }, [finalResults, board]);

  const gobbleWordAwardsByNick = React.useMemo(() => {
    const map = new Map();
    const addAward = (nick, kind) => {
      if (!nick) return;
      const prev = map.get(nick) || { bestWord: false, longestWord: false };
      if (kind === "bestWord") prev.bestWord = true;
      if (kind === "longestWord") prev.longestWord = true;
      map.set(nick, prev);
    };

    if (endStats?.bestWord?.nick) addAward(endStats.bestWord.nick, "bestWord");
    if (endStats?.longestWord?.nick) addAward(endStats.longestWord.nick, "longestWord");

    if (Array.isArray(announcements)) {
      const startAt = roundStartAtRef.current || 0;
      announcements.forEach((entry) => {
        const nick = entry?.nick;
        const type = entry?.type;
        const rawTs = entry?.ts ?? entry?.id ?? 0;
        const ts = Number.isFinite(rawTs) ? rawTs : Number(rawTs) || 0;
        if (startAt && (!ts || ts < startAt)) return;
        if (!nick || !type) return;
        if (type === "best_possible_score") {
          addAward(nick, "bestWord");
        }
        if (type === "longest_possible") {
          addAward(nick, "longestWord");
        }
      });
    }

    return map;
  }, [endStats, announcements]);
  const gobbleAwardsForLive = phase === "playing" ? gobbleWordAwardsByNick : null;

  const weeklyRecordHighlights = React.useMemo(() => {
    if (phase !== "results") return [];
    if (!weeklyStats || !Array.isArray(finalResults) || finalResults.length === 0) return [];
    const boards = weeklyStats?.boards || {};
    if (!boards || typeof boards !== "object") return [];
    const lastWindow = lastRoundWindowRef.current || {};
    const roundEndAt = Number.isFinite(serverEndsAt)
      ? serverEndsAt
      : Number.isFinite(lastWindow.endAt)
      ? lastWindow.endAt
      : null;
    const roundStartAt =
      Number.isFinite(serverEndsAt) && Number.isFinite(serverRoundDurationMs)
        ? serverEndsAt - serverRoundDurationMs
        : Number.isFinite(lastWindow.startAt)
        ? lastWindow.startAt
        : null;
    if (!Number.isFinite(roundStartAt) || !Number.isFinite(roundEndAt)) return [];
    const timePadMs = 6000;
    const withinRound = (ts) =>
      Number.isFinite(ts) &&
      ts >= roundStartAt - timePadMs &&
      ts <= roundEndAt + timePadMs;
    const findBoardEntry = (key, nick) => {
      const list = Array.isArray(boards[key]) ? boards[key] : [];
      return list.find((entry) => entry?.nick === nick);
    };
    const findBoardRank = (key, nick) => {
      const list = Array.isArray(boards[key]) ? boards[key] : [];
      const idx = list.findIndex((entry) => entry?.nick === nick);
      return idx >= 0 ? idx + 1 : null;
    };
    const records = [];
    const seen = new Set();
    const pushRecord = (record) => {
      const id = `${record.categoryKey}:${record.nick}`;
      if (seen.has(id)) return;
      seen.add(id);
      records.push({ ...record, id });
    };

    if (isTargetRound) {
      const boardKey =
        specialRound?.type === "target_score" ? "bestTimeTargetScore" : "bestTimeTargetLong";
      const categoryLabel = WEEKLY_RECORD_LABELS[boardKey] || "Temps cible";
      for (const entry of finalResults) {
        if (!entry?.nick || entry?.isBot) continue;
        const timeMs = Number.isFinite(entry.targetFoundMs) ? entry.targetFoundMs : null;
        if (!Number.isFinite(timeMs)) continue;
        const weeklyEntry = findBoardEntry(boardKey, entry.nick);
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Math.abs((weeklyEntry.ms ?? 0) - timeMs) <= 5
        ) {
          pushRecord({
            section: "target",
            categoryKey: boardKey,
            categoryLabel,
            nick: entry.nick,
            rank: findBoardRank(boardKey, entry.nick),
            rankTotal: weeklyStats?.topN ?? null,
            timeMs,
            word: weeklyEntry?.word || "",
          });
        }
      }
      return records;
    }

    if (!board || board.length === 0) return [];
    const perPlayerStats = new Map();
    for (const entry of finalResults) {
      if (!entry?.nick || entry?.isBot) continue;
      const words = Array.isArray(entry.words) ? entry.words : [];
      const stats = {
        wordsCount: words.length,
        bestWord: null,
        longestWord: null,
      };
      for (const raw of words) {
        const norm = normalizeWord(raw);
        const path = findBestPathForWord(board, norm, specialScoreConfig);
        if (!path) continue;
        const pts = computeScore(norm, path, board, specialScoreConfig);
        if (!stats.bestWord || pts > stats.bestWord.pts) {
          stats.bestWord = { word: raw, norm, pts };
        }
        if (!stats.longestWord || norm.length > stats.longestWord.len) {
          stats.longestWord = { word: raw, norm, len: norm.length };
        }
      }
      perPlayerStats.set(entry.nick, stats);
    }

    for (const [nick, stats] of perPlayerStats.entries()) {
      if (stats.wordsCount > 0) {
        const weeklyEntry = findBoardEntry("mostWordsInGame", nick);
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.wordsCount) &&
          weeklyEntry.wordsCount === stats.wordsCount
        ) {
          pushRecord({
            section: "round",
            categoryKey: "mostWordsInGame",
            categoryLabel: WEEKLY_RECORD_LABELS.mostWordsInGame,
            nick,
            rank: findBoardRank("mostWordsInGame", nick),
            rankTotal: weeklyStats?.topN ?? null,
            wordsCount: stats.wordsCount,
          });
        }
      }

      if (stats.bestWord) {
        const weeklyEntry = findBoardEntry("bestWord", nick);
        const normWord = String(stats.bestWord.norm || "").toLowerCase();
        const weeklyWord = String(weeklyEntry?.word || "").toLowerCase();
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.pts) &&
          weeklyEntry.pts === stats.bestWord.pts &&
          normWord &&
          normWord === weeklyWord
        ) {
          pushRecord({
            section: "round",
            categoryKey: "bestWord",
            categoryLabel: WEEKLY_RECORD_LABELS.bestWord,
            nick,
            rank: findBoardRank("bestWord", nick),
            rankTotal: weeklyStats?.topN ?? null,
            word: stats.bestWord.word,
          });
        }
      }

      if (stats.longestWord) {
        const weeklyEntry = findBoardEntry("longestWord", nick);
        const normWord = String(stats.longestWord.norm || "").toLowerCase();
        const weeklyWord = String(weeklyEntry?.word || "").toLowerCase();
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.len) &&
          weeklyEntry.len === stats.longestWord.len &&
          normWord &&
          normWord === weeklyWord
        ) {
          pushRecord({
            section: "round",
            categoryKey: "longestWord",
            categoryLabel: WEEKLY_RECORD_LABELS.longestWord,
            nick,
            rank: findBoardRank("longestWord", nick),
            rankTotal: weeklyStats?.topN ?? null,
            word: stats.longestWord.word,
          });
        }
      }
    }

    return records;
  }, [
    phase,
    weeklyStats,
    finalResults,
    board,
    specialScoreConfig,
    serverEndsAt,
    serverRoundDurationMs,
    isTargetRound,
    specialRound,
  ]);

  const roundRecordBadges = weeklyRecordHighlights.filter(
    (record) => record.section === "round"
  );
  const targetRecordBadges = weeklyRecordHighlights.filter(
    (record) => record.section === "target"
  );
  const buildRecordBadgeMap = (records) => {
    const map = new Map();
    records.forEach((record) => {
      const nick = record?.nick;
      if (!nick) return;
      const list = map.get(nick) || [];
      list.push(record);
      map.set(nick, list);
    });
    return map;
  };
  const roundRecordBadgesByNick = React.useMemo(
    () => buildRecordBadgeMap(roundRecordBadges),
    [roundRecordBadges]
  );
  const targetRecordBadgesByNick = React.useMemo(
    () => buildRecordBadgeMap(targetRecordBadges),
    [targetRecordBadges]
  );
  const recordBadgesByNickForRound =
    isTargetRound ? targetRecordBadgesByNick : roundRecordBadgesByNick;

  function renderCrownIcon(className = "") {
    return (
      <span
        className={`inline-flex items-center ${
          darkMode ? "text-amber-300" : "text-amber-600"
        } ${className}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M4 6l4.5 3 3.5-4 3.5 4L20 6l-2 10H6L4 6zm3 12h10l.4 2H6.6l.4-2z" />
        </svg>
      </span>
    );
  }

  function renderGobbleBadge(gobbles) {
    const count = Number(gobbles) || 0;
    if (count <= 0) return null;
    const badgeUrl = getImageUrl(IMAGE_KEYS.gobbleBadge);
    const suffix = count > 1 ? `x${count}` : "";
    return (
      <span
        className={`inline-flex items-center justify-center gap-1 h-4 min-w-[16px] px-1 text-[9px] font-black ${
          darkMode ? "text-white" : "text-black"
        }`}
      >
        {badgeUrl ? (
          <img
            src={badgeUrl}
            alt="G"
            className="block h-3 w-auto"
            style={{ imageRendering: "auto" }}
          />
        ) : (
          <span>G</span>
        )}
        {suffix ? <span>{suffix}</span> : null}
      </span>
    );
  }

  const tournamentFinaleSummary = React.useMemo(() => {
    if (
      tournamentSummary &&
      Array.isArray(tournamentSummary.ranking) &&
      tournamentSummary.ranking.length > 0
    ) {
      return tournamentSummary;
    }
    if (Array.isArray(tournamentRanking) && tournamentRanking.length > 0) {
      const getRankingPoints = (entry) =>
        typeof entry.score === "number" ? entry.score : entry.points || 0;
      const getRankingGobbles = (entry) => Number(entry.gobbles) || 0;
      const ranking = [...tournamentRanking]
        .sort((a, b) => {
          const diff = getRankingPoints(b) - getRankingPoints(a);
          if (diff !== 0) return diff;
          const gdiff = getRankingGobbles(b) - getRankingGobbles(a);
          if (gdiff !== 0) return gdiff;
          return (a.nick || "").localeCompare(b.nick || "");
        })
        .map((entry) => ({
          nick: entry.nick,
          points: typeof entry.score === "number" ? entry.score : entry.points || 0,
          gobbles: entry.gobbles ?? null,
          isBot: !!entry.isBot,
          isDailyChampion: !!entry.isDailyChampion,
        }));
      return {
        winnerNick: ranking[0]?.nick || null,
        ranking,
        records: {},
      };
    }
    return null;
  }, [tournamentSummary, tournamentRanking]);

  const tournamentFinaleMedals = React.useMemo(() => {
    const ranking = tournamentFinaleSummary?.ranking;
    if (!Array.isArray(ranking) || !ranking.length) return null;
    const medalOrder = ["gold", "silver", "bronze"];
    const map = {};
    medalOrder.forEach((medal, index) => {
      const entry = ranking[index];
      if (!entry?.nick) return;
      map[entry.nick] = { [medal]: 1 };
    });
    return map;
  }, [tournamentFinaleSummary]);

  const botNickSet = React.useMemo(() => {
    const set = new Set();
    players.forEach((p) => {
      if (p?.isBot && p?.nick) set.add(p.nick);
    });
    lobbyPlayersList.forEach((p) => {
      if (p?.isBot && p?.nick) set.add(p.nick);
    });
    finalResults.forEach((entry) => {
      if (entry?.isBot && entry?.nick) set.add(entry.nick);
    });
    (tournamentRanking || []).forEach((entry) => {
      if (entry?.isBot && entry?.nick) set.add(entry.nick);
    });
    (tournamentFinaleSummary?.ranking || []).forEach((entry) => {
      if (entry?.isBot && entry?.nick) set.add(entry.nick);
    });
    return set;
  }, [players, lobbyPlayersList, finalResults, tournamentRanking, tournamentFinaleSummary]);

  const humanNickSet = React.useMemo(() => {
    const set = new Set();
    players.forEach((p) => {
      if (p?.isBot === false && p?.nick) set.add(p.nick);
    });
    lobbyPlayersList.forEach((p) => {
      if (p?.isBot === false && p?.nick) set.add(p.nick);
    });
    finalResults.forEach((entry) => {
      if (entry?.isBot === false && entry?.nick) set.add(entry.nick);
    });
    (tournamentRanking || []).forEach((entry) => {
      if (entry?.isBot === false && entry?.nick) set.add(entry.nick);
    });
    (tournamentFinaleSummary?.ranking || []).forEach((entry) => {
      if (entry?.isBot === false && entry?.nick) set.add(entry.nick);
    });
    if (selfNick) set.add(selfNick);
    return set;
  }, [players, lobbyPlayersList, finalResults, tournamentRanking, tournamentFinaleSummary, selfNick]);

  function renderMedalsInline(nick, fallbackMedals) {
    const persistentMedals = medals?.[nick] || null;
    if (phase === "results" && breakKind === "tournament_end") {
      const times = [];
      if (tournamentSummaryAt) times.push(tournamentSummaryAt);
      if (tournamentFinaleHoldUntil) times.push(tournamentFinaleHoldUntil);
      if (times.length && getNowServerMs() < Math.max(...times)) {
        if (!persistentMedals) return null;
      }
    }
    const m = persistentMedals || fallbackMedals?.[nick];
    if (!m) return null;
    const toSuperscript = (n) => `x${n}`;

    const parts = [];
    if (m.gold)
      parts.push(
        <span key="gold" className="inline-flex items-start">
          <span aria-hidden="true">{"\u{1F947}"}</span>
          {m.gold > 1 && (
            <sup className="text-[0.6em] leading-none -ml-0.5">{toSuperscript(m.gold)}</sup>
          )}
        </span>
      );
    if (m.silver)
      parts.push(
        <span key="silver" className="inline-flex items-start">
          <span aria-hidden="true">{"\u{1F948}"}</span>
          {m.silver > 1 && (
            <sup className="text-[0.6em] leading-none -ml-0.5">{toSuperscript(m.silver)}</sup>
          )}
        </span>
      );
    if (m.bronze)
      parts.push(
        <span key="bronze" className="inline-flex items-start">
          <span aria-hidden="true">{"\u{1F949}"}</span>
          {m.bronze > 1 && (
            <sup className="text-[0.6em] leading-none -ml-0.5">{toSuperscript(m.bronze)}</sup>
          )}
        </span>
      );

    return parts.length ? (
      <span className="inline-flex items-center gap-0.5">{parts}</span>
    ) : null;
  }

  function renderMedals(nick, entryOrFallback, maybeFallback) {
    const entry =
      entryOrFallback && typeof entryOrFallback === "object" && !Array.isArray(entryOrFallback)
        ? entryOrFallback
        : null;
    const fallbackMedals = Array.isArray(entryOrFallback)
      ? entryOrFallback
      : Array.isArray(maybeFallback)
      ? maybeFallback
      : null;
    const medalsInline = renderMedalsInline(nick, fallbackMedals);
    const crown = entry?.isDailyChampion ? renderCrownIcon() : null;
    if (!medalsInline && !crown) return null;
    return (
      <span className="inline-flex items-center gap-0.5 ml-1">
        {crown}
        {medalsInline}
      </span>
    );
  }

  function renderHumanDot(nick) {
    if (!nick) return null;
    if (botNickSet.has(nick)) return null;
    if (!humanNickSet.has(nick)) return null;
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-orange-400"
        aria-hidden="true"
      />
    );
  }

  function renderNickSuffix(nick, entryOrFallback, maybeFallback) {
    const entry =
      entryOrFallback && typeof entryOrFallback === "object" && !Array.isArray(entryOrFallback)
        ? entryOrFallback
        : null;
    const fallbackMedals = Array.isArray(entryOrFallback)
      ? entryOrFallback
      : Array.isArray(maybeFallback)
      ? maybeFallback
      : null;
    const dot = renderHumanDot(nick);
    const medalsInline = renderMedalsInline(nick, fallbackMedals);
    const crown = entry?.isDailyChampion ? renderCrownIcon() : null;
    if (!dot && !medalsInline && !crown) return null;
    return (
      <span className="inline-flex items-center gap-1 ml-1">
        {crown}
        {dot}
        {medalsInline}
      </span>
    );
  }

  function renderRankDelta(entry) {
    const delta = typeof entry?.delta === "number" ? entry.delta : 0;
    if (!delta) return null;
    const up = delta > 0;
    return (
      <span
        className={`text-[10px] font-black tabular-nums ${
          up ? "text-emerald-600" : "text-red-600"
        }`}
        title={up ? `+${delta} places` : `${delta} places`}
      >
        {up ? "\u25B2" : "\u25BC"}
        {Math.abs(delta)}
      </span>
    );
  }

  function renderBlockedListPanel(className = "") {
    if (!showBlockedList) return null;
    return (
      <div
        className={`mt-2 rounded-lg border px-2 py-2 text-[11px] ${
          darkMode
            ? "bg-slate-900/70 border-slate-600 text-slate-100"
            : "bg-gray-50 border-gray-200 text-gray-700"
        } ${className}`}
      >
        {blockedCount === 0 ? (
          <div className="text-center">Aucun joueur bloqué.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blockedEntries.map((entry) => (
              <div key={entry.id} className="inline-flex items-center gap-2">
                <span className="font-semibold">{entry.label}</span>
                <button
                  type="button"
                  className={`text-[11px] font-semibold ${
                    darkMode ? "text-amber-300" : "text-blue-600"
                  }`}
                  onClick={() => unblockInstallId(entry.id)}
                >
                  Réactiver
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


  // Surbrillance par border-4 interne (plus de ring)
  const gameBlockClasses =
    "p-4 bg-white rounded-xl space-y-3 w-full max-w-md flex-shrink-0 " +
    (activeArea === "game"
      ? "border-4 border-black"
      : "border border-gray-300");

  const chatBlockClasses =
    "bg-white/90 dark:bg-slate-900/80 rounded-xl p-4 w-full max-w-sm flex flex-col h-full " +
    (activeArea === "chat"
      ? "border-4 border-black"
      : "border border-gray-300");
  const activeRoomId = currentRoomId || roomId;
  const activeRoom = ROOM_OPTIONS[activeRoomId] || ROOM_OPTIONS["room-4x4"];
  const isFinaleBanner =
    breakKind === "tournament_end" ||
    (tournament?.round &&
      tournament?.totalRounds &&
      tournament.round === tournament.totalRounds);
  const visualViewport =
    typeof window !== "undefined" ? window.visualViewport : null;
  const visualViewportHeight =
    visualViewport && Number.isFinite(visualViewport.height)
      ? Math.round(visualViewport.height)
      : 0;
  const visualViewportOffsetTop =
    visualViewport && Number.isFinite(visualViewport.offsetTop)
      ? Math.max(0, Math.round(visualViewport.offsetTop))
      : 0;
  const chatTopInsetPx = isFullscreen ? mobileHeaderOffsetPx : 0;
  const useVisualViewportForChat = visualViewportHeight > 0;
  const keyboardInsetReservePx =
    useVisualViewportForChat && isChatOpenMobile && chatKeyboardInsetPx === 0
      ? lastKeyboardInsetRef.current
      : 0;
  const visualViewportHeightForChat = useVisualViewportForChat
    ? Math.max(0, visualViewportHeight - keyboardInsetReservePx)
    : 0;
  const safeTopPx = getSafeTopPx();

  // Surface affichable : hauteur - clavier.
  const chatFallbackBaseHeight = Math.round(
    chatBodyLockHeightRef.current ||
      chatViewportHeight ||
      window.innerHeight ||
      document.documentElement?.clientHeight ||
      visualViewportHeight ||
      0
  );
  const keyboardOpenByVv =
    useVisualViewportForChat &&
    chatFallbackBaseHeight > 0 &&
    Math.abs(chatFallbackBaseHeight - visualViewportHeight) >
      KEYBOARD_INSET_THRESHOLD_PX;
  const visualViewportTopEffective = useVisualViewportForChat
    ? isFullscreen && keyboardOpenByVv
      ? Math.max(visualViewportOffsetTop, safeTopPx)
      : visualViewportOffsetTop
    : 0;
  const chatViewportTopInsetPx = useVisualViewportForChat
    ? Math.max(0, chatTopInsetPx - visualViewportTopEffective)
    : chatTopInsetPx;

  const chatAvailableHeightForViewport = useVisualViewportForChat
    ? Math.max(0, visualViewportHeightForChat - chatViewportTopInsetPx)
    : Math.max(0, Math.round(chatFallbackBaseHeight - chatTopInsetPx));
  const chatViewportTop = useVisualViewportForChat
    ? Math.max(0, visualViewportTopEffective + chatViewportTopInsetPx)
    : Math.max(0, chatTopInsetPx);

  const chatViewportStyle =
    chatAvailableHeightForViewport > 0
      ? {
          top: `${chatViewportTop}px`,
          height: `${chatAvailableHeightForViewport}px`,
          bottom: "auto",
        }
      : chatTopInsetPx
      ? { top: `${Math.max(0, chatTopInsetPx)}px` }
      : undefined;
  const globalChatOverlayStyle =
    !useVisualViewportForChat && chatKeyboardInsetPx > 0
      ? { paddingBottom: `${Math.round(chatKeyboardInsetPx)}px` }
      : undefined;
  const globalChatSheetHeightPx =
    chatAvailableHeightForViewport > 0
      ? clampValue(
          Math.round(chatAvailableHeightForViewport * CHAT_SHEET_HEIGHT_RATIO),
          260,
          chatAvailableHeightForViewport
        )
      : 0;
  const globalChatSheetStyle = globalChatSheetHeightPx
    ? {
        height: `${globalChatSheetHeightPx}px`,
        maxHeight: `${globalChatSheetHeightPx}px`,
      }
    : undefined;
  const previewBarMinHeight = 56;
  const previewTileStyle = {};
  const lightPanelStyle = darkMode ? {} : { backgroundColor: "#ffffff" };
  const lightGridSurfaceStyle = {};
  const clampGridWidth = (raw) => {
    if (!raw || Number.isNaN(raw)) return null;
    const adjusted = raw - 24; // laisse un peu d'air avec les bordures/paddings
    return Math.min(MAX_GRID_WIDTH, Math.max(MIN_GRID_WIDTH, adjusted));
  };
  const clampGridSide = (raw) => {
    if (!raw || Number.isNaN(raw)) return null;
    return Math.min(MAX_GRID_WIDTH, Math.max(MIN_GRID_WIDTH, raw));
  };
  const measuredWidth = clampGridWidth(gridWidth);
  const fallbackWidth = clampGridWidth(
    playColumnRef.current?.getBoundingClientRect?.().width ||
      560
  );
  const playColumnGapPx = isMobileLayout ? 0 : 24;
  const playColumnPaddingPx = isMobileLayout ? 0 : 16;
  const effectiveCountdownHeight = isMobileLayout ? 0 : countdownHeight;
  const effectivePreviewHeight = isMobileLayout
    ? 0
    : Math.max(previewHeight, previewBarMinHeight);
  const availableGridHeight =
    !isMobileLayout && playColumnHeight
      ? Math.max(
          MIN_GRID_WIDTH,
          playColumnHeight -
            effectiveCountdownHeight -
            effectivePreviewHeight -
            playColumnPaddingPx -
            playColumnGapPx * 2
        )
      : null;
  const maxGridSideByHeight = clampGridSide(availableGridHeight);
  const widthCandidate =
    measuredWidth ??
    fallbackWidth ??
    Math.min(MAX_GRID_WIDTH, 360);
  const effectiveGridWidth = maxGridSideByHeight
    ? Math.min(widthCandidate, maxGridSideByHeight)
    : widthCandidate;
  const gapRatio = Math.max(0.08, Math.min(0.18, BASE_GAP_RATIO));
  const innerGridWidth = Math.max(
    0,
    (effectiveGridWidth || 0) - GRID_PADDING_PX
  );
  const tileSizeRaw =
    innerGridWidth > 0
      ? innerGridWidth / (gridSize + gapRatio * (gridSize - 1))
      : BASE_TILE_PX;
  const tileSizePx = Math.max(MIN_TILE_SIZE, tileSizeRaw);
  const tileGapPx = clampValue(tileSizePx * gapRatio, 4, 10);
  const computedGridWidth =
    tileSizePx * gridSize + tileGapPx * (gridSize - 1) + GRID_PADDING_PX;
  const fontScale = 1;
  const tileFontPx = Math.max(14, Math.min(32, tileSizePx * 0.48 * fontScale));
  const countdownLabel = (() => {
    if (phase === "playing") {
      const sec = Math.max(0, tick || 0);
      return `Temps restant : ${sec}s`;
    }
    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    if (bc !== null) {
      if (breakKind === "tournament_end") {
        if (bc === 0) return `Nouveau tournoi dans : ${bc}s`;
        if (bc > 10) return `Nouveau tournoi dans : ${bc}s`;
        return `Nouveau tournoi dans : ${bc}s`;
      }
      if (bc === 0) return `Depart dans : ${bc}s`;
      if (bc > 10) return `Depart dans : ${bc}s`;
      return `Depart dans : ${bc}s`;
    }
    if (serverStatus === "break" || phase === "results") {
      return "Manche terminée, attente de la prochaine manche...";
    }
    return "En attente de la prochaine manche...";
  })();

  const countdownLines = [countdownLabel];

  const tournamentFinaleGateAt = (() => {
    const times = [];
    if (tournamentSummaryAt) times.push(tournamentSummaryAt);
    if (tournamentFinaleHoldUntil) times.push(tournamentFinaleHoldUntil);
    if (!times.length) return null;
    return Math.max(...times);
  })();

  const showTournamentFinale =
    phase === "results" &&
    breakKind === "tournament_end" &&
    (!tournamentFinaleGateAt || getNowServerMs() >= tournamentFinaleGateAt) &&
    tournamentFinaleSummary &&
    Array.isArray(tournamentFinaleSummary.ranking) &&
    tournamentFinaleSummary.ranking.length > 0;
  const prevShowTournamentFinaleRef = useRef(showTournamentFinale);
  const trophyLeague =
    trophyStatus?.league || trophyStatus?.progress?.league || "Bronze";
  const trophyProgress = trophyStatus?.progress || {
    league: trophyLeague,
    currentFloor: 0,
    nextFloor: null,
    pct: 0,
  };
  const trophyPalette = getLeaguePalette(trophyLeague, darkMode);
  const trophyTotalValue = Number.isFinite(trophyStatus?.trophies)
    ? trophyStatus.trophies
    : null;
  const trophyDeltaValue = Number.isFinite(trophyStatus?.lastDelta)
    ? trophyStatus.lastDelta
    : Number.isFinite(trophyHistory?.[0]?.delta)
    ? trophyHistory[0].delta
    : 0;
  const trophyDeltaLabel =
    trophyDeltaValue > 0
      ? `+${trophyDeltaValue}`
      : `${trophyDeltaValue}`;
  const trophyProgressLabel =
    Number.isFinite(trophyTotalValue) && Number.isFinite(trophyProgress.nextFloor)
      ? `${formatNumber(trophyTotalValue)} / ${formatNumber(trophyProgress.nextFloor)}`
      : trophyTotalValue != null
      ? `${formatNumber(trophyTotalValue)}`
      : "\u2014";

  useEffect(() => {
    if (showTournamentFinale && !tournamentCelebrationPlayedRef.current) {
      playTournamentCelebrationSound();
      triggerConfettiBurst("tournament");
      tournamentCelebrationPlayedRef.current = true;
    }
    if (!showTournamentFinale) {
      tournamentCelebrationPlayedRef.current = false;
    }
  }, [showTournamentFinale]);

  useEffect(() => {
    if (showTournamentFinale && !prevShowTournamentFinaleRef.current && definitionModal.open) {
      closeDefinition();
    }
    prevShowTournamentFinaleRef.current = showTournamentFinale;
  }, [showTournamentFinale, definitionModal.open]);

  useEffect(() => {
    if (!showTournamentFinale) return;
    setFinalePage(0);
    if (finaleScrollRef.current) {
      finaleScrollRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [showTournamentFinale]);

  useEffect(() => {
    if (!showTournamentFinale) return;
    if (!trophyStatus) {
      void requestTrophyStatus();
    }
  }, [showTournamentFinale, trophyStatus]);

  const chatRulesModal = isChatRulesOpen ? (
    <div
      className="fixed inset-0 z-[20060] flex items-center justify-center bg-black/50 px-4"
      onClick={cancelChatRules}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${
          darkMode
            ? "bg-slate-900 text-slate-100 border-slate-600"
            : "bg-white text-slate-900 border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-extrabold">Règles du chat</div>
        <ul className="mt-3 text-[13px] space-y-1">
          <li>Respectez les autres joueurs.</li>
          <li>Pas d'insultes ni harcèlement.</li>
          <li>Pas de spam ni pub.</li>
          <li>Pas d'infos personnelles (téléphone, email, adresse, paiement).</li>
          <li>Utilisez "Signaler" en cas d'abus.</li>
        </ul>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
              darkMode
                ? "bg-slate-800 border-slate-600 text-slate-100"
                : "bg-gray-50 border-gray-200 text-slate-900"
            }`}
            onClick={() => {
              playCloseSound();
              cancelChatRules();
            }}
          >
            Fermer
          </button>
          <button
            type="button"
            ref={chatRulesConfirmRef}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white"
            onClick={confirmChatRules}
          >
            J'accepte
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const userMenuView = userMenu.open ? (
    <div className="fixed inset-0 z-[20060]" onClick={closeUserMenu}>
      <div
        className={`fixed min-w-[170px] rounded-lg border px-2 py-2 text-xs shadow-lg ${
          darkMode
            ? "bg-slate-900 text-slate-100 border-slate-700"
            : "bg-white text-slate-900 border-slate-200"
        }`}
        style={{ left: `${userMenu.left}px`, top: `${userMenu.top}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-1 pb-1 text-[11px] font-semibold opacity-70">
          {userMenu.nick}
        </div>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition ${
            darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"
          }`}
          onClick={() => {
            blockInstallId(userMenu.installId, userMenu.nick);
            closeUserMenu();
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <line x1="5" y1="19" x2="19" y2="5" />
          </svg>
          Bloquer
        </button>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition ${
            darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"
          }`}
          onClick={() => {
            openReportDialog({
              installId: userMenu.installId,
              nick: userMenu.nick,
              messageId: userMenu.messageId,
            });
            closeUserMenu();
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 5v16" />
            <path d="M4 5h12l-2 4 2 4H4" />
          </svg>
          Signaler
        </button>
        <button
          type="button"
          className={`w-full mt-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
            darkMode
              ? "text-slate-300 hover:text-slate-100"
              : "text-slate-500 hover:text-slate-800"
          }`}
          onClick={closeUserMenu}
        >
          Annuler
        </button>
      </div>
    </div>
  ) : null;

  const reportModal = reportDialog.open ? (
    <div
      className="fixed inset-0 z-[20061] flex items-center justify-center bg-black/50 px-4"
      onClick={closeReportDialog}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${
          darkMode
            ? "bg-slate-900 text-slate-100 border-slate-600"
            : "bg-white text-slate-900 border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-extrabold">Signaler</div>
        <div className="mt-1 text-[11px] opacity-70">
          {reportDialog.reportedNick || "Joueur"}
        </div>
        <div className="mt-3 grid gap-2">
          {REPORT_REASONS.map((reason) => {
            const selected = reportDialog.reason === reason;
            return (
              <button
                key={reason}
                type="button"
                className={`px-3 py-2 rounded-lg border text-xs font-semibold text-left transition ${
                  selected
                    ? darkMode
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-blue-600 border-blue-500 text-white"
                    : darkMode
                    ? "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() =>
                  setReportDialog((prev) => ({ ...prev, reason }))
                }
              >
                {reason}
              </button>
            );
          })}
        </div>
        {reportDialog.reason === "Autre" && (
          <input
            type="text"
            maxLength={120}
            value={reportDialog.details}
            onChange={(e) =>
              setReportDialog((prev) => ({ ...prev, details: e.target.value }))
            }
            className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs ${
              darkMode
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border-slate-200 text-slate-800"
            }`}
            placeholder="Précisez en quelques mots"
          />
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
              darkMode
                ? "bg-slate-800 border-slate-600 text-slate-100"
                : "bg-gray-50 border-gray-200 text-slate-900"
            }`}
            onClick={closeReportDialog}
          >
            Annuler
          </button>
          <button
            type="button"
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-50"
            disabled={!reportDialog.reason}
            onClick={submitReport}
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  ) : null;

  function getWeeklyEntryKey(entry) {
    if (!entry) return "";
    if (entry.playerKey) return entry.playerKey;
    if (entry.nick) return `nick:${String(entry.nick).trim().toLowerCase()}`;
    return "";
  }

  function getWeeklyMetricValue(boardKey, entry) {
    if (!entry) return null;
    if (boardKey === "medals") return Number(entry.total) || 0;
    if (boardKey === "mostWordsInGame") return Number(entry.wordsCount) || 0;
    if (boardKey === "totalScore") return Number(entry.totalScore) || 0;
    if (boardKey === "bestWord") return Number(entry.pts) || 0;
    if (boardKey === "longestWord") return Number(entry.len) || 0;
    if (boardKey === "bestRoundScore") return Number(entry.pts) || 0;
    if (boardKey === "vocab") return Number(entry.vocabCount) || 0;
    if (boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore") {
      return Number(entry.ms) || 0;
    }
    if (boardKey === "mostGobbles") return Number(entry.gobbles) || 0;
    return null;
  }

  function hasWeeklyChanges(boardKey, currentEntries, baselineRankMap, baselineValueMap) {
    if (!baselineRankMap || baselineRankMap.size === 0) return false;
    const isTimeBoard =
      boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
    for (let i = 0; i < currentEntries.length; i += 1) {
      const entry = currentEntries[i];
      const entryKey = getWeeklyEntryKey(entry);
      if (!entryKey) continue;
      const prevRank = baselineRankMap.get(entryKey);
      if (Number.isFinite(prevRank) && prevRank !== i + 1) {
        return true;
      }
      const currentValue = getWeeklyMetricValue(boardKey, entry);
      const baseValue = baselineValueMap?.get(entryKey);
      if (Number.isFinite(currentValue) && Number.isFinite(baseValue)) {
        if (isTimeBoard && currentValue < baseValue) return true;
        if (!isTimeBoard && currentValue > baseValue) return true;
      }
    }
    return false;
  }

  function renderRankDeltaIndicator(delta) {
    if (!delta) return null;
    const up = delta > 0;
    return (
      <span
        className={`text-[10px] font-black tabular-nums ${
          up ? "text-emerald-600" : "text-red-600"
        }`}
        title={up ? `+${delta} places` : `${delta} places`}
      >
        {up ? "\u25B2" : "\u25BC"}
        {Math.abs(delta)}
      </span>
    );
  }

  function useNickTruncation(ref, deps = []) {
    const [isTruncated, setIsTruncated] = useState(false);
    useLayoutEffect(() => {
      const el = ref?.current;
      if (!el) return;
      const check = () => {
        const slack = el.clientWidth - el.scrollWidth;
        setIsTruncated((prev) => {
          if (slack < -1) return true;
          if (prev && slack < 24) return true;
          return false;
        });
      };
      check();
      let ro = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(check);
        ro.observe(el);
      } else if (typeof window !== "undefined") {
        window.addEventListener("resize", check);
      }
      return () => {
        if (ro) ro.disconnect();
        if (typeof window !== "undefined") {
          window.removeEventListener("resize", check);
        }
      };
    }, deps);
    return isTruncated;
  }

  function WeeklyNickLine({ nick, metaLabel, compactMetaLabel, vocabMeta }) {
    const nickRef = useRef(null);
    const isTruncated = useNickTruncation(nickRef, [nick, metaLabel, compactMetaLabel]);
    const useCompact = Boolean(compactMetaLabel) && isTruncated;
    const metaText = useCompact ? compactMetaLabel : metaLabel;
    const metaClass = useCompact
      ? "text-[9px] opacity-60 truncate leading-tight"
      : "text-[10px] opacity-60 truncate";
    const gapClass = useCompact ? "gap-0.5" : "gap-1";

    return (
      <div className={`font-semibold truncate flex items-center ${gapClass} text-xs`}>
        {vocabMeta?.imageKey ? (
          <img
            src={getImageUrl(vocabMeta.imageKey)}
            alt={vocabMeta.label || "Niveau"}
            className="h-5 w-5 shrink-0"
            draggable={false}
          />
        ) : null}
        <span ref={nickRef} className="truncate">
          {nick}
        </span>
        {metaText ? <span className={metaClass}>{metaText}</span> : null}
      </div>
    );
  }

  function renderWeeklyRow(boardKey, entry, idx, { showVocabIcon = false } = {}) {
    if (!entry) return null;
    const rank = idx + 1;
    const isTotalScoreBoard = boardKey === "totalScore";
    const achieved = entry.achievedAt
      ? isTotalScoreBoard
        ? formatWeeklyDayTime(entry.achievedAt)
        : formatWeeklyDate(entry.achievedAt)
      : null;
    const baseNick = entry.nick || "Joueur";
    const vocabEntryKey =
      entry.playerKey || (entry.nick ? String(entry.nick).trim().toLowerCase() : null);
    const vocabCountForRow =
      vocabEntryKey && weeklyVocabLookup.has(vocabEntryKey)
        ? weeklyVocabLookup.get(vocabEntryKey)
        : null;
    const resolvedVocabCount = Number.isFinite(vocabCountForRow) ? vocabCountForRow : 0;
    const vocabMetaForRow =
      showVocabIcon && boardKey === "vocab" ? getVocabLevelMeta(resolvedVocabCount) : null;

    const valueParts = [];
    if (boardKey === "medals") {
      valueParts.push(`${formatNumber(entry.total) ?? 0}`);
    } else if (boardKey === "mostWordsInGame") {
      valueParts.push(`${formatNumber(entry.wordsCount) ?? 0} mots`);
    } else if (boardKey === "totalScore") {
      valueParts.push(`${formatNumber(entry.totalScore) ?? 0} pts`);
    } else if (boardKey === "bestWord") {
      valueParts.push(`${formatNumber(entry.pts) ?? 0} pts`);
    } else if (boardKey === "longestWord") {
      valueParts.push(`${formatNumber(entry.len) ?? 0} lettres`);
    } else if (boardKey === "bestRoundScore") {
      valueParts.push(`${formatNumber(entry.pts) ?? 0} pts`);
    } else if (boardKey === "vocab") {
      valueParts.push(`${formatNumber(entry.vocabCount) ?? 0} mots`);
    } else if (boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore") {
      valueParts.push(formatMsShort(entry.ms) || "");
    } else if (boardKey === "mostGobbles") {
      valueParts.push(`${formatNumber(entry.gobbles) ?? 0} gobbles`);
    }

    const detailParts = [];
    const compactDetailParts = [];
    if (boardKey === "medals") {
      detailParts.push(`\u{1F947} ${formatNumber(entry.gold) ?? 0}`);
      detailParts.push(`\u{1F948} ${formatNumber(entry.silver) ?? 0}`);
      detailParts.push(`\u{1F949} ${formatNumber(entry.bronze) ?? 0}`);
    }
    if (boardKey === "totalScore" && Number.isFinite(entry.roundsPlayed)) {
      detailParts.push(`${formatNumber(entry.roundsPlayed)} manches`);
      compactDetailParts.push(`${formatNumber(entry.roundsPlayed)} m`);
    }
    const hasWord =
      (boardKey === "bestWord" ||
        boardKey === "longestWord" ||
        boardKey === "bestTimeTargetLong" ||
        boardKey === "bestTimeTargetScore") &&
      entry.word;
    const wordLabel = hasWord ? entry.word : "";
    const wordButton =
      hasWord && entry.word ? (
        <button
          type="button"
          className={`ml-1 inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] ${
            darkMode
              ? "bg-slate-800 border-slate-600 text-slate-100"
              : "bg-white border-gray-300 text-gray-700"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            openDefinition(entry.word);
          }}
          aria-label="Voir la definition"
          title="Voir la definition"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.65" y1="16.65" x2="21" y2="21" />
          </svg>
        </button>
      ) : null;

    const metaTokens = [];
    if (detailParts.length > 0) metaTokens.push(detailParts.join(" \u00b7 "));
    if (achieved) metaTokens.push(achieved);
    const metaLabel = metaTokens.length > 0 ? `\u00b7 ${metaTokens.join(" \u00b7 ")}` : "";
    const compactTokens = [];
    if (compactDetailParts.length > 0) compactTokens.push(compactDetailParts.join(" \u00b7 "));
    if (achieved) compactTokens.push(achieved);
    const compactMetaLabel =
      compactTokens.length > 0
        ? `\u00b7 ${compactTokens.join(" \u00b7 ")}`
        : metaLabel;
    const selfNickLower = selfNick ? String(selfNick).trim().toLowerCase() : "";
    const entryNickLower = entry.nick ? String(entry.nick).trim().toLowerCase() : "";
    const isSelfEntry =
      (installId && entry.installId && entry.installId === installId) ||
      (installId && entry.playerKey && entry.playerKey === `install:${installId}`) ||
      (selfNickLower && entryNickLower && entryNickLower === selfNickLower) ||
      (selfNickLower && entry.playerKey && entry.playerKey === `nick:${selfNickLower}`);

    return (
      <div
        key={`${boardKey}-${entry.playerKey || entry.word || entry.roundId || idx}`}
        className={`flex items-center justify-between gap-2 py-1 border-b border-slate-200/60 dark:border-white/10 last:border-0 ${
          isSelfEntry
            ? darkMode
              ? "bg-emerald-900/30 text-emerald-100"
              : "bg-emerald-50 text-emerald-800"
            : ""
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 text-center text-xs font-bold text-amber-500">{rank}</span>
          <div className="min-w-0">
            <WeeklyNickLine
              nick={baseNick}
              metaLabel={metaLabel}
              compactMetaLabel={isTotalScoreBoard ? compactMetaLabel : null}
              vocabMeta={vocabMetaForRow}
            />
            {hasWord ? (
              <div className="text-[10px] opacity-60 truncate flex items-center gap-1">
                <button
                  type="button"
                  className="truncate font-semibold hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDefinition(wordLabel);
                  }}
                >
                  {wordLabel}
                </button>
                {wordButton}
              </div>
            ) : null}
          </div>
        </div>
        <div className="text-right text-sm font-bold tabular-nums whitespace-nowrap">
          {valueParts.join(" ")}
        </div>
      </div>
    );
  }

  function renderFinaleWeeklyRow(
    boardKey,
    entry,
    idx,
    {
      showVocabIcon = false,
      baselineRankMap = null,
      baselineValueMap = null,
      showChanges = false,
    } = {}
  ) {
    if (!entry) return null;
    const rank = idx + 1;
    const isTotalScoreBoard = boardKey === "totalScore";
    const achieved = entry.achievedAt
      ? isTotalScoreBoard
        ? formatWeeklyDayTime(entry.achievedAt)
        : formatWeeklyDate(entry.achievedAt)
      : null;
    const baseNick = entry.nick || "Joueur";
    const entryKey = getWeeklyEntryKey(entry);
    const vocabEntryKey =
      entry.playerKey || (entry.nick ? String(entry.nick).trim().toLowerCase() : null);
    const vocabCountForRow =
      vocabEntryKey && weeklyVocabLookup.has(vocabEntryKey)
        ? weeklyVocabLookup.get(vocabEntryKey)
        : null;
    const resolvedVocabCount = Number.isFinite(vocabCountForRow) ? vocabCountForRow : 0;
    const vocabMetaForRow =
      showVocabIcon && boardKey === "vocab" ? getVocabLevelMeta(resolvedVocabCount) : null;

    const valueParts = [];
    if (boardKey === "medals") {
      valueParts.push(`${formatNumber(entry.total) ?? 0}`);
    } else if (boardKey === "mostWordsInGame") {
      valueParts.push(`${formatNumber(entry.wordsCount) ?? 0} mots`);
    } else if (boardKey === "totalScore") {
      valueParts.push(`${formatNumber(entry.totalScore) ?? 0} pts`);
    } else if (boardKey === "bestWord") {
      valueParts.push(`${formatNumber(entry.pts) ?? 0} pts`);
    } else if (boardKey === "longestWord") {
      valueParts.push(`${formatNumber(entry.len) ?? 0} lettres`);
    } else if (boardKey === "bestRoundScore") {
      valueParts.push(`${formatNumber(entry.pts) ?? 0} pts`);
    } else if (boardKey === "vocab") {
      valueParts.push(`${formatNumber(entry.vocabCount) ?? 0} mots`);
    } else if (boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore") {
      valueParts.push(formatMsShort(entry.ms) || "");
    } else if (boardKey === "mostGobbles") {
      valueParts.push(`${formatNumber(entry.gobbles) ?? 0} gobbles`);
    }

    const detailParts = [];
    const compactDetailParts = [];
    if (boardKey === "medals") {
      detailParts.push(`\u{1F947} ${formatNumber(entry.gold) ?? 0}`);
      detailParts.push(`\u{1F948} ${formatNumber(entry.silver) ?? 0}`);
      detailParts.push(`\u{1F949} ${formatNumber(entry.bronze) ?? 0}`);
    }
    if (boardKey === "totalScore" && Number.isFinite(entry.roundsPlayed)) {
      detailParts.push(`${formatNumber(entry.roundsPlayed)} manches`);
      compactDetailParts.push(`${formatNumber(entry.roundsPlayed)} m`);
    }
    const hasWord =
      (boardKey === "bestWord" ||
        boardKey === "longestWord" ||
        boardKey === "bestTimeTargetLong" ||
        boardKey === "bestTimeTargetScore") &&
      entry.word;
    const wordLabel = hasWord ? entry.word : "";
    const wordButton =
      hasWord && entry.word ? (
        <button
          type="button"
          className={`ml-1 inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] ${
            darkMode
              ? "bg-slate-800 border-slate-600 text-slate-100"
              : "bg-white border-gray-300 text-gray-700"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            openDefinition(entry.word);
          }}
          aria-label="Voir la definition"
          title="Voir la definition"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.65" y1="16.65" x2="21" y2="21" />
          </svg>
        </button>
      ) : null;

    const isTimeBoard =
      boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
    const currentValue = getWeeklyMetricValue(boardKey, entry);
    const prevRank =
      entryKey && baselineRankMap ? baselineRankMap.get(entryKey) : null;
    const rankDelta = Number.isFinite(prevRank) ? prevRank - rank : 0;
    const baseValue =
      entryKey && baselineValueMap ? baselineValueMap.get(entryKey) : null;
    let deltaLabel = null;
    if (showChanges && Number.isFinite(currentValue) && Number.isFinite(baseValue)) {
      if (isTimeBoard && currentValue < baseValue) {
        const deltaSec = Math.max(0, Math.round((baseValue - currentValue) / 1000));
        if (deltaSec > 0) deltaLabel = `-${deltaSec}s`;
      }
      if (!isTimeBoard && currentValue > baseValue) {
        const deltaVal = Math.round(currentValue - baseValue);
        if (deltaVal > 0) deltaLabel = `+${deltaVal}`;
      }
    }

    const metaTokens = [];
    if (detailParts.length > 0) metaTokens.push(detailParts.join(" \u00b7 "));
    if (achieved) metaTokens.push(achieved);
    const metaLabel = metaTokens.length > 0 ? `\u00b7 ${metaTokens.join(" \u00b7 ")}` : "";
    const compactTokens = [];
    if (compactDetailParts.length > 0) compactTokens.push(compactDetailParts.join(" \u00b7 "));
    if (achieved) compactTokens.push(achieved);
    const compactMetaLabel =
      compactTokens.length > 0
        ? `\u00b7 ${compactTokens.join(" \u00b7 ")}`
        : metaLabel;
    const selfNickLower = selfNick ? String(selfNick).trim().toLowerCase() : "";
    const entryNickLower = entry.nick ? String(entry.nick).trim().toLowerCase() : "";
    const isSelfEntry =
      (installId && entry.installId && entry.installId === installId) ||
      (installId && entry.playerKey && entry.playerKey === `install:${installId}`) ||
      (selfNickLower && entryNickLower && entryNickLower === selfNickLower) ||
      (selfNickLower && entry.playerKey && entry.playerKey === `nick:${selfNickLower}`);

    return (
      <div
        key={`${boardKey}-${entry.playerKey || entry.word || entry.roundId || idx}`}
        className={`flex items-center justify-between gap-3 py-1 border-b border-slate-200/60 dark:border-white/10 last:border-0 ${
          isSelfEntry
            ? darkMode
              ? "bg-emerald-900/30 text-emerald-100"
              : "bg-emerald-50 text-emerald-800"
            : ""
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-7 text-center text-xs font-bold text-amber-500">{rank}</span>
          <div className="min-w-0">
            <WeeklyNickLine
              nick={baseNick}
              metaLabel={metaLabel}
              compactMetaLabel={isTotalScoreBoard ? compactMetaLabel : null}
              vocabMeta={vocabMetaForRow}
            />
            {hasWord ? (
              <div className="text-[10px] opacity-60 truncate flex items-center gap-1">
                <button
                  type="button"
                  className="truncate font-semibold hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDefinition(wordLabel);
                  }}
                >
                  {wordLabel}
                </button>
                {wordButton}
              </div>
            ) : null}
          </div>
        </div>
        <div className="text-right text-xs font-bold tabular-nums whitespace-nowrap flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {showChanges ? renderRankDeltaIndicator(rankDelta) : null}
            <span>{valueParts.join(" ")}</span>
          </div>
          {deltaLabel ? (
            <span className="text-[10px] font-black tabular-nums text-emerald-600">
              {deltaLabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const weeklyBoardsMeta = WEEKLY_BOARDS;
  const safeWeeklyIndex =
    weeklyActiveIndex >= 0 && weeklyActiveIndex < weeklyBoardsMeta.length ? weeklyActiveIndex : 0;
  const activeWeeklyBoard = weeklyBoardsMeta[safeWeeklyIndex] || weeklyBoardsMeta[0];
  const vocabBoardEntries = Number.isFinite(vocabCount)
    ? [
        {
          nick: selfNick || "Toi",
          vocabCount,
          achievedAt: vocabUpdatedAt || Date.now(),
          playerKey: installId ? `install:${installId}` : null,
        },
      ]
    : [];
  const weeklyBoardData = { ...(weeklyStats?.boards || {}) };
  if (!Array.isArray(weeklyBoardData.vocab) || weeklyBoardData.vocab.length === 0) {
    weeklyBoardData.vocab = vocabBoardEntries;
  }
  const weeklyVocabLookup = new Map();
  const weeklyVocabEntries = Array.isArray(weeklyBoardData.vocab)
    ? weeklyBoardData.vocab
    : [];
  weeklyVocabEntries.forEach((entry) => {
    if (!entry) return;
    const count = Number(entry.vocabCount) || 0;
    if (entry.playerKey) {
      weeklyVocabLookup.set(entry.playerKey, count);
    }
    if (entry.nick) {
      const nickKey = String(entry.nick).trim().toLowerCase();
      if (nickKey) weeklyVocabLookup.set(nickKey, count);
    }
  });
  const weeklyLimit = weeklyStats?.topN || weeklyStats?.limits?.topN || 50;
  const finaleBaselineBoards = tournamentBaselineRef.current.weeklyStats?.boards || {};
  const finaleBaselineRankMaps = {};
  const finaleBaselineValueMaps = {};
  FINALE_WEEKLY_BOARDS.forEach((boardMeta) => {
    const entries = dedupeWeeklyEntries(
      boardMeta.key,
      finaleBaselineBoards[boardMeta.key],
      weeklyLimit
    );
    const rankMap = new Map();
    const valueMap = new Map();
    entries.forEach((entry, idx) => {
      const entryKey = getWeeklyEntryKey(entry);
      if (!entryKey) return;
      rankMap.set(entryKey, idx + 1);
      const value = getWeeklyMetricValue(boardMeta.key, entry);
      if (Number.isFinite(value)) valueMap.set(entryKey, value);
    });
    finaleBaselineRankMaps[boardMeta.key] = rankMap;
    finaleBaselineValueMaps[boardMeta.key] = valueMap;
  });
  const seasonVocabEntries = dedupeWeeklyEntries("vocab", weeklyBoardData.vocab, weeklyLimit);
  const activeWeeklyEntries = activeWeeklyBoard
    ? dedupeWeeklyEntries(activeWeeklyBoard.key, weeklyBoardData[activeWeeklyBoard.key], weeklyLimit)
    : [];
  const weeklyWeekNumber = weeklyStats?.weekStartTs
    ? getISOWeekNumber(new Date(weeklyStats.weekStartTs))
    : getISOWeekNumber(new Date());
  const weeklyOffsetPercent =
    weeklyDragOffset && weeklySlideWidthRef.current
      ? (weeklyDragOffset / weeklySlideWidthRef.current) * 100
      : 0;
  const showWeeklyDots = weeklyBoardsMeta.length > 1;
  const weeklyDots = showWeeklyDots ? (
    <div className="flex items-center justify-center gap-2 py-2">
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(weeklySwipeBlockRef)) return;
          shiftWeeklyBoard(-1);
        }}
        aria-label="Page precedente"
      >
        {"<"}
      </button>
      {weeklyBoardsMeta.map((board, idx) => {
        const isActive = idx === safeWeeklyIndex;
        const dotColor = isActive
          ? darkMode
            ? "bg-slate-100"
            : "bg-slate-900"
          : darkMode
          ? "bg-white/30"
          : "bg-slate-300";
        return (
          <button
            key={board.key}
            type="button"
            className={`h-2.5 w-2.5 rounded-full transition ${dotColor} ${
              isActive ? "scale-110" : ""
            }`}
            aria-label={`Page ${idx + 1}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => {
              if (shouldIgnoreSwipeClick(weeklySwipeBlockRef)) return;
              setWeeklyActiveIndex(idx);
            }}
          />
        );
      })}
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(weeklySwipeBlockRef)) return;
          shiftWeeklyBoard(1);
        }}
        aria-label="Page suivante"
      >
        {">"}
      </button>
    </div>
  ) : null;
  const seasonPages = getSeasonPages();
  const safeSeasonIndex =
    seasonActiveIndex >= 0 && seasonActiveIndex < seasonPages.length ? seasonActiveIndex : 0;
  const seasonOffsetPercent =
    seasonDragOffset && seasonSlideWidthRef.current
      ? (seasonDragOffset / seasonSlideWidthRef.current) * 100
      : 0;
  const showSeasonDots = seasonPages.length > 1;
  const seasonDots = showSeasonDots ? (
    <div className="flex items-center justify-center gap-2 py-2">
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(seasonSwipeBlockRef)) return;
          shiftSeasonPage(-1);
        }}
        aria-label="Page precedente"
      >
        {"<"}
      </button>
      {seasonPages.map((page, idx) => {
        const isActive = idx === safeSeasonIndex;
        const dotColor = isActive
          ? darkMode
            ? "bg-slate-100"
            : "bg-slate-900"
          : darkMode
          ? "bg-white/30"
          : "bg-slate-300";
        return (
          <button
            key={page}
            type="button"
            className={`h-2.5 w-2.5 rounded-full transition ${dotColor} ${
              isActive ? "scale-110" : ""
            }`}
            aria-label={`Page ${idx + 1}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => {
              if (shouldIgnoreSwipeClick(seasonSwipeBlockRef)) return;
              goToSeasonPage(idx);
            }}
          />
        );
      })}
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(seasonSwipeBlockRef)) return;
          shiftSeasonPage(1);
        }}
        aria-label="Page suivante"
      >
        {">"}
      </button>
    </div>
  ) : null;

  const statsHeaderTitle = (
    <div>
      <div className="text-lg font-extrabold">
        {statsTab === "weekly" ? activeWeeklyBoard?.label : "Vocabulaire"}
      </div>
      {statsTab === "weekly" ? (
        <div className="text-xs opacity-70">
          {weeklyWeekNumber ? `Semaine ${weeklyWeekNumber}` : "Semaine en cours"}
          {" - Reset : lundi a minuit"}
        </div>
      ) : null}
    </div>
  );
  const statsHeaderToggle = (
    <div className="flex items-center gap-2">
      <div
        className={`inline-flex rounded-full overflow-hidden border ${
          darkMode ? "border-slate-700" : "border-slate-200"
        }`}
      >
        <button
          type="button"
          onClick={() => setStatsTab("weekly")}
          className={`px-3 py-1 text-xs font-semibold transition ${
            statsTab === "weekly"
              ? darkMode
                ? "bg-blue-700 text-white"
                : "bg-blue-600 text-white"
              : darkMode
              ? "bg-slate-900 text-slate-300"
              : "bg-white text-slate-600"
          }`}
        >
          Hebdo
        </button>
        <button
          type="button"
          onClick={() => {
            setStatsTab("season");
            setSeasonActiveIndex(0);
            setSeasonDragOffset(0);
            setSeasonDragging(false);
          }}
          className={`px-3 py-1 text-xs font-semibold transition ${
            statsTab === "season"
              ? darkMode
                ? "bg-blue-700 text-white"
                : "bg-blue-600 text-white"
              : darkMode
              ? "bg-slate-900 text-slate-300"
              : "bg-white text-slate-600"
          }`}
        >
          Saison
        </button>
      </div>
    </div>
  );

  const weeklyOverlayHeight = mobileLayoutSizing.viewportHeight || 0;
  const weeklyOverlayStyle =
    weeklyOverlayHeight > 0
      ? {
          height: `${Math.round(weeklyOverlayHeight)}px`,
          maxHeight: `${Math.round(weeklyOverlayHeight)}px`,
          minHeight: `${Math.round(weeklyOverlayHeight)}px`,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }
      : {
          height: "100dvh",
          maxHeight: "100dvh",
          minHeight: "100dvh",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        };
  const weeklyStatsOverlay =
    isWeeklyOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[12000] bg-black/70 backdrop-blur-sm flex items-stretch justify-center px-2 sm:px-4 overflow-hidden"
            style={weeklyOverlayStyle}
            onClick={closeWeeklyStatsOverlay}
          >
            <div
              className={`relative w-full max-w-none rounded-2xl border shadow-2xl overflow-hidden flex flex-col min-h-0 ${
                darkMode
                  ? "bg-slate-900/90 border-white/10 text-white"
                  : "bg-white/95 border-slate-200 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleStatsTouchStart}
              onTouchMove={handleStatsTouchMove}
              onTouchEnd={handleStatsTouchEnd}
            >
              <div className="p-4 pb-2 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-70">
                    GOBBLE STATS
                  </div>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                      darkMode
                        ? "bg-slate-800/80 border-white/10 text-slate-100"
                        : "bg-white border-slate-200 text-slate-700"
                    }`}
                    onClick={() => {
                      playCloseSound();
                      closeWeeklyStatsOverlay();
                    }}
                    aria-label="Fermer les stats"
                  >
                    Fermer
                  </button>
                </div>
                <div className="flex items-center justify-start">
                  {statsHeaderToggle}
                </div>
                {statsHeaderTitle}
                {statsTab === "weekly" ? (
                  <div className="mt-2 text-[11px] opacity-70">
                    Slide gauche/droite pour changer de categorie
                  </div>
                ) : null}
              </div>
              {statsTab === "weekly" ? weeklyDots : null}
              {statsTab === "season" ? seasonDots : null}
              {statsTab === "weekly" ? (

              <div className="relative px-2 sm:px-4 pb-4 flex-1 min-h-0">
                <div className="overflow-hidden rounded-2xl border-0 bg-transparent">
                  <div
                    className="flex w-full"
                    style={{
                      transform: `translateX(calc(${safeWeeklyIndex * -100}% + ${weeklyOffsetPercent}%))`,
                      transition: weeklyDragging ? "none" : "transform 0.25s ease-out",
                    }}
                  >
                    {weeklyBoardsMeta.map((board, idx) => {
                      const entries = dedupeWeeklyEntries(board.key, weeklyBoardData[board.key], weeklyLimit);
                      return (
                        <div
                          key={board.key}
                          className="w-full shrink-0 px-0 flex flex-col min-h-0"
                        >
                          <div className="p-4 space-y-3 flex flex-col min-h-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="text-sm font-semibold opacity-80">
                                {board.subtitle || ""}
                              </div>
                              {weeklyStatsLoading && idx === safeWeeklyIndex ? (
                                <div className="text-xs opacity-70">Mise a jour...</div>
                              ) : null}
                              {weeklyStatsError && idx === safeWeeklyIndex ? (
                                <div className="text-xs text-red-400">Erreur ({weeklyStatsError})</div>
                              ) : null}
                            </div>
                            {entries.length > 0 ? (
                              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
                                {entries.map((entry, entryIdx) =>
                                  renderWeeklyRow(board.key, entry, entryIdx)
                                )}
                              </div>
                            ) : (
                              <div className="text-sm opacity-70 py-8 text-center flex-1 min-h-0 flex items-center justify-center">
                                {weeklyStatsLoading && idx === safeWeeklyIndex
                                  ? "Chargement..."
                                  : weeklyStatsError && idx === safeWeeklyIndex
                                  ? "Impossible de recuperer les stats"
                                  : "Pas encore de stats cette semaine."}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              ) : (
                <div className="relative px-2 sm:px-4 pb-4 flex-1 min-h-0">
                  <div className="overflow-hidden rounded-2xl border-0 bg-transparent flex-1 min-h-0">
                    <div
                      className="flex w-full min-h-0"
                      style={{
                        transform: `translateX(calc(${safeSeasonIndex * -100}% + ${seasonOffsetPercent}%))`,
                        transition: seasonDragging ? "none" : "transform 0.25s ease-out",
                      }}
                    >
                      {seasonPages.map((page) => (
                        <div
                          key={page}
                          className="w-full shrink-0 px-0 flex flex-col min-h-0"
                        >
                          {page === "vocab_rank" ? (
                            <div className="p-4 space-y-3 flex flex-col min-h-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="text-sm font-semibold opacity-80">
                                  Mots uniques
                                </div>
                                {weeklyStatsLoading ? (
                                  <div className="text-xs opacity-70">Mise a jour...</div>
                                ) : null}
                                {weeklyStatsError ? (
                                  <div className="text-xs text-red-400">
                                    Erreur ({weeklyStatsError})
                                  </div>
                                ) : null}
                              </div>
                              {seasonVocabEntries.length > 0 ? (
                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
                                  {seasonVocabEntries.map((entry, entryIdx) =>
                                    renderWeeklyRow("vocab", entry, entryIdx, {
                                      showVocabIcon: true,
                                    })
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm opacity-70 py-8 text-center flex-1 min-h-0 flex items-center justify-center">
                                  {weeklyStatsLoading
                                    ? "Chargement..."
                                    : weeklyStatsError
                                    ? "Impossible de recuperer les stats"
                                    : "Pas encore de stats cette saison."}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-4 flex-1 min-h-0">
                              {renderVocabPanel({ showDelta: false, showHeading: false })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  const playersOverlayEntries =
    playersOverlayMode === "snapshot"
      ? playersOverlaySnapshot
      : isLoggedIn
      ? playersAlphaList
      : lobbyPlayersList;
  const activeRoomKey = currentRoomId || roomId;
  const roomMeta = ROOM_OPTIONS[activeRoomKey] || {};
  const lobbyStatusNow = lobbyRoomStatus?.serverNow || Date.now();
  const lobbyRoundRemainingSeconds =
    lobbyRoomStatus?.roundEndsAt && Number.isFinite(lobbyRoomStatus.roundEndsAt)
      ? Math.max(0, Math.round((lobbyRoomStatus.roundEndsAt - lobbyStatusNow) / 1000))
      : null;
  const lobbyBreakRemainingSeconds =
    lobbyRoomStatus?.breakEndsAt && Number.isFinite(lobbyRoomStatus.breakEndsAt)
      ? Math.max(0, Math.round((lobbyRoomStatus.breakEndsAt - lobbyStatusNow) / 1000))
      : null;
  const overlayBreakKind = isLoggedIn ? breakKind : lobbyRoomStatus?.breakKind || null;
  const overlayPhase = isLoggedIn
    ? phase
    : lobbyRoomStatus?.isRoundRunning
    ? "playing"
    : "break";
  const overlayTick = isLoggedIn ? tick : lobbyRoundRemainingSeconds;
  const overlayBreakCountdown = isLoggedIn ? breakCountdown : lobbyBreakRemainingSeconds;
  const roundDurationSeconds = Number.isFinite(serverRoundDurationMs)
    ? Math.max(1, Math.round(serverRoundDurationMs / 1000))
    : Number.isFinite(lobbyRoomStatus?.roundDurationMs)
    ? Math.max(1, Math.round(lobbyRoomStatus.roundDurationMs / 1000))
    : roomMeta.duration ?? DEFAULT_DURATION;
  const roundBreakSeconds = Number.isFinite(lobbyRoomStatus?.breakDurationMs)
    ? Math.max(0, Math.round(lobbyRoomStatus.breakDurationMs / 1000))
    : roomMeta.breakSeconds ?? 45;
  const tournamentTotalRounds = Number.isFinite(tournament?.totalRounds)
    ? tournament.totalRounds
    : Number.isFinite(lobbyRoomStatus?.tournamentTotalRounds)
    ? lobbyRoomStatus.tournamentTotalRounds
    : TOURNAMENT_TOTAL_ROUNDS;
  const tournamentRoundValue =
    typeof tournament?.round === "number" && tournament.round > 0
      ? tournament.round
      : typeof lobbyRoomStatus?.tournamentRound === "number" &&
        lobbyRoomStatus.tournamentRound > 0
      ? lobbyRoomStatus.tournamentRound
      : typeof tournament?.nextRound === "number" && tournament.nextRound > 0
      ? tournament.nextRound
      : null;
  const currentRoundForEta =
    typeof tournament?.round === "number"
      ? tournament.round
      : typeof lobbyRoomStatus?.tournamentRound === "number"
      ? lobbyRoomStatus.tournamentRound
      : tournamentRoundValue || 0;
  const tournamentEtaSeconds = (() => {
    if (!tournamentRoundValue || !tournamentTotalRounds) return null;
    if (overlayBreakKind === "tournament_end") {
      return Number.isFinite(overlayBreakCountdown)
        ? Math.max(0, Math.round(overlayBreakCountdown))
        : null;
    }
    if (overlayPhase === "playing") {
      if (!Number.isFinite(overlayTick)) return null;
      const roundsAfter = Math.max(0, tournamentTotalRounds - Math.max(0, currentRoundForEta));
      return (
        Math.max(0, Math.round(overlayTick)) +
        roundBreakSeconds +
        roundsAfter * (roundDurationSeconds + roundBreakSeconds)
      );
    }
    if (overlayPhase === "results" || overlayPhase === "break") {
      if (!Number.isFinite(overlayBreakCountdown)) return null;
      const roundsLeft = Math.max(0, tournamentTotalRounds - Math.max(0, currentRoundForEta));
      return (
        Math.max(0, Math.round(overlayBreakCountdown)) +
        roundsLeft * (roundDurationSeconds + roundBreakSeconds)
      );
    }
    return null;
  })();
  const tournamentInfoLine =
    tournamentRoundValue && tournamentTotalRounds
      ? `Manche ${tournamentRoundValue}/${tournamentTotalRounds}`
      : null;
  const tournamentEtaLine = Number.isFinite(tournamentEtaSeconds)
    ? `Nouveau mini-tournoi dans ~${formatSecondsShort(tournamentEtaSeconds)}`
    : null;
  const playersOverlay =
    isPlayersOverlayOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[12050] bg-black/60 backdrop-blur-sm flex items-center justify-center px-3 py-6"
            onClick={closePlayersOverlay}
          >
            <div
              className={`relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
                darkMode
                  ? "bg-slate-900/80 border-white/10 text-white"
                  : "bg-white/80 border-slate-200/80 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute top-3 right-3 z-20 rounded-full h-10 w-16 flex items-center justify-center text-base font-bold text-white cursor-pointer pointer-events-auto select-none"
                onClick={() => {
                  playCloseSound();
                  closePlayersOverlay();
                }}
                aria-label="Fermer la liste des joueurs"
              >
                <span className="pointer-events-none">X</span>
              </button>
              <div className="p-4 pb-2">
                <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-70">
                  {playersOverlayMode === "snapshot" ? "Classement en cours" : "Joueurs en jeu"}
                </div>
                <div className="text-lg font-extrabold">
                  Liste des joueurs{playersOverlayEntries.length ? ` (${playersOverlayEntries.length})` : ""}
                </div>
                <div className="text-xs opacity-70">
                  {playersOverlayMode === "snapshot"
                    ? "Photo du classement en cours (figee)"
                    : "Liste alphabetique (sans score)"}
                </div>
                {tournamentInfoLine || tournamentEtaLine ? (
                  <div className="mt-2 text-[11px] font-semibold opacity-80">
                    {tournamentInfoLine ? <div>{tournamentInfoLine}</div> : null}
                    {tournamentEtaLine ? <div>{tournamentEtaLine}</div> : null}
                  </div>
                ) : null}
              </div>
              <div className="px-4 pb-4">
                {playersOverlayEntries.length ? (
                  <div className="max-h-[70vh] overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
                    {playersOverlayEntries.map((entry, idx) => {
                      const nick = entry?.nick ? String(entry.nick) : "";
                      const rank = playersOverlayMode === "snapshot"
                        ? Number.isFinite(entry?.rank)
                          ? entry.rank
                          : idx + 1
                        : null;
                      const score =
                        playersOverlayMode === "snapshot" && typeof entry?.score === "number"
                          ? entry.score
                          : null;
                      return (
                        <div
                          key={`${playersOverlayMode}-${nick || "joueur"}-${idx}`}
                          className="flex items-center justify-between gap-3 py-2 border-b border-slate-200/60 dark:border-white/10 last:border-0"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {playersOverlayMode === "snapshot" ? (
                              <span className="w-6 text-center text-xs font-bold text-amber-500">
                                {rank}
                              </span>
                            ) : null}
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="font-semibold truncate">{nick || "Joueur"}</span>
                              {renderHumanDot(nick)}
                            </div>
                          </div>
                          {playersOverlayMode === "snapshot" ? (
                            <div className="text-right text-xs font-bold tabular-nums whitespace-nowrap">
                              {score != null ? `${score} pts` : "-"}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm opacity-70 py-8 text-center">
                    {!isLoggedIn &&
                    playersOverlayMode === "alpha" &&
                    lobbyPlayersLoading
                      ? "Chargement..."
                      : "Aucun joueur pour le moment."}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const definitionPreview = definitionModal.definition
    ? (() => {
        const text = String(definitionModal.definition).trim();
        if (text.length <= 140) return text;
        return `${text.slice(0, 140).trim()}...`;
      })()
    : "";
  const definitionHint =
    definitionModal.phraseGuess && definitionModal.matchedTitle
      ? `D\u00e9finition trouv\u00e9e pour ${definitionModal.matchedTitle} (li\u00e9 \u00e0 '${definitionModal.word}')`
      : definitionModal.lemmaGuess && definitionModal.lemma
      ? definitionModal.lemmaLabel
        ? `${definitionModal.lemmaLabel} ${definitionModal.lemma}`
        : `Forme conjugu\u00e9e probable - d\u00e9finition de ${definitionModal.lemma}`
      : definitionModal.participleGuess &&
        definitionModal.participleLabel &&
        definitionModal.participleBase
      ? `${definitionModal.participleLabel} ${definitionModal.participleBase}`
      : definitionModal.inflectionGuess &&
        definitionModal.inflectionLabel &&
        definitionModal.inflectionBase
      ? `${definitionModal.inflectionLabel} ${definitionModal.inflectionBase}`
      : "";
  const isLemmaHint = !!(definitionModal.lemmaGuess && definitionModal.lemma);

  const definitionModalView =
    definitionModal.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4"
            style={{ zIndex: 2147483647 }}
            onClick={closeDefinition}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${
                definitionModal.fromWordInfo
                  ? darkMode
                    ? "bg-slate-900 text-slate-100 border-slate-600"
                    : "bg-white text-slate-900 border-slate-200"
                  : darkMode
                  ? "bg-slate-900/80 text-slate-100 border-slate-600"
                  : "bg-white/80 text-slate-900 border-slate-200"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-extrabold">Définition</div>
              <div className="mt-2 text-sm font-semibold">
                {definitionModal.title &&
                definitionModal.title !== definitionModal.word
                  ? `${definitionModal.word} \u2192 ${definitionModal.title}`
                  : definitionModal.word}
              </div>
              {definitionHint ? (
                <div
                  className={`mt-1 opacity-80 ${
                    isLemmaHint ? "text-[10px] italic" : "text-[11px] font-semibold"
                  }`}
                >
                  {definitionHint}
                </div>
              ) : null}
              <div className="mt-3 text-sm">
                {definitionModal.loading ? (
                  <span>Chargement...</span>
                ) : definitionModal.ok && definitionModal.definition ? (
                  <span>{definitionModal.definition}</span>
                ) : (
                  <span>Définition non disponible</span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                {definitionModal.ok &&
                (definitionModal.url || definitionModal.source) ? (
                  definitionModal.url ? (
                    <a
                      href={definitionModal.url}
                      target="_blank"
                      rel="noreferrer"
                      className={darkMode ? "text-amber-300" : "text-blue-600"}
                    >
                      Source :{" "}
                      {definitionModal.source === "wiktionary"
                        ? "Wiktionary"
                        : definitionModal.source === "wikipedia"
                        ? "Wikipedia"
                        : definitionModal.source === "dictionaryapi.dev"
                        ? "Dictionary API"
                        : "Source"}
                    </a>
                  ) : (
                    <span className={darkMode ? "text-amber-300" : "text-blue-600"}>
                      Source :{" "}
                      {definitionModal.source === "wiktionary"
                        ? "Wiktionary"
                        : definitionModal.source === "wikipedia"
                        ? "Wikipedia"
                        : definitionModal.source === "dictionaryapi.dev"
                        ? "Dictionary API"
                        : "Source"}
                    </span>
                  )
                ) : (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(
                      definitionModal.word || ""
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className={darkMode ? "text-amber-300" : "text-blue-600"}
                  >
                    Rechercher sur Google
                  </a>
                )}
                <button
                  type="button"
                  className={`px-2 py-1 rounded border text-[11px] ${
                    darkMode
                      ? "bg-slate-800 border-slate-600 text-slate-100"
                      : "bg-gray-50 border-gray-200 text-slate-900"
                  }`}
                  onClick={() => {
                    playCloseSound();
                    closeDefinition();
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const wordInfoModalView =
    wordInfoModal.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[12040] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 py-6"
            onClick={closeWordInfoModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${
                darkMode
                  ? "bg-slate-900/85 border-white/10 text-white"
                  : "bg-white/85 border-slate-200/80 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute top-3 right-3 z-20 rounded-full h-9 w-12 flex items-center justify-center text-base font-bold text-white cursor-pointer pointer-events-auto select-none"
                onClick={() => {
                  playCloseSound();
                  closeWordInfoModal();
                }}
                aria-label="Fermer"
              >
                <span className="pointer-events-none">X</span>
              </button>
              <div className="p-4 pb-2">
                <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-70">
                  Mot
                </div>
                <div className="text-xl font-extrabold flex items-center gap-2 relative">
                  <span>{wordInfoModal.word}</span>
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] ${
                      darkMode
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : "bg-white border-gray-300 text-gray-700"
                    } ${
                      guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_DEFINITION
                        ? "ring-2 ring-amber-400 guide-pulse"
                        : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDefinition(wordInfoModal.word, { fromWordInfo: true });
                    }}
                    aria-label="Voir la definition"
                    title="Voir la definition"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.65" y1="16.65" x2="21" y2="21" />
                    </svg>
                  </button>
                  {guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_DEFINITION ? (
                    <div
                      className={`absolute -bottom-12 right-0 flex items-center gap-2 rounded-full px-3 py-2 text-[18px] font-semibold shadow-xl pointer-events-none ${
                        darkMode
                          ? "text-slate-100 ring-2 ring-white/10"
                          : "text-slate-900 ring-2 ring-black/10"
                      }`}
                      style={{
                        maxWidth: "360px",
                        backgroundColor: darkMode ? "#0b0f14" : "#ffffff",
                        opacity: 1,
                      }}
                    >
                      La loupe ouvre la définition
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs opacity-70">Trouvé par :</div>
              </div>
              <div className="px-4 pb-4">
                {wordInfoModal.foundBy && wordInfoModal.foundBy.length ? (
                  <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
                    {wordInfoModal.foundBy.map((nick) => (
                      <div
                        key={nick}
                        className="flex items-center gap-2 text-sm font-semibold"
                      >
                        <span>{nick}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm opacity-70 py-4 text-center">
                    Aucun joueur pour ce mot.
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const recordModalRecords =
    Array.isArray(recordModal.records) && recordModal.records.length
      ? recordModal.records
      : recordModal.categoryKey
      ? [recordModal]
      : [];
  const recordModalSubtitle =
    recordModalRecords.length > 1
      ? "Plusieurs categories"
      : recordModalRecords[0]?.categoryLabel || "Record";
  const formatRecordRankLabel = (record) => {
    if (!record) return "Hors classement";
    const rank = record.rank;
    const total = record.rankTotal;
    if (Number.isFinite(rank)) {
      return Number.isFinite(total) ? `#${rank} / ${total}` : `#${rank}`;
    }
    return "Hors classement";
  };
  const formatRecordValueLabel = (record) => {
    if (!record) return "";
    if (record.categoryKey === "bestWord") {
      if (!record.word) return "";
      const pts = Number.isFinite(record.pts) ? ` (${record.pts} pts)` : "";
      return `Mot : ${record.word}${pts}`;
    }
    if (record.categoryKey === "longestWord") {
      if (!record.word) return "";
      const len = Number.isFinite(record.len) ? ` (${record.len} lettres)` : "";
      return `Mot : ${record.word}${len}`;
    }
    if (record.categoryKey === "mostWordsInGame") {
      return Number.isFinite(record.wordsCount)
        ? `Mots : ${record.wordsCount} par manche`
        : "";
    }
    if (
      record.categoryKey === "bestTimeTargetLong" ||
      record.categoryKey === "bestTimeTargetScore"
    ) {
      return Number.isFinite(record.timeMs)
        ? `Temps : ${formatTargetTime(record.timeMs)}`
        : "";
    }
    return "";
  };
  const recordModalView =
    recordModal.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[12060] bg-black/55 backdrop-blur-sm flex items-center justify-center px-4 py-6"
            onClick={closeRecordModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${
                darkMode
                  ? "bg-slate-900/90 border-white/10 text-white"
                  : "bg-white/90 border-slate-200 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute top-3 right-3 z-20 rounded-full h-9 w-12 flex items-center justify-center text-base font-bold text-white cursor-pointer pointer-events-auto select-none"
                onClick={() => {
                  playCloseSound();
                  closeRecordModal();
                }}
                aria-label="Fermer"
              >
                <span className="pointer-events-none">X</span>
              </button>
              <div className="p-4 pb-5 space-y-3">
                <div className="flex justify-center">
                  <span className="record-rainbow px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest">
                    Nouveau record
                  </span>
                </div>
                <div className="text-center text-base font-extrabold">
                  {recordModalSubtitle}
                </div>
                <div className="text-center text-xs">
                  Joueur : <span className="font-semibold">{recordModal.nick || "?"}</span>
                </div>
                {recordModalRecords.length === 1 ? (
                  <>
                    <div className="text-center text-xs opacity-75">
                      Classement hebdo : {formatRecordRankLabel(recordModalRecords[0])}
                    </div>
                    {formatRecordValueLabel(recordModalRecords[0]) ? (
                      <div className="text-center text-sm font-semibold">
                        {formatRecordValueLabel(recordModalRecords[0])}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-2">
                    {recordModalRecords.map((record) => (
                      <div
                        key={record.id || `${record.categoryKey}-${record.nick}`}
                        className={`rounded-xl border px-3 py-2 ${
                          darkMode
                            ? "border-white/10 bg-slate-900/40"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="text-xs font-extrabold">
                          {record.categoryLabel || "Record"}
                        </div>
                        <div className="text-[10px] opacity-70">
                          Classement hebdo : {formatRecordRankLabel(record)}
                        </div>
                        {formatRecordValueLabel(record) ? (
                          <div className="text-[11px] font-semibold">
                            {formatRecordValueLabel(record)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;
  const vocabOverlayClass =
    vocabOverlayPhase === "in"
      ? "vocab-overlay-in"
      : vocabOverlayPhase === "out"
      ? "vocab-overlay-out"
      : "";
  const vocabOverlayView =
    isVocabOverlayOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`fixed inset-0 z-[12040] flex items-center justify-center px-4 py-6 ${vocabOverlayClass}`}
            role="dialog"
            aria-modal="true"
            onClick={skipVocabOverlayAnimation}
          >
            <div
              className={`absolute inset-0 backdrop-blur-sm ${
                darkMode ? "bg-black/55" : "bg-white/65"
              }`}
            />
            <div
              className={`relative w-full max-w-lg rounded-2xl border p-4 shadow-2xl ${
                darkMode
                  ? "bg-slate-900/95 border-slate-700 text-slate-100"
                  : "bg-white/95 border-slate-200 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`absolute top-3 right-3 z-10 rounded-full h-9 px-3 text-xs font-bold border ${
                  darkMode
                    ? "bg-slate-800/80 border-white/10 text-slate-100"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  skipVocabOverlayAnimation();
                }}
                aria-label="Passer l'animation vocabulaire"
              >
                Passer
              </button>
              {renderVocabOverlayPanel()}
            </div>
          </div>,
          document.body
        )
      : null;
  const twoLetterPopupView =
    twoLetterPopupOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[12055] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4 py-6"
            onClick={() => {
              playCloseSound();
              setTwoLetterPopupOpen(false);
              try {
                localStorage.setItem(twoLetterPopupKey, "1");
              } catch (_) {}
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${
                darkMode
                  ? "bg-slate-900/90 border-white/10 text-white"
                  : "bg-white/95 border-slate-200 text-slate-900"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 space-y-3">
                <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-70">
                  Nouveau !
                </div>
                <div className="text-lg font-extrabold">
                  Les mots de 2 lettres sont maintenant valides.
                </div>
                <div className="text-sm opacity-80">
                  Tu peux les utiliser pendant les manches, comme les autres mots.
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    className={`px-4 py-2 text-xs font-semibold rounded-full border ${
                      darkMode
                        ? "bg-slate-800/80 border-white/10 text-slate-100"
                        : "bg-white border-slate-200 text-slate-700"
                    }`}
                    onClick={() => {
                      playCloseSound();
                      setTwoLetterPopupOpen(false);
                      try {
                        localStorage.setItem(twoLetterPopupKey, "1");
                      } catch (_) {}
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;
  const specialTutorialType = specialTutorialPlan?.type || null;
  const specialTutorialLabel = specialTutorialPlan?.label || "Manche spéciale";
  const specialTutorialFixedScore =
    specialTutorialPlan?.fixedWordScore ?? SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK;
  const specialTutorialBonusLetter = specialTutorialPlan?.bonusLetter || "";
  const specialTutorialBonusScore = specialTutorialPlan?.bonusLetterScore ?? 20;
  const monstrousMinLongLen = specialTutorialPlan?.minLongWordLen ?? null;
  const monstrousMinLongCount = specialTutorialPlan?.minLongWordCount ?? null;
  const monstrousMinTotalScore = specialTutorialPlan?.minTotalScore ?? null;
  const specialTutorialContent = (() => {
    if (!specialTutorialType) return null;
    if (specialTutorialType === "target_long" || specialTutorialType === "target_score") {
      const goalLabel =
        specialTutorialType === "target_long"
          ? "le mot le plus long"
          : "le mot qui rapporte le plus de points";
      return {
        lead: `Manche spéciale ${specialTutorialLabel} : ici, pas besoin de s'acharner à trouver plein de mots, il n'y en a qu'un seul !`,
        bullets: [
          `Objectif : trouver ${goalLabel}.`,
          `Un indice toutes les ${SPECIAL_TUTORIAL_HINT_STEP_S}s (le premier après ${SPECIAL_TUTORIAL_HINT_FIRST_S}s).`,
          "Sois rapide : le premier à le trouver remporte le plus de points !",
        ],
        showTargetDemo: true,
        targetIsScore: specialTutorialType === "target_score",
      };
    }
    if (specialTutorialType === "speed") {
      return {
        lead: `Tous les mots valent ${specialTutorialFixedScore} points.`,
        bullets: [
          "Privilégie les petits mots rapides pour marquer un maximum.",
          "Un gobble \"mot le plus long\" s'y cache quand même.",
        ],
      };
    }
    if (specialTutorialType === "monstrous") {
      const bullets = [
        Number.isFinite(monstrousMinLongCount) && Number.isFinite(monstrousMinLongLen)
          ? `Au moins ${monstrousMinLongCount} mots d'au moins ${monstrousMinLongLen} lettres.`
          : null,
        monstrousMinTotalScore ? `Potentiel total d'au moins ${monstrousMinTotalScore} points.` : null,
      ].filter(Boolean);
      return {
        lead: "Grille monstrueuse : une grille riche en mots longs.",
        bullets,
      };
    }
    if (specialTutorialType === "bonus_letter") {
      return {
        lead: `Lettre en or : ${specialTutorialBonusLetter ? specialTutorialBonusLetter.toUpperCase() : "?"} vaut ${specialTutorialBonusScore} points.`,
        bullets: ["Les autres lettres gardent leur valeur habituelle."],
      };
    }
    return {
      lead: `Manche spéciale ${specialTutorialLabel}.`,
      bullets: [],
    };
  })();
  const closeSpecialTutorial = React.useCallback(() => {
    setIsSpecialTutorialOpen(false);
    if (specialTutorialPlan?.type) {
      markSpecialTutorialSeen(specialTutorialPlan.type);
    }
    setSpecialTutorialPlan(null);
  }, [markSpecialTutorialSeen, specialTutorialPlan]);
  const specialTutorialDemo =
    specialTutorialContent?.showTargetDemo && specialTutorialPlan ? (
      <div
        className={`mt-4 rounded-xl border p-3 ${
          darkMode ? "bg-slate-900/80 border-slate-700" : "bg-white/90 border-slate-200"
        }`}
      >
        <div className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          Indice toutes les {SPECIAL_TUTORIAL_HINT_STEP_S}s
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-lg font-black tracking-[0.3em]">
          {["_", "_", "_", "_", "_", "_"].map((mark, idx) => {
            const isHintLetter = idx === 2;
            return (
              <span
                key={`hint-${idx}`}
                className={isHintLetter ? "special-hint-letter text-amber-500" : ""}
              >
                {isHintLetter ? "A" : mark}
              </span>
            );
          })}
        </div>
        <div
          className="mt-3 grid place-content-center"
          style={{
            gridTemplateColumns: "repeat(4, 44px)",
            gridTemplateRows: "repeat(4, 44px)",
            gap: "6px",
          }}
        >
          {Array.from({ length: 16 }).map((_, idx) => {
            const isHint = idx === 5;
            const hintStyleClass = isHint
              ? specialTutorialContent?.targetIsScore
                ? "special-hint-outline"
                : "special-hint-fill"
              : "";
            const bonusMap = specialTutorialContent?.targetIsScore
              ? new Map([
                  [1, "L2"],
                  [3, "M2"],
                  [10, "L3"],
                  [12, "M3"],
                ])
              : null;
            const bonusKey = bonusMap?.get(idx) || null;
            const bonusStyle = bonusKey ? SPECIAL_TUTORIAL_BONUS_TILE_STYLES[bonusKey] : null;
            return (
              <div
                key={`demo-cell-${idx}`}
                className={`relative flex items-center justify-center rounded-lg border text-sm font-black ${
                  darkMode ? "bg-slate-800/70 border-slate-600" : "bg-slate-100 border-slate-300"
                } ${isHint ? "special-hint-tile" : ""} ${hintStyleClass}`}
                style={
                  bonusStyle
                    ? {
                        background: bonusStyle.bg,
                        borderColor: bonusStyle.border,
                        color: bonusStyle.text,
                      }
                    : undefined
                }
              >
                {bonusKey ? (
                  <span
                    className={`absolute -top-1 -right-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-black ${
                      bonusKey === "M3"
                        ? "bg-red-600 text-white"
                        : bonusKey === "M2"
                        ? "bg-blue-700 text-white"
                        : "bg-amber-600 text-white"
                    }`}
                  >
                    {bonusKey}
                  </span>
                ) : null}
                {isHint ? <span className="special-hint-letter">A</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    ) : null;
  const specialTutorialOverlay =
    isSpecialTutorialOpen && specialTutorialPlan && specialTutorialContent && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[13080] flex items-center justify-center px-4 py-6">
            <div
              className={`absolute inset-0 ${darkMode ? "bg-black/60" : "bg-white/60"} backdrop-blur-sm`}
            />
            <div
              role="dialog"
              aria-modal="true"
              className={`relative w-full max-w-lg rounded-2xl border p-4 shadow-2xl ${
                darkMode
                  ? "bg-slate-900/95 border-slate-700 text-slate-100"
                  : "bg-white/95 border-slate-200 text-slate-900"
              }`}
            >
              <div className="text-[11px] font-extrabold tracking-widest uppercase text-amber-500">
                Manche spéciale
              </div>
              <div className="mt-1 text-lg font-black">{specialTutorialLabel}</div>
              <p className={`mt-2 text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                {specialTutorialContent.lead}
              </p>
              {specialTutorialContent.bullets?.length ? (
                <ul className="mt-3 text-[12px] list-disc list-inside space-y-1">
                  {specialTutorialContent.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {specialTutorialDemo}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
                    darkMode ? "bg-amber-500 hover:bg-amber-400" : "bg-amber-500 hover:bg-amber-400"
                  }`}
                  onClick={closeSpecialTutorial}
                >
                  Compris !
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;
  const tutorialOverlay = (
    <TutorialOverlay
      open={isTutorialOpen}
      darkMode={darkMode}
      onComplete={completeTutorial}
    />
  );
  const sfxOn = !isSfxMuted;
  const ambientOn = !isAmbientMuted;
  const vibrationOn = isVibrationEnabled && canVibrate;
  const settingsMenuView = isSettingsOpen ? (
    <div className="fixed inset-0 z-[20000] flex items-start justify-end p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        onClick={() => {
          playCloseSound();
          setIsSettingsOpen(false);
        }}
        aria-label="Fermer les parametres"
      />
      <div
        className={`relative w-full max-w-xs rounded-2xl border p-4 shadow-2xl ${
          darkMode
            ? "bg-slate-900/95 border-white/10 text-slate-100"
            : "bg-white/95 border-slate-200 text-slate-900"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-extrabold">Parametres</div>
          <button
            type="button"
            className={`h-7 w-7 rounded-full border flex items-center justify-center ${
              darkMode
                ? "bg-slate-800/80 border-white/10 text-slate-100"
                : "bg-white border-slate-200 text-slate-700"
            }`}
            onClick={() => {
              playCloseSound();
              setIsSettingsOpen(false);
            }}
            aria-label="Fermer"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              darkMode
                ? "bg-slate-800/80 border-white/10 text-slate-100"
                : "bg-slate-50 border-slate-200 text-slate-800"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {darkMode ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
              <span>{darkMode ? "Mode clair" : "Mode sombre"}</span>
            </span>
            <span className="text-[10px] font-semibold opacity-70">
              {darkMode ? "Sombre" : "Clair"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsSfxMuted((v) => !v)}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              darkMode
                ? sfxOn
                  ? "bg-emerald-900/70 border-emerald-400/40 text-slate-100"
                  : "bg-rose-950/70 border-rose-400/40 text-slate-100"
                : sfxOn
                ? "bg-emerald-100 border-emerald-300 text-slate-800"
                : "bg-rose-100 border-rose-300 text-slate-800"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {isSfxMuted ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <line x1="14" y1="9" x2="20" y2="15" />
                  <line x1="20" y1="9" x2="14" y2="15" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )}
              <span>{isSfxMuted ? "Effets sonores coupés" : "Effets sonores actifs"}</span>
            </span>
            <span className="text-[10px] font-semibold opacity-70">
              {isSfxMuted ? "Off" : "On"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsAmbientMuted((v) => !v)}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              darkMode
                ? ambientOn
                  ? "bg-emerald-900/70 border-emerald-400/40 text-slate-100"
                  : "bg-rose-950/70 border-rose-400/40 text-slate-100"
                : ambientOn
                ? "bg-emerald-100 border-emerald-300 text-slate-800"
                : "bg-rose-100 border-rose-300 text-slate-800"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {isAmbientMuted ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                  <line x1="4" y1="4" x2="20" y2="20" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              )}
              <span>{isAmbientMuted ? "Musique d'ambiance coupée" : "Musique d'ambiance active"}</span>
            </span>
            <span className="text-[10px] font-semibold opacity-70">
              {isAmbientMuted ? "Off" : "On"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canVibrate) return;
              setIsVibrationEnabled((v) => !v);
            }}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              !canVibrate
                ? darkMode
                  ? "bg-slate-800/70 border-white/10 text-slate-100"
                  : "bg-slate-50 border-slate-200 text-slate-800"
                : darkMode
                ? vibrationOn
                  ? "bg-emerald-900/70 border-emerald-400/40 text-slate-100"
                  : "bg-rose-950/70 border-rose-400/40 text-slate-100"
                : vibrationOn
                ? "bg-emerald-100 border-emerald-300 text-slate-800"
                : "bg-rose-100 border-rose-300 text-slate-800"
            } ${canVibrate ? "" : "opacity-50 cursor-not-allowed"}`}
            disabled={!canVibrate}
          >
            <span className="inline-flex items-center gap-2">
              {isVibrationEnabled ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m2 8 2 4-2 4" />
                  <path d="m22 8-2 4 2 4" />
                  <rect x="8" y="4" width="8" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m2 8 2 4-2 4" />
                  <path d="m22 8-2 4 2 4" />
                  <rect x="8" y="4" width="8" height="16" rx="1" />
                  <line x1="4" y1="4" x2="20" y2="20" />
                </svg>
              )}
              <span>
                {canVibrate
                  ? isVibrationEnabled
                    ? "Vibrations actives"
                    : "Vibrations coupées"
                  : "Vibrations indisponibles"}
              </span>
            </span>
            <span className="text-[10px] font-semibold opacity-70">
              {canVibrate ? (isVibrationEnabled ? "On" : "Off") : "--"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSettingsOpen(false);
              setIsAboutOpen(true);
            }}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              darkMode
                ? "bg-transparent border-white/15 text-slate-100"
                : "bg-transparent border-slate-200 text-slate-800"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
                À propos
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={returnToLobby}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
              darkMode
                ? "bg-amber-500 border-amber-300 text-slate-900"
                : "bg-amber-400 border-amber-300 text-slate-900"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span>Retour lobby</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  ) : null;
  const aboutModalView = isAboutOpen ? (
    <div className="fixed inset-0 z-[20010] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        onClick={() => setIsAboutOpen(false)}
        aria-label="Fermer à propos"
      />
      <div
        className={`relative w-full max-w-xs rounded-2xl border p-4 shadow-2xl ${
          darkMode
            ? "bg-slate-900/95 border-white/10 text-slate-100"
            : "bg-white/95 border-slate-200 text-slate-900"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="À propos"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-extrabold">À propos</div>
          <button
            type="button"
            className={`h-7 w-7 rounded-full border flex items-center justify-center ${
              darkMode
                ? "bg-slate-800/80 border-white/10 text-slate-100"
                : "bg-white border-slate-200 text-slate-700"
            }`}
            onClick={() => setIsAboutOpen(false)}
            aria-label="Fermer"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="font-semibold">Un jeu créé par Paul Millet</div>
          <a
            href="mailto:support@gobble.fr"
            className="text-[12px] underline underline-offset-2 opacity-80"
          >
            support@gobble.fr
          </a>
        </div>
      </div>
    </div>
  ) : null;

  const mobileChatLayer =
    isLoggedIn ? (
      <MobileChatWidget
        chatInput={chatInput}
        chatInputRef={chatInputRef}
        chatInputType={chatInputType}
        chatInputDisabled={chatInputDisabled}
        chatInputPlaceholder={chatInputPlaceholder}
        onChatInputFocus={handleChatInputFocus}
        chatOverlayStyle={globalChatOverlayStyle}
        chatViewportStyle={chatViewportStyle}
        chatSheetStyle={globalChatSheetStyle}
        chatAnimationMs={CHAT_DRAWER_ANIM_MS}
        cycleChatHistory={cycleChatHistory}
        darkMode={darkMode}
        hasKeyboardInset={chatKeyboardInsetPx > 0 || keyboardInsetReservePx > 0}
        isChatOpenMobile={isChatOpenMobile}
        isChatClosing={isChatClosing}
        mobileChatUnreadCount={mobileChatUnreadCount}
        blockedCount={blockedCount}
        blockedEntries={blockedEntries}
        onToggleBlockedList={() => setShowBlockedList((prev) => !prev)}
        onUnblockInstallId={unblockInstallId}
        onOpenChat={requestOpenChat}
        onOpenRules={() => setIsChatRulesOpen(true)}
        onCloseSound={playCloseSound}
        onOpenUserMenu={openUserMenu}
        showBlockedList={showBlockedList}
        selfNick={selfNick}
        selfInstallId={installId}
        setChatInput={setChatInput}
        setIsChatOpenMobile={closeChatPanel}
        submitChat={submitChat}
        visibleMessages={visibleMessages}
      />
    ) : null;
  const devNowMs = DEV_MODE ? Date.now() : 0;
  const devLastLongTaskAge =
    devPerfStats.lastLongTaskAt != null
      ? Math.round((devNowMs - devPerfStats.lastLongTaskAt) / 1000)
      : null;
  const devLastSolveAllAge =
    devPerfStats.lastSolveAllAt != null
      ? Math.round((devNowMs - devPerfStats.lastSolveAllAt) / 1000)
      : null;
  const devPerfOverlay = null;
  const chatOverlays = (
    <>
      {weeklyStatsOverlay}
      {playersOverlay}
      {userMenuView}
      {reportModal}
      {chatRulesModal}
      {definitionModalView}
      {wordInfoModalView}
      {recordModalView}
      {twoLetterPopupView}
      {vocabOverlayView}
      {tutorialOverlay}
      {specialTutorialOverlay}
      {settingsMenuView}
      {aboutModalView}
      {mobileChatLayer}
      {devPerfOverlay}
    </>
  );
  const bootOverlay = !bootProgress.done ? (
    <BootLoader progress={bootProgress} darkMode={darkMode} />
  ) : null;
  if (!bootProgress.done) {
    return bootOverlay;
  }
  const savedSessionNick = sessionRef.current?.nick?.trim() || "";
  const canResumeNow = !!resumeSnapshot;
  const resumeRoomLabel =
    resumeSnapshot?.roomId && ROOM_OPTIONS[resumeSnapshot.roomId]
      ? ROOM_OPTIONS[resumeSnapshot.roomId].label
      : resumeSnapshot?.roomId || "";
  const resumePhaseLabel =
    resumeSnapshot?.phase === "playing"
      ? "Manche en cours"
      : resumeSnapshot?.phase === "results"
      ? "Resultats"
      : "Accueil";
  const resumeRoundLabel =
    resumeSnapshot?.currentRound?.tournament?.round ||
    resumeSnapshot?.lastRoundResults?.payload?.tournament?.round ||
    null;

  const dailyMyResult = dailyStatus?.myResult || dailyResult;
  const dailyScoreLabel =
    dailyMyResult && Number.isFinite(dailyMyResult.score) ? dailyMyResult.score : null;
  const dailyRankLabel =
    dailyMyResult && Number.isFinite(dailyMyResult.rank) ? dailyMyResult.rank : null;
  const todayDateId = dailyStatus?.dateId || dailyBoard?.dateId || null;
  const dailyHistoryDaysRaw = Array.isArray(dailyHistory?.days) ? dailyHistory.days : [];
  const dailyHistoryDays = todayDateId
    ? dailyHistoryDaysRaw.filter((entry) => entry?.dateId && entry.dateId !== todayDateId)
    : dailyHistoryDaysRaw;
  const dailyHistoryPages = [
    ...dailyHistoryDays.map((entry) => ({ type: "day", ...entry })),
    {
      type: "crowns",
      crownTotals: Array.isArray(dailyHistory?.crownTotals) ? dailyHistory.crownTotals : [],
    },
  ];
  const dailyHistoryPageCount = dailyHistoryPages.length;

  const renderDailyBoardList = (maxHeightClass = "max-h-[360px]") => (
    <div
      className={`rounded-xl border px-3 py-2 ${maxHeightClass} overflow-auto ${
        darkMode ? "border-white/10 bg-slate-900/50" : "border-slate-200 bg-white"
      }`}
    >
      {dailyEntries.length ? (
        dailyEntries.map((entry, idx) => {
          const isPalier = !!entry?.isPalier;
          const firstRealIndex = dailyEntries.findIndex((item) => item && !item.isPalier);
          const isWinner = !isPalier && idx === firstRealIndex;
          const label = entry?.rightLabel
            ? entry.rightLabel
            : Number.isFinite(entry?.score)
            ? `${entry.wordsCount != null ? `${entry.wordsCount} mots · ` : ""}${entry.score} pts`
            : "-";
          const gobbleBadge = !isPalier ? renderGobbleBadge(entry?.gobbles) : null;
          const isSelfDaily =
            !isPalier &&
            ((entry?.installId && installId && entry.installId === installId) ||
              (entry?.nick && selfNick && entry.nick === selfNick));
          return (
            <div
              key={entry?.playerKey || entry?.installId || `${entry?.nick}-${idx}`}
              className={`flex items-center justify-between gap-3 py-2 text-sm border-b last:border-b-0 ${
                darkMode ? "border-white/5" : "border-slate-100"
              } ${
                isPalier ? (darkMode ? "text-amber-200" : "text-amber-700") : ""
              } ${
                isSelfDaily
                  ? darkMode
                    ? "bg-emerald-900/30 text-emerald-100"
                    : "bg-emerald-50 text-emerald-800"
                  : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70">
                  {idx + 1}
                </span>
                <span className="truncate font-semibold flex items-center gap-1">
                  {entry?.nick || "Joueur"}
                  {isWinner ? renderCrownIcon() : null}
                  {gobbleBadge}
                </span>
              </div>
              <span className="text-[11px] font-semibold opacity-80 shrink-0">{label}</span>
            </div>
          );
        })
      ) : (
        <div className="text-xs opacity-70 py-6 text-center">Aucun score pour le moment.</div>
      )}
    </div>
  );
  const renderDailyHistorySlider = (panelHeightClass = "max-h-[320px]") =>
    dailyHistoryPageCount > 0 ? (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Historique</div>
        {dailyHistoryLoading ? (
          <div className="text-xs opacity-70">Chargement...</div>
        ) : dailyHistoryError ? (
          <div className="text-xs text-red-500">Erreur historique ({dailyHistoryError})</div>
        ) : (
          <>
            <div
              ref={dailyHistoryScrollRef}
              className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2"
              onScroll={(e) => {
                const el = e.currentTarget;
                const width = el.clientWidth || 1;
                const page = Math.round(el.scrollLeft / width);
                if (page !== dailyHistoryIndex) setDailyHistoryIndex(page);
              }}
            >
              {dailyHistoryPages.map((page, idx) => (
                <div key={`daily-history-${page.type}-${idx}`} className="w-full shrink-0 snap-start">
                  <div
                    className={`rounded-xl border px-3 py-3 ${
                      darkMode ? "border-white/10 bg-slate-900/50" : "border-slate-200 bg-white"
                    }`}
                  >
                    {page.type === "day" ? (
                      <>
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <div className="text-sm font-bold">Date : {page.dateId}</div>
                          {Number.isFinite(page.totalPlayers) ? (
                            <div className="text-[11px] opacity-70">
                              {page.totalPlayers} joueurs
                            </div>
                          ) : null}
                        </div>
                        {Array.isArray(page.entries) && page.entries.length > 0 ? (
                          <div className={`${panelHeightClass} overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1`}>
                            {page.entries.map((entry, entryIdx) => {
                              const isWinner = entryIdx === 0;
                              const label = Number.isFinite(entry?.score)
                                ? `${entry.wordsCount != null ? `${entry.wordsCount} mots · ` : ""}${
                                    entry.score
                                  } pts`
                                : "-";
                              const gobbleBadge = renderGobbleBadge(entry?.gobbles);
                              return (
                                <div
                                  key={entry?.installId || `${entry?.nick}-${entryIdx}`}
                                  className={`flex items-center justify-between gap-3 py-2 text-sm border-b last:border-b-0 ${
                                    darkMode ? "border-white/5" : "border-slate-100"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70">
                                      {entryIdx + 1}
                                    </span>
                                    <span className="truncate font-semibold flex items-center gap-1">
                                      {entry?.nick || "Joueur"}
                                      {isWinner ? renderCrownIcon() : null}
                                      {gobbleBadge}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-semibold opacity-80 shrink-0">
                                    {label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs opacity-70 py-6 text-center">
                            Aucun score pour ce jour.
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <div className="text-sm font-bold">Total couronnes</div>
                        </div>
                        {Array.isArray(page.crownTotals) && page.crownTotals.length > 0 ? (
                          <div className={`${panelHeightClass} overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1`}>
                            {page.crownTotals.map((entry, entryIdx) => (
                              <div
                                key={`${entry.nick}-${entryIdx}`}
                                className={`flex items-center justify-between gap-3 py-2 text-sm border-b last:border-b-0 ${
                                  darkMode ? "border-white/5" : "border-slate-100"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70">
                                    {entryIdx + 1}
                                  </span>
                                  <span className="truncate font-semibold flex items-center gap-1">
                                    {entry?.nick || "Joueur"}
                                    {entryIdx === 0 ? renderCrownIcon() : null}
                                  </span>
                                </div>
                                <span className="text-[11px] font-semibold opacity-80 shrink-0">
                                  {entry.crowns || 0} couronne{entry.crowns > 1 ? "s" : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs opacity-70 py-6 text-center">
                            Aucune couronne pour l'instant.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {dailyHistoryPageCount > 1 ? (
              <div className="flex items-center justify-center gap-2">
                {dailyHistoryPages.map((_, idx) => {
                  const active = idx === dailyHistoryIndex;
                  const dotColor = active
                    ? darkMode
                      ? "bg-slate-100"
                      : "bg-slate-900"
                    : darkMode
                    ? "bg-white/30"
                    : "bg-slate-300";
                  return (
                    <button
                      key={`daily-history-dot-${idx}`}
                      type="button"
                      className={`h-2.5 w-2.5 rounded-full transition ${dotColor} ${
                        active ? "scale-110" : ""
                      }`}
                      aria-label={`Page ${idx + 1}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        const el = dailyHistoryScrollRef.current;
                        if (!el) return;
                        const width = el.clientWidth || 1;
                        el.scrollTo({ left: idx * width, behavior: "smooth" });
                        setDailyHistoryIndex(idx);
                      }}
                    />
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    ) : null;

  if (!isLoggedIn && appView === "daily") {
    return (
      <>
        {tutorialOverlay}
        {settingsMenuView}
        {aboutModalView}
        <div
          className={`min-h-screen flex items-center justify-center px-4 ${
            darkMode
              ? "bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800 text-white"
              : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          }`}
        >
          <div
            className={`w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4 ${
              darkMode
                ? "bg-slate-900/70 border border-white/10"
                : "bg-white/90 border border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-black tracking-tight">Grille du jour</div>
                <div className="text-xs opacity-70">
                  {dailyStatus?.dateId ? `Date : ${dailyStatus.dateId}` : "Chargement..."}
                </div>
              </div>
              <button
                type="button"
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  darkMode
                    ? "bg-slate-800/80 border border-white/10 text-slate-100"
                    : "bg-white border border-slate-200 text-slate-700"
                }`}
                onClick={() => setAppView("home")}
              >
                Retour accueil
              </button>
            </div>

            {!dailyBoard.ready && (
              <div className="text-sm font-semibold text-amber-500">
                Grille en preparation...
              </div>
            )}
            {dailyStatus.error && (
              <div className="text-xs text-red-500">Erreur daily ({dailyStatus.error})</div>
            )}
            {dailyBoard.error && (
              <div className="text-xs text-red-500">Erreur classement ({dailyBoard.error})</div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dailyRankingView === "today"
                    ? darkMode
                      ? "bg-blue-500 text-white"
                      : "bg-blue-600 text-white"
                    : darkMode
                    ? "bg-slate-800/80 border border-white/10 text-slate-100"
                    : "bg-white border border-slate-200 text-slate-700"
                }`}
                onClick={() => setDailyRankingView("today")}
              >
                Classement du jour
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dailyRankingView === "history"
                    ? darkMode
                      ? "bg-blue-500 text-white"
                      : "bg-blue-600 text-white"
                    : darkMode
                    ? "bg-slate-800/80 border border-white/10 text-slate-100"
                    : "bg-white border border-slate-200 text-slate-700"
                }`}
                onClick={() => setDailyRankingView("history")}
                disabled={dailyHistoryPageCount === 0}
              >
                Historique
              </button>
            </div>

            {dailyRankingView === "today"
              ? renderDailyBoardList("max-h-[520px]")
              : renderDailyHistorySlider("max-h-[520px]") || (
                  <div className="text-xs opacity-70 py-6 text-center">
                    Aucun historique disponible.
                  </div>
                )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  dailyStatus.ready && !dailyStatus.hasPlayed
                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                    : "bg-slate-400/60 text-white cursor-not-allowed"
                }`}
                onClick={startDailyGame}
                disabled={!dailyStatus.ready || dailyStatus.hasPlayed}
              >
                Jouer
              </button>
              {dailyStartError && (
                <span className="ml-2 text-[11px] font-bold text-red-400">
                  {dailyStartError}
                </span>
              )}
            </div>

            {dailyStatus.hasPlayed && (
              <div className="text-sm font-semibold">
                Deja joue{dailyScoreLabel != null ? ` : ${dailyScoreLabel} pts` : ""}
                {dailyRankLabel != null ? ` · Rang #${dailyRankLabel}` : ""}
              </div>
            )}
          </div>
        </div>
        {chatOverlays}
      </>
    );
  }

  if (appView === "daily_results" && !isLoggedIn) {
    return (
      <>
        {tutorialOverlay}
        {settingsMenuView}
        {aboutModalView}
        <div
          className={`min-h-screen flex items-center justify-center px-4 ${
            darkMode
              ? "bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800 text-white"
              : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          }`}
        >
          <div
            className={`w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4 ${
              darkMode
                ? "bg-slate-900/70 border border-white/10"
                : "bg-white/90 border border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-black tracking-tight">Resultat daily</div>
                <div className="text-xs opacity-70">
                  {dailyResult?.dateId ? `Date : ${dailyResult.dateId}` : ""}
                </div>
              </div>
              <button
                type="button"
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  darkMode
                    ? "bg-slate-800/80 border border-white/10 text-slate-100"
                    : "bg-white border border-slate-200 text-slate-700"
                }`}
                onClick={() => setAppView("daily")}
              >
                Retour classement
              </button>
            </div>

            <div className="text-sm font-semibold">
              {dailyScoreLabel != null ? `Score : ${dailyScoreLabel} pts` : "Score : -"}
              {dailyRankLabel != null ? ` · Rang #${dailyRankLabel}` : ""}
              {dailyResult?.totalPlayers ? ` / ${dailyResult.totalPlayers}` : ""}
            </div>
            {dailySubmitError && (
              <div className="text-xs text-red-400">{dailySubmitError}</div>
            )}

            {renderDailyBoardList()}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold transition bg-blue-600 hover:bg-blue-500 text-white"
                onClick={() => setAppView("home")}
              >
                Retour accueil
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!isLoggedIn && !isDailyPlay) {
    return (
      <>
        {weeklyStatsOverlay}
        {playersOverlay}
        {definitionModalView}
        {twoLetterPopupView}
        {tutorialOverlay}
        {settingsMenuView}
        {aboutModalView}
        <div
          className={`min-h-screen flex items-center justify-center px-4 ${
            darkMode
              ? "bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800 text-white"
              : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          }`}
        >
        <div
          className={`w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-3 ${
            darkMode
              ? "bg-slate-900/70 border border-white/10"
              : "bg-white/90 border border-slate-200"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
  <div className="flex items-baseline gap-2 text-3xl font-black tracking-tight select-none">
    <span>GOBBLE</span>
  </div>
  <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
    Salon multijoueur sans compte...
  </p>
</div>

            <div className="flex flex-col items-start gap-1 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold transition inline-flex items-center gap-1 ${
                    darkMode
                      ? "bg-slate-800/80 border-white/10 text-slate-100"
                      : "bg-white border-slate-200 text-slate-700"
                  }`}
                  onClick={() => setIsSettingsOpen(true)}
                  aria-label="Ouvrir les paramètres"
                >
                  <span
                    className="material-icons-outlined text-[14px] leading-none"
                    aria-hidden="true"
                  >
                    settings
                  </span>
                  Parametres
                </button>
              </div>
              {connectionError && (
                <span className={darkMode ? "text-red-300" : "text-red-600"}>{connectionError}</span>
              )}
            </div>
          </div>

          {canResumeNow ? (
            <div
              className={`rounded-xl p-4 flex flex-col gap-2 border ${
                darkMode ? "bg-emerald-900/20 border-emerald-400/30" : "bg-emerald-50 border-emerald-200"
              }`}
            >
              <div className="text-sm font-semibold">Session en cours detectee</div>
              <div className="text-xs opacity-70">
                {savedSessionNick ? `Pseudo : ${savedSessionNick}` : "Pseudo disponible"}
                {resumeRoomLabel ? ` • Salon : ${resumeRoomLabel}` : ""}
              </div>
              <div className="text-xs opacity-70">
                {resumePhaseLabel}
                {resumeRoundLabel ? ` • Manche ${resumeRoundLabel}` : ""}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                  onClick={handleResumeFromPrompt}
                  disabled={isConnecting}
                >
                  Reprendre
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    darkMode
                      ? "bg-slate-700/60 hover:bg-slate-600 text-slate-100"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={dismissResumePrompt}
                  disabled={isConnecting}
                >
                  Rester a l'accueil
                </button>
              </div>
            </div>
          ) : resumePending ? (
            <div className="text-xs opacity-70">Recherche de session en cours...</div>
          ) : null}

          <form
            onSubmit={handleLoginOrResume}
            className={`rounded-xl p-4 flex flex-col gap-2 border ${
              darkMode ? "bg-slate-800/70 border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <label className="text-sm font-semibold">
              Pseudo
              <input
                type="text"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white text-slate-900 outline-none border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/60 ios-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={isConnecting}
                maxLength={25}
              />
            </label>
            {loginError && (
              <div className="text-red-300 text-xs">{loginError}</div>
            )}
            <button
              type="submit"
              className="mt-1 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition disabled:opacity-60"
              disabled={isConnecting}
            >
              {isConnecting ? "Connexion..." : "Entrer dans la partie"}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-semibold transition bg-blue-500 hover:bg-blue-400 text-white shadow-sm"
              onClick={openWeeklyStatsOverlay}
              disabled={isConnecting}
            >
              Stats
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-semibold transition bg-amber-500 hover:bg-amber-400 text-white shadow-sm"
              onClick={openDailyHome}
              disabled={isConnecting}
            >
              <span className="inline-flex items-center gap-2">
                Grille du jour
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-white/80 text-amber-900">
                  Nouveau
                </span>
              </span>
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-semibold transition bg-blue-500/80 hover:bg-blue-500 text-white shadow-sm"
              onClick={openPlayersOverlayAlpha}
              disabled={isConnecting}
            >
              Joueurs en jeu ({playersCountForLobby})
            </button>
          </form>
          <div className="flex justify-center">
            <button
              type="button"
              className={`text-xs font-semibold underline underline-offset-2 ${
                darkMode ? "text-amber-300 hover:text-amber-200" : "text-amber-700 hover:text-amber-600"
              }`}
              onClick={openTutorialFromHome}
              disabled={isConnecting}
            >
              Relire le didacticiel
            </button>
          </div>

          <div className={`grid md:grid-cols-3 gap-2 text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            <div className={`p-2 rounded-lg border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="font-semibold">Pseudo unique</div>
              <div className={`text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                Pas de compte, juste un pseudo non utilisé par un autre joueur.
              </div>
            </div>
            <div className={`p-2 rounded-lg border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="font-semibold">Chat en direct</div>
              <div className={`text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                Messages partagés dès que tu es connecté.
              </div>
            </div>
            <div className={`p-2 rounded-lg border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="font-semibold">Classement live</div>
              <div className={`text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                Ta position se met à jour, les scores détaillés arrivent en fin de manche.
              </div>
            </div>
          </div>
        </div>
        </div>
      </>
    );
  }

  const praiseRect = !isMobileLayout
    ? gridRef.current?.getBoundingClientRect?.()
    : null;
  const flashRect = gridRef.current?.getBoundingClientRect?.() || null;
  const praisePositionStyle =
    praiseRect && Number.isFinite(praiseRect.left) && Number.isFinite(praiseRect.top)
      ? {
          left: `${Math.round(praiseRect.left + praiseRect.width / 2)}px`,
          top: `${Math.round(praiseRect.top + praiseRect.height * 0.45)}px`,
        }
      : undefined;
  const gobbleImageSize = isMobileLayout ? 260 : 340;
  const praiseImageSize = isMobileLayout ? 220 : 300;
  const praiseImageKey =
    praiseFlash?.kind === "epic"
      ? IMAGE_KEYS.bigwords.epique
      : praiseFlash?.kind === "gold"
      ? IMAGE_KEYS.bigwords.enorme
      : praiseFlash?.kind === "purple"
      ? IMAGE_KEYS.bigwords.fabuleux
      : praiseFlash?.kind === "blue"
      ? IMAGE_KEYS.bigwords.excellent
      : "";
  const praiseImageSrc = praiseImageKey ? getImageUrl(praiseImageKey) : "";
  const praiseImageAlt =
    praiseFlash?.kind === "epic"
      ? "EPIQUE"
      : praiseFlash?.kind === "gold"
      ? "ENORME"
      : praiseFlash?.kind === "purple"
      ? "FABULEUX"
      : praiseFlash?.kind === "blue"
      ? "EXCELLENT"
      : "";
  const praiseImageSizePx = praiseImageSize;
  const gobbleImageSrc = gobbleFlash ? getImageUrl(IMAGE_KEYS.bigwords.gobble) : "";
  const gobbleImageAlt = "GOBBLE";
  const gobbleImageSizePx = gobbleImageSize;
  const praiseFlashColor =
    praiseFlash?.kind === "epic"
      ? "rgba(244, 114, 182, 0.55)"
      : praiseFlash?.kind === "gold"
      ? "rgba(255, 92, 36, 0.55)"
      : praiseFlash?.kind === "purple"
      ? "rgba(168, 85, 247, 0.55)"
      : praiseFlash?.kind === "blue"
      ? "rgba(34, 197, 94, 0.55)"
      : "transparent";
  const gobbleFlashColor = gobbleFlash ? "rgba(255, 200, 64, 0.55)" : "transparent";
  const flashPadding = isMobileLayout ? 8 : 12;
  const flashRadiusBase = isMobileLayout ? 18 : 22;
  const buildFlashHoleStyle = (color) =>
    flashRect &&
    Number.isFinite(flashRect.left) &&
    Number.isFinite(flashRect.top) &&
    Number.isFinite(flashRect.width) &&
    Number.isFinite(flashRect.height)
      ? {
          left: `${Math.max(0, Math.round(flashRect.left - flashPadding))}px`,
          top: `${Math.max(0, Math.round(flashRect.top - flashPadding))}px`,
          width: `${Math.max(0, Math.round(flashRect.width + flashPadding * 2))}px`,
          height: `${Math.max(0, Math.round(flashRect.height + flashPadding * 2))}px`,
          ["--praise-flash-color"]: color,
          ["--praise-flash-radius"]: `${flashRadiusBase}px`,
        }
      : null;
  const praiseFlashHoleStyle = buildFlashHoleStyle(praiseFlashColor);
  const gobbleFlashHoleStyle = buildFlashHoleStyle(gobbleFlashColor);
  const praiseOverlay =
    phase === "playing" && (praiseFlash || gobbleFlash) && typeof document !== "undefined"
      ? createPortal(
          <>
            {gobbleFlash ? (
              <div
                key={`flash-gobble-${gobbleFlash.id}`}
                className="praise-flash"
                style={{ ["--praise-flash-color"]: gobbleFlashColor }}
              >
                {gobbleFlashHoleStyle ? (
                  <div className="praise-flash-hole" style={gobbleFlashHoleStyle} />
                ) : (
                  <div className="praise-flash-full" />
                )}
              </div>
            ) : null}
            {gobbleFlash ? (
              <div
                key={gobbleFlash.id}
                className="praise-pop praise-image-pop gobble-pop"
                style={{
                  ...praisePositionStyle,
                  ["--praise-x"]: `${Math.round(gobbleFlash.dx || 0)}px`,
                  ["--praise-y"]: `${Math.round(gobbleFlash.dy || 0)}px`,
                  ["--praise-scale"]: gobbleFlash.scale || 1.6,
                  ["--praise-size"]: `${gobbleImageSizePx}px`,
                  ["--praise-duration"]: `${Math.max(
                    1600,
                    Math.min(3000, gobbleFlash.durationMs || 2200)
                  )}ms`,
                }}
              >
                {gobbleImageSrc ? (
                  <img
                    src={gobbleImageSrc}
                    alt={gobbleImageAlt}
                    className="praise-image"
                    draggable={false}
                  />
                ) : null}
              </div>
            ) : null}
            {praiseFlash ? (
              <>
                <div
                  key={`flash-${praiseFlash.id}`}
                  className="praise-flash"
                  style={{ ["--praise-flash-color"]: praiseFlashColor }}
                >
                  {praiseFlashHoleStyle ? (
                    <div className="praise-flash-hole" style={praiseFlashHoleStyle} />
                  ) : (
                    <div className="praise-flash-full" />
                  )}
                </div>
                <div
                  key={praiseFlash.id}
                  className="praise-pop praise-image-pop"
                  style={{
                    ...praisePositionStyle,
                    ["--praise-x"]: `${Math.round(praiseFlash.dx || 0)}px`,
                    ["--praise-y"]: `${Math.round(praiseFlash.dy || 0)}px`,
                    ["--praise-scale"]: praiseFlash.scale || 1.6,
                    ["--praise-size"]: `${praiseImageSizePx}px`,
                    ["--praise-duration"]: `${Math.max(
                      1200,
                      Math.min(2600, praiseFlash.durationMs || 1500)
                    )}ms`,
                  }}
                >
                  {praiseImageSrc ? (
                    <img
                      src={praiseImageSrc}
                      alt={praiseImageAlt}
                      className="praise-image"
                      draggable={false}
                    />
                  ) : null}
                </div>
              </>
            ) : null}
          </>,
          document.body
        )
      : null;

  if (showTournamentFinale) {
    const baselineRankingMap = tournamentBaselineRef.current.rankingMap;
    const baselineRound = tournamentBaselineRef.current.rankingRound;
    const finaleDeltaByNick = new Map();
    if (Array.isArray(tournamentRanking)) {
      tournamentRanking.forEach((entry) => {
        if (!entry?.nick || !Number.isFinite(entry.delta)) return;
        finaleDeltaByNick.set(entry.nick, entry.delta);
      });
    }
    const currentRound = Number.isFinite(tournament?.round)
      ? tournament.round
      : TOURNAMENT_TOTAL_ROUNDS;
    const useBaselineDelta =
      baselineRankingMap && baselineRankingMap.size > 0
        ? !Number.isFinite(baselineRound) ||
          !Number.isFinite(currentRound) ||
          baselineRound < currentRound
        : false;
    const finaleRanking = tournamentFinaleSummary.ranking.map((e, idx) => {
      const posNow = Number.isFinite(e.pos) ? e.pos : idx + 1;
      const basePos = baselineRankingMap?.get(e.nick);
      const fallbackDelta =
        finaleDeltaByNick.has(e.nick)
          ? finaleDeltaByNick.get(e.nick)
          : e.delta ?? 0;
      const delta =
        useBaselineDelta && Number.isFinite(basePos) && Number.isFinite(posNow)
          ? basePos - posNow
          : fallbackDelta;
      return {
        nick: e.nick,
        score: typeof e.points === "number" ? e.points : e.score || 0,
        delta,
        isDailyChampion: !!e.isDailyChampion,
      };
    });
    const winnerNick = tournamentFinaleSummary.winnerNick || "Joueur";
    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    const finaleBoards = FINALE_WEEKLY_BOARDS;
    const { height: finaleViewportHeight } = getViewportSize();
    const finaleSafeHeight = Math.max(0, finaleViewportHeight || 0);
    const finalePaddingY = isMobileLayout ? 12 : 24;
    const finaleHeaderHeight = clampValue(
      Math.round(finaleSafeHeight * (isMobileLayout ? 0.22 : 0.24)),
      isMobileLayout ? 110 : 140,
      isMobileLayout ? 200 : 240
    );
    const finaleDotsHeight = clampValue(
      Math.round(finaleSafeHeight * 0.055),
      18,
      28
    );
    const finaleContentHeight = Math.max(
      0,
      finaleSafeHeight - finalePaddingY * 2 - finaleHeaderHeight - finaleDotsHeight
    );
    const finaleShellClass = "relative z-10 max-w-6xl mx-auto px-4";
    const finaleShellStyle = {
      minHeight: "100svh",
      height: finaleSafeHeight ? `${finaleSafeHeight}px` : "100svh",
      paddingTop: `${finalePaddingY}px`,
      paddingBottom: `${finalePaddingY}px`,
    };
    const finaleHeaderStyle = { height: `${finaleHeaderHeight}px` };
    const finaleCarouselStyle = finaleContentHeight
      ? { height: `${finaleContentHeight}px` }
      : undefined;
    const finaleDotsStyle = { height: `${finaleDotsHeight}px` };
    const finaleSlideCardStyle = { height: "100%", minHeight: 0 };
    const finaleCardPaddingClass = isMobileLayout ? "p-3" : "p-4";
    return (
      <>
        <div
          className={`min-h-screen relative ${
            darkMode
              ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white"
              : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          }`}
        >
          <style>{slideStyles}</style>
          <div className={finaleShellClass} style={finaleShellStyle}>
            <div className="flex flex-col min-h-0 h-full gap-3">
              <div className="text-center flex flex-col justify-center" style={finaleHeaderStyle}>
                <div className="text-sm font-semibold tracking-widest opacity-80">
                  FIN DU MINI-TOURNOI
                </div>
                <div className="mt-1 text-3xl sm:text-4xl font-black tracking-tight">
                  Bravo {winnerNick} !
                </div>
                <div className="mt-2 text-sm font-bold opacity-90">
                  {bc != null
                    ? `Nouveau tournoi dans : ${bc}s`
                    : "Nouveau tournoi imminent..."}
                </div>
              </div>

              <div
                className="relative min-h-0 flex flex-col overflow-hidden"
                style={finaleCarouselStyle}
              >
                <div
                  ref={finaleScrollRef}
                  className="flex w-full h-full min-h-0"
                  style={{
                    transform: `translateX(calc(${finalePage * -100}%))`,
                    transition: "transform 0.25s ease-out",
                  }}
                  onTouchStart={handleFinaleTouchStart}
                  onTouchMove={handleFinaleTouchMove}
                  onTouchEnd={handleFinaleTouchEnd}
                  onTouchCancel={handleFinaleTouchEnd}
                >
                  <div className="w-full shrink-0 h-full">
                    <div
                      className={`bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl ${finaleCardPaddingClass} shadow-xl flex flex-col overflow-hidden h-full`}
                      style={finaleSlideCardStyle}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="font-extrabold">Classement general</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300 whitespace-nowrap">
                          Manche {TOURNAMENT_TOTAL_ROUNDS}/{TOURNAMENT_TOTAL_ROUNDS}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1">
                        <RankingWidgetMobile
                          fullRanking={finaleRanking}
                          selfNick={selfNick}
                          darkMode={darkMode}
                          expanded={true}
                          animateRank={false}
                          showWheel={false}
                          flatStyle={true}
                          fitHeight={true}
                          assetVersion={assetVersion}
                          gobbleWordAwardsByNick={gobbleAwardsForLive}
                          renderNickSuffix={(nick, entry) =>
                            renderNickSuffix(nick, entry, tournamentFinaleMedals)
                          }
                          renderAfterRank={renderRankDelta}
                        />
                      </div>
                    </div>
                  </div>
                  {finaleBoards.map((boardMeta) => {
                    const entries = dedupeWeeklyEntries(
                      boardMeta.key,
                      weeklyBoardData[boardMeta.key],
                      weeklyLimit
                    );
                    const baselineEntries = dedupeWeeklyEntries(
                      boardMeta.key,
                      finaleBaselineBoards[boardMeta.key],
                      weeklyLimit
                    );
                    const hasChanges = hasWeeklyChanges(
                      boardMeta.key,
                      entries,
                      finaleBaselineRankMaps[boardMeta.key],
                      finaleBaselineValueMaps[boardMeta.key]
                    );
                    return (
                      <div key={boardMeta.key} className="w-full shrink-0 h-full">
                        <div
                          className={`bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl ${finaleCardPaddingClass} shadow-xl flex flex-col overflow-hidden h-full`}
                          style={finaleSlideCardStyle}
                        >
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <div className="font-extrabold">
                              Classement hebdo - {boardMeta.label}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-300 whitespace-nowrap">
                              {weeklyWeekNumber ? `Semaine ${weeklyWeekNumber}` : "Semaine en cours"}
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-300 mb-1">
                            {boardMeta.subtitle || ""}
                          </div>
                          {!hasChanges && baselineEntries.length > 0 ? (
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 mb-1">
                              Aucun changement
                            </div>
                          ) : null}
                          <div className="min-h-0 flex-1">
                            {weeklyStatsLoading ? (
                              <div className="h-full flex items-center justify-center text-sm opacity-70">
                                Chargement...
                              </div>
                            ) : weeklyStatsError ? (
                              <div className="h-full flex items-center justify-center text-sm text-red-400">
                                Erreur ({weeklyStatsError})
                              </div>
                            ) : entries.length > 0 ? (
                              <div className="h-full overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
                                {entries.map((entry, entryIdx) =>
                                  renderFinaleWeeklyRow(boardMeta.key, entry, entryIdx, {
                                    showVocabIcon: boardMeta.key === "vocab",
                                    baselineRankMap: finaleBaselineRankMaps[boardMeta.key],
                                    baselineValueMap: finaleBaselineValueMaps[boardMeta.key],
                                    showChanges: hasChanges,
                                  })
                                )}
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center text-sm opacity-70">
                                Pas encore de stats cette semaine.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-2" style={finaleDotsStyle}>
                  {Array.from({ length: 1 + finaleBoards.length }, (_, idx) => {
                    const active = finalePage === idx;
                    return (
                      <button
                        key={`finale-dot-${idx}`}
                        type="button"
                        className={`h-2.5 w-2.5 rounded-full transition ${
                          active
                            ? darkMode
                              ? "bg-slate-100"
                              : "bg-slate-900"
                            : darkMode
                            ? "bg-white/30"
                            : "bg-slate-300"
                        } ${active ? "scale-110" : ""}`}
                        aria-label={`Page ${idx + 1}`}
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                          goToFinalePage(idx);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="hidden">
              <div className="bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl p-4 shadow-xl flex flex-col min-h-0 h-[min(720px,calc(100vh-4rem))]">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-center">Chat</h2>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={`text-[11px] font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-600"
                      }`}
                      onClick={() => setIsChatRulesOpen(true)}
                    >
                      Règles
                    </button>
                    <button
                      type="button"
                      className={`text-[11px] font-semibold ${
                        darkMode ? "text-amber-300" : "text-blue-600"
                      }`}
                      onClick={() => setShowBlockedList((prev) => !prev)}
                    >
                      Joueurs bloqués ({blockedCount})
                    </button>
                  </div>
                </div>
                {renderBlockedListPanel()}
                <div className="flex-1 min-h-0 border rounded px-2 py-1 bg-white text-xs space-y-1 flex flex-col justify-end overflow-hidden">
                  {visibleMessages.map((msg, idx) => {
                    const count = visibleMessages.length;
                    const rankFromBottom = count - 1 - idx;
                    let opacity = 1;

                    if (rankFromBottom >= chatFullVisibleLines) {
                      const extra = rankFromBottom - (chatFullVisibleLines - 1);
                      const maxExtra = chatVisibleLimit - chatFullVisibleLines;
                      const t = maxExtra > 0 ? Math.min(extra / maxExtra, 1) : 1;
                      opacity = 1 - t * (1 - MIN_CHAT_OPACITY);
                    }

                    const author = (msg.nick || msg.author || "Anonyme").trim();
                    const authorInstallId =
                      typeof msg.installId === "string" ? msg.installId : "";
                    const isYou = authorInstallId
                      ? authorInstallId === installId
                      : author === selfNick;
                    const isSystem = isSystemAuthor(author);
                    const isLast = msg.id === lastMessageId;
                    const canOpenMenu =
                      !isSystem && authorInstallId && authorInstallId !== installId;

                    return (
                      <div
                        key={msg.id}
                        data-chat-row
                        className={`w-full transition-opacity duration-300 ${
                          isLast ? "slide-fade-in" : ""
                        }`}
                        style={{ opacity }}
                      >
                        {isSystem ? (
                          <div className="w-full px-1 py-0.5 text-sm italic text-orange-700">
                            {msg.text}
                          </div>
                        ) : (
                          <div
                            className={[
                              "w-full px-1 py-0.5 text-sm",
                              isYou ? "bg-blue-50" : "bg-white",
                            ].join(" ")}
                          >
                            {canOpenMenu ? (
                              <button
                                type="button"
                                className="font-semibold mr-1 text-black hover:underline"
                                onClick={(e) =>
                                  openUserMenu(e, {
                                    nick: author,
                                    installId: authorInstallId,
                                    messageId: msg.id,
                                  })
                                }
                              >
                                {author} :
                              </button>
                            ) : (
                              <span className="font-semibold mr-1 text-black">
                                {author} :
                              </span>
                            )}
                            <span className="text-black">{msg.text}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_REPLIES.map((txt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => submitChat(null, txt)}
                      disabled={chatInputDisabled}
                      className="px-2 py-1 text-sm rounded-full border bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {txt}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    ref={chatInputRef}
                    type={chatInputType}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                    enterKeyHint="send"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-autofill="off"
                    aria-autocomplete="none"
                    aria-label="Message du chat"
                    onFocus={handleChatInputFocus}
                    readOnly={chatInputDisabled}
                    aria-disabled={chatInputDisabled}
                    className="flex-1 border rounded px-3 py-2 text-sm ios-input chat-input"
                    placeholder={chatInputPlaceholder}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatInputKeyDown}
                  />
                  <button
                    type="button"
                    className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                    disabled={!chatInput.trim() || chatInputDisabled}
                    onClick={() => submitChat(null)}
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        {praiseOverlay}
        {chatOverlays}
      </>
    );
  }

  // ========================================================================
  // *** NOUVELLE MISE EN PAGE MOBILE PENDANT LA MANCHE ***
  // ========================================================================

  // === Mise en page mobile dédiée pendant la manche ===
  // ??cran unique : classement + prévisualisation du mot + grille en bas + bouton de chat
  const useUltraCompactLayout = isUltraCompact;
  if (isMobileLayout && useUltraCompactLayout && phase === "playing") {
    const compactRankingList = rankingSource;
    const compactTotal =
      compactRankingList.length || (Array.isArray(players) ? players.length : 0) || null;
    const compactRank =
      compactRankingList.find((entry) => entry.nick === selfNick)?.rank ?? livePosition;
    const compactScore = typeof score === "number" ? score : null;
    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    const minViewportDim = Math.max(0, Math.min(viewportWidth, viewportHeight));
    const gridMaxFromViewport = Math.max(
      200,
      Math.min(minViewportDim - 8, MOBILE_GRID_MAX_WIDTH)
    );
    const mobileGridSide = Math.round(gridMaxFromViewport);
    const mobileGapPx = "clamp(4px, 1.8vw, 10px)";
    const mobileTileFontPx = Math.max(
      18,
      Math.min(
        32,
        Math.round((mobileGridSide / Math.max(gridSize, 1)) * 0.42)
      )
    );
    const useVisualViewport = !(isChatOpenMobile || isChatClosing);
    const lockedChatHeight = chatBodyLockHeightRef.current || null;
    const mobileViewportHeightCandidates =
      typeof window !== "undefined"
        ? (useVisualViewport
            ? [
                mobileLayoutSizing.viewportHeight,
                ((isChatOpenMobile || isChatClosing) &&
                gameViewportFreezeHeightRef.current > 0
                  ? gameViewportFreezeHeightRef.current
                  : window.innerHeight),
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
            : lockedChatHeight
            ? [lockedChatHeight]
            : [
                ((isChatOpenMobile || isChatClosing) &&
                gameViewportFreezeHeightRef.current > 0
                  ? gameViewportFreezeHeightRef.current
                  : window.innerHeight),
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
          ).filter((v) => Number.isFinite(v) && v > 0)
        : [];
    const mobileViewportHeight = mobileViewportHeightCandidates.length
      ? Math.min(...mobileViewportHeightCandidates)
      : 0;
    const chatViewportHeightEffective =
      chatBodyLockHeightRef.current || chatViewportHeight || mobileViewportHeight;
    const mobileViewportContainerStyle =
      mobileViewportHeight > 0
        ? {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: `${Math.round(mobileViewportHeight)}px`,
            height: `${Math.round(mobileViewportHeight)}px`,
            maxHeight: `${Math.round(mobileViewportHeight)}px`,
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }
        : {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: "100vh",
            height: "100dvh",
            maxHeight: "100dvh",
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          };

    const compactCountdownValue =
      countdownLines.find((line) => /^\d+$/.test(line)) ||
      (countdownLines
        .map((line) => String(line).match(/\d+/))
        .find((m) => m)?.[0] ??
        "");

    return (
      <>
        <div
          className={`flex flex-col ${
            darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
          }`}
          style={mobileViewportContainerStyle}
        >
        <style>{slideStyles}</style>
        <div className="px-3 pt-0.5 pb-0 text-[10px] font-semibold flex items-center justify-between gap-2">
          <span className="truncate">
            {compactRank ? `#${compactRank}` : "#?"}
            {compactTotal ? `/${compactTotal}` : ""}
            {compactScore !== null ? ` · ${compactScore}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-1 py-0.5 rounded-md border text-[9px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
            >
              <span className="material-icons-outlined text-[12px] leading-none" aria-hidden="true">
                settings
              </span>
              <span className="sr-only">Parametres</span>
            </button>
          </div>
          <span className="tabular-nums">
            {compactCountdownValue ? `${compactCountdownValue}s` : ""}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center px-2 pb-3">
          <MobileGrid
            board={board}
            BONUS_CLASSES={BONUS_CLASSES}
            bonusLetterKey={bonusLetterKey}
            bonusLetterScore={bonusLetterScore}
            darkMode={darkMode}
            gridRef={gridRef}
            gridShake={gridShake}
            gridSize={gridSize}
            implodeActive={implodeActive}
            handleMouseDown={handleMouseDown}
            handleMouseMove={handleMouseMove}
            handleMouseUp={handleMouseUp}
            handleTouchEnd={handleTouchEnd}
            handleTouchMove={handleTouchMove}
            handleTouchStart={handleTouchStart}
            hintCellSet={hintCellSet}
            hintOutlineCellSet={hintOutlineCellSet}
            isMobileLayout={isMobileLayout}
            lightGridSurfaceStyle={lightGridSurfaceStyle}
            MOBILE_LAYOUT_MAX_WIDTH={MOBILE_GRID_MAX_WIDTH}
            mobileGapPx={mobileGapPx}
            mobileGridSide={mobileGridSide}
            mobileTileFontPx={mobileTileFontPx}
            normalizeBonusLabel={normalizeBonusLabel}
            normalizeLetterKey={normalizeLetterKey}
            phase={phase}
            specialSolvedOverlay={specialSolvedOverlay}
            tileRefs={tileRefs}
            tileScore={tileScore}
            tick={tick}
            usedSet={usedSet}
          />
        </div>
      </div>
      {praiseOverlay}
      {chatOverlays}
    </>
    );
  }

  if (isMobileLayout && (phase === "playing" || phase === "results")) {
    const isResults = phase === "results";
    const fullRanking = isResults
      ? resultsRankingMode === "total"
        ? tournamentRanking || []
        : finalRanking || []
      : rankingSource || [];
    const mobileAnnouncements = mixedFeed.slice(-8);
    const fallbackViewportWidth =
      mobileLayoutSizing.viewportWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 360);
    const fallbackBodyHeight =
      mobileLayoutSizing.bodyHeight ||
      (typeof window !== "undefined" ? window.innerHeight * 0.6 : 520);
    const mobileGridSide = Math.round(
      mobileLayoutSizing.gridSide ||
        Math.max(200, Math.min(fallbackViewportWidth - 24, MOBILE_GRID_MAX_WIDTH))
    );
    const previewFallback = 52;
    const liveFeedFallback = 0;
    const mobilePreviewHeight = Math.round(
      mobileLayoutSizing.wordPreviewHeight || previewFallback
    );
    const mobileLiveFeedHeight = Math.round(
      mobileLayoutSizing.liveFeedHeight || liveFeedFallback
    );
    const previewBlockHeight = Math.max(0, mobilePreviewHeight);
    const liveFeedMinHeight = Math.max(0, mobileLiveFeedHeight);
    const previewWordLen = liveWord ? liveWord.length : 0;
    const previewGapPx = previewWordLen >= 10 ? 2 : 4;
    const previewContentWidth = Math.max(0, fallbackViewportWidth - 44); // px-3 + px-2.5
    const previewMaxTileWidth = previewWordLen
      ? Math.floor(
          (previewContentWidth - previewGapPx * (previewWordLen - 1)) /
            previewWordLen
        )
      : 32;
    const previewTileWidth = clampValue(previewMaxTileWidth, 18, 32);
    const previewTileHeight = Math.min(
      Math.round(previewTileWidth * 1.125),
      Math.max(18, previewBlockHeight - 16)
    );
    const previewTileFontPx = clampValue(
      Math.round(previewTileWidth * 0.56),
      12,
      18
    );
    const previewTileBaseStyle = {
      width: `${previewTileWidth}px`,
      height: `${previewTileHeight}px`,
      fontSize: `${previewTileFontPx}px`,
    };
    const specialBlockHeight = Math.round(mobileLayoutSizing.rankingHeight || 0);
    const specialBaseHeight = 120;
    const specialScale =
      specialBlockHeight > 0
        ? Math.min(1, specialBlockHeight / specialBaseHeight)
        : 1;
    const specialTitleFont = Math.max(9, Math.round(11 * specialScale));
    const specialWordFont = Math.max(16, Math.round(24 * specialScale));
    const specialMetaFont = Math.max(9, Math.round(11 * specialScale));
    const specialPadY = Math.max(6, Math.round(8 * specialScale));
    const mobileGapPx = "clamp(6px, 2.4vw, 14px)";
    const mobileTileFontPx = Math.max(
      18,
      Math.min(
        32,
        Math.round((mobileGridSide / Math.max(gridSize, 1)) * 0.42)
      )
    );
    const mobileBodyHeightStyle =
      mobileLayoutSizing.bodyHeight > 0
        ? { height: `${Math.round(mobileLayoutSizing.bodyHeight)}px`, minHeight: 0 }
        : {
            minHeight: "calc(100vh - 96px)",
            height: "calc(100dvh - 96px)",
          };
    const mobileBodyPaddingTop = undefined;

    const useVisualViewport = !(isChatOpenMobile || isChatClosing);
    const lockedChatHeight = chatBodyLockHeightRef.current || null;
    const mobileViewportHeightCandidates =
      typeof window !== "undefined"
        ? (useVisualViewport
            ? [
                mobileLayoutSizing.viewportHeight,
                window.innerHeight,
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
            : lockedChatHeight
            ? [lockedChatHeight]
            : [
                window.innerHeight,
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
          ).filter((v) => Number.isFinite(v) && v > 0)
        : [];
    const mobileViewportHeight = mobileViewportHeightCandidates.length
      ? Math.min(...mobileViewportHeightCandidates)
      : 0;
    const chatViewportHeightEffective =
      chatBodyLockHeightRef.current || chatViewportHeight || mobileViewportHeight;
    const fullscreenTopPadding = isFullscreen
      ? `${Math.round(mobileHeaderOffsetPx || 0)}px`
      : "env(safe-area-inset-top)";
    const mobileViewportContainerStyle =
      mobileViewportHeight > 0
        ? {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: `${Math.round(mobileViewportHeight)}px`,
            height: `${Math.round(mobileViewportHeight)}px`,
            maxHeight: `${Math.round(mobileViewportHeight)}px`,
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: fullscreenTopPadding,
            paddingBottom: "env(safe-area-inset-bottom)",
          }
        : {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: "100vh",
            height: "100dvh",
            maxHeight: "100dvh",
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: fullscreenTopPadding,
            paddingBottom: "env(safe-area-inset-bottom)",
          };

    const chatAvailableHeight = useVisualViewportForChat
      ? Math.max(0, visualViewportHeightForChat - chatViewportTopInsetPx)
      : Math.max(0, Math.round(chatViewportHeightEffective - chatTopInsetPx));
    const chatOverlayStyle =
      !useVisualViewportForChat && chatKeyboardInsetPx > 0
        ? { paddingBottom: `${Math.round(chatKeyboardInsetPx)}px` }
        : undefined;
    const chatSheetHeightPx =
      chatAvailableHeight > 0
        ? clampValue(
            Math.round(chatAvailableHeight * CHAT_SHEET_HEIGHT_RATIO),
            260,
            chatAvailableHeight
          )
        : 0;
    const chatSheetStyle = chatSheetHeightPx
      ? {
          height: `${chatSheetHeightPx}px`,
          maxHeight: `${chatSheetHeightPx}px`,
        }
      : undefined;
    if (isResults) {
      const resultsPages = isTargetRound
        ? ["round", "total", "vocab"]
        : ["round", "total", "found", "all", "vocab"];
      const selfNickForResults = nicknameRef.current.trim();
      const selfResultEntry =
        selfNickForResults && Array.isArray(finalResults)
          ? finalResults.find((entry) => entry.nick === selfNickForResults)
          : null;
      const showOfflineLabel = !selfResultEntry;
      const safeResultsPage = clampValue(mobileResultsPage, 0, resultsPages.length - 1);
      const resultsPageKey = resultsPages[safeResultsPage];
      const showVocabPage = resultsPageKey === "vocab";
      const resultsRankingModeForMobile = resultsPageKey === "total" ? "total" : "round";
      const resultsRankingList =
        resultsRankingModeForMobile === "total"
          ? tournamentRanking || []
          : finalRanking || [];
      const showResultsWords =
        resultsPageKey === "found" || resultsPageKey === "all";
      const resultsFadeClass =
        resultsSlidePhase === "out"
          ? "results-fade-out"
          : resultsSlidePhase === "in"
          ? "results-fade-in"
          : "";
      const resultsHeaderLabel = showResultsWords
        ? "Mots"
        : showVocabPage
        ? "Vocabulaire"
        : "Classement";
      const resultsHeaderSuffix = showResultsWords || showVocabPage
        ? ""
        : resultsPageKey === "round"
        ? "manche"
        : "g\u00e9n\u00e9ral";
      const resultsWordsTitle =
        resultsPageKey === "found"
          ? `Mots trouv\u00e9s (${foundWordsCount})`
          : `Tous les mots (${allWords.length})`;
      const wordsEmpty =
        resultsPageKey === "all"
          ? allWords.length === 0
          : foundWordsCount === 0;
      const guidedSwipeHintText =
        guidedResultsEligible && guidedResultsStep === GUIDED_RESULTS_STEPS.SWIPE_TOTAL && resultsPageKey === "round"
          ? "pour voir le classement général"
          : guidedResultsEligible && guidedResultsStep === GUIDED_RESULTS_STEPS.SWIPE_FOUND && resultsPageKey === "total"
          ? "pour voir les mots trouvés"
          : guidedResultsEligible && guidedResultsStep === GUIDED_RESULTS_STEPS.SWIPE_ALL && resultsPageKey === "found"
          ? "pour voir tous les mots trouvables"
          : null;
      const guidedSwipeOverlay = guidedSwipeHintText ? (
        <div className="absolute inset-0 pointer-events-none z-30">
          <div
            className={`absolute bottom-4 right-4 flex items-center gap-3 rounded-full px-5 py-4 text-[20px] font-semibold shadow-xl ${
              darkMode
                ? "text-slate-100 ring-2 ring-white/10"
                : "text-slate-900 ring-2 ring-black/10"
            }`}
            style={{ backgroundColor: darkMode ? "#0b0f14" : "#ffffff", opacity: 1 }}
          >
            <span className="material-symbols-outlined text-[40px] guide-swipe">
              swipe_left
            </span>
            <span>{guidedSwipeHintText}</span>
          </div>
        </div>
      ) : null;
      const showGuidedWordHint =
        guidedResultsEligible &&
        guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_WORD &&
        resultsPageKey === "all" &&
        guidedWordTarget;
      const guidedWordOverlay = showGuidedWordHint ? (
        <div className="absolute inset-0 pointer-events-none z-30">
          <div
            className={`absolute bottom-4 left-3 flex items-center gap-3 rounded-full px-4 py-3 text-[18px] font-semibold shadow-xl ${
              darkMode
                ? "text-slate-100 ring-2 ring-white/10"
                : "text-slate-900 ring-2 ring-black/10"
            }`}
            style={{
              backgroundColor: darkMode ? "#0b0f14" : "#ffffff",
              maxWidth: "360px",
              opacity: 1,
            }}
          >
            <span className="material-symbols-outlined text-[32px]">
              gesture_select
            </span>
            <span>Clique sur un mot pour savoir qui l'a trouvé</span>
          </div>
        </div>
      ) : null;
      const isTargetResults = isTargetRound;
      const resultsCardClassName = `relative rounded-xl px-3 py-2 flex flex-col gap-2 overflow-hidden ${
        isTargetResults ? "flex-none" : "flex-1 min-h-0"
      } ${darkMode ? "bg-slate-900/90" : "bg-white/90"} box-border`;
      const resultsCardStyle = isTargetResults
        ? { height: "46vh", minHeight: "38vh", maxHeight: "52vh" }
        : { minHeight: "320px" };
      const showResultsDots = resultsPages.length > 1;
      const summaryWrapperClass = isTargetResults
        ? showResultsDots
          ? "flex-none"
          : "-mt-1 flex-none"
        : showResultsDots
        ? "mt-1"
        : "mt-2";
      const resultsDots = showResultsDots ? (
        <div className="flex items-center justify-center gap-1.5 py-1">
          {resultsPages.map((page, idx) => {
            const isActive = idx === safeResultsPage;
            const isVocabDot = page === "vocab";
            const showVocabAlert = isVocabDot && vocabLevelUp;
            const dotColor = showVocabAlert
              ? "bg-red-500"
              : isActive
              ? darkMode
                ? "bg-slate-100"
                : "bg-slate-900"
              : darkMode
              ? "bg-white/30"
              : "bg-slate-300";
            return (
              <button
                key={page}
                type="button"
                className={`h-2.5 w-2.5 rounded-full transition ${dotColor} ${
                  isActive ? "scale-110" : ""
                } ${showVocabAlert ? "animate-pulse" : ""}`}
                aria-label={`Page ${idx + 1}`}
                aria-current={isActive ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  goToResultsPage(idx);
                }}
              />
            );
          })}
        </div>
      ) : null;
      return (
        <>
          <div
            className={`flex flex-col ${
              darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
            }`}
            style={mobileViewportContainerStyle}
          >
          <style>{slideStyles}</style>
          <MobileHeader
            activeRoom={activeRoom}
            countdownLines={countdownLines}
            darkMode={darkMode}
            gridSize={gridSize}
            headerRef={mobileHeaderRef}
            isFinaleBanner={isFinaleBanner}
            isTargetRound={isTargetRound}
            onOpenSettings={() => setIsSettingsOpen(true)}
            phase={phase}
            roomLabelSeparator=" - "
            showHelpButton={false}
            tournament={tournament}
          />
          <div
            className="flex-1 flex flex-col gap-1 px-3 pt-1 pb-2 overflow-hidden box-border"
            style={{
              ...mobileBodyHeightStyle,
              paddingTop: mobileBodyPaddingTop,
            }}
          >
            <div
              className={resultsCardClassName}
              style={resultsCardStyle}
              onTouchStart={handleResultsTouchStart}
              onTouchMove={handleResultsTouchMove}
              onTouchEnd={handleResultsTouchEnd}
              onTouchCancel={handleResultsTouchEnd}
            >
              {guidedSwipeOverlay}
              {guidedWordOverlay}
              <div className="relative flex-1 min-h-0 overflow-hidden z-10">
                <div className={`flex flex-col gap-2 h-full results-fade-layer ${resultsFadeClass}`}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="font-semibold">
                      {resultsHeaderLabel}
                      {!showResultsWords && resultsHeaderSuffix ? (
                        <SwapFadeText value={resultsHeaderSuffix} className="ml-1" />
                      ) : null}
                    </div>
                    {!showResultsWords &&
                      tournament?.round &&
                      tournament?.totalRounds && (
                        <span className="text-slate-500 dark:text-slate-300 whitespace-nowrap">
                          {tournament.round === tournament.totalRounds ? (
                            <>Manche finale</>
                          ) : (
                            <>
                              Manche {tournament.round}/{tournament.totalRounds}
                            </>
                          )}
                        </span>
                      )}
                    {showResultsWords ? (
                      <SwapFadeText
                        value={resultsWordsTitle}
                        className="text-slate-500 dark:text-slate-300 whitespace-nowrap"
                      />
                    ) : null}
                  </div>

                  {showOfflineLabel ? (
                    <div className="text-[11px] text-amber-500">
                      Vous etiez hors ligne sur cette manche.
                    </div>
                  ) : null}

                  {showVocabPage ? (
                    renderVocabPanel({ panelClassName: "flex-1 min-h-0 pt-2" })
                  ) : showResultsWords && !isTargetRound ? (
                    <div className="flex flex-col gap-2 flex-1 min-h-0">
                      {wordsEmpty ? (
                        <div className="text-xs text-slate-500 dark:text-slate-300">
                          {resultsPageKey === "all"
                            ? "Aucun mot (solveur non lanc\u00e9)"
                            : "Aucun mot trouv\u00e9."}
                        </div>
                      ) : null}
                      <div
                        className="flex-1 min-h-0 overflow-y-auto pr-1"
                        style={{ maxHeight: WORDS_SCROLL_MAX_HEIGHT }}
                      >
                        {displayList.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-xs text-slate-400">
                            Aucun mot trouv\u00e9.
                          </div>
                        ) : (
                          <ul className="relative flex flex-col text-sm">
                            {displayList.map((entry) => {
                              const selected = analysis?.word === entry.word;
                              const status = entry.status;
                              const isPending = status === "pending";
                              const isRejected = status === "rejected";
                              const isFound = entry.isFound || isPending;
                              const bestPts = entry.bestPts;
                              const userPts = entry.userPts;
                              const showOpt =
                                isFound &&
                                typeof bestPts === "number" &&
                                typeof userPts === "number" &&
                                bestPts !== userPts &&
                                !isPending &&
                                !isRejected &&
                                !isSpeedRound;
                              const visible = showAllWords || isFound || isRejected;
                              const wordClassName = isRejected
                                ? darkMode
                                  ? "font-semibold text-red-300 line-through"
                                  : "font-semibold text-red-600 line-through"
                                : isPending
                                ? darkMode
                                  ? "font-semibold text-slate-300 opacity-70"
                                  : "font-semibold text-gray-500 opacity-70"
                                : isFound
                                ? "font-semibold"
                                : "text-gray-600";
                              const isGuidedWordTarget =
                                showGuidedWordHint && entry.word === guidedWordTarget;
                              return (
                                <li
                                  key={entry.word}
                                  onMouseEnter={() => analyzeWord(entry.word)}
                                  onMouseLeave={() => {
                                    setAnalysis(null);
                                    setHighlightPlayers([]);
                                  }}
                                  ref={(el) => {
                                    if (el) listItemRefs.current.set(entry.word, el);
                                    else listItemRefs.current.delete(entry.word);
                                  }}
                                  className={`rounded px-1 flex items-center justify-between gap-2 transition ${
                                    selected ? "bg-blue-50 text-blue-800" : "hover:bg-gray-100"
                                  } ${isGuidedWordTarget ? "guide-highlight guide-blink" : ""}`}
                                  style={{
                                    transitionDuration: "220ms",
                                    opacity: visible ? 1 : 0,
                                    transform: visible ? "translateY(0)" : "translateY(-8px)",
                                    maxHeight: visible ? "48px" : "0px",
                                    paddingTop: "2px",
                                    paddingBottom: "2px",
                                    overflow: isGuidedWordTarget ? "visible" : "hidden",
                                    pointerEvents: visible ? "auto" : "none",
                                    position: visible ? "relative" : "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    color:
                                      !isFound && !isPending && darkMode
                                        ? DARK_WORD_INACTIVE
                                        : undefined,
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="flex items-center gap-2 text-left w-1/2 min-w-0"
                                    onClick={() => openWordInfoModal(entry.word)}
                                  >
                                    {isFound ? (
                                      <span
                                        style={{
                                          ...foundDotStyle,
                                          opacity: isPending ? 0.4 : 1,
                                        }}
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <span
                                        style={{ ...foundDotStyle, opacity: 0 }}
                                        aria-hidden="true"
                                      />
                                    )}
                                    <span className="flex items-center gap-1 min-w-0">
                                      <span className={wordClassName}>{entry.word}</span>
                                      {renderGobbleCandidate(entry.word)}
                                    </span>
                                  </button>
                                  <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                    {typeof userPts === "number" && isFound && (
                                      <span
                                        className={`font-extrabold ${
                                          darkMode ? "text-slate-100" : "text-slate-800"
                                        }`}
                                      >
                                        +{userPts} pts
                                      </span>
                                    )}
                                    {isPending && (
                                      <span className="text-[0.65rem] text-gray-400">
                                        envoi...
                                      </span>
                                    )}
                                    {isRejected && (
                                      <span
                                        className={`text-[0.65rem] ${
                                          darkMode ? "text-red-300" : "text-red-600"
                                        }`}
                                      >
                                        refusé
                                      </span>
                                    )}
                                    {!isFound && typeof bestPts === "number" && (
                                      <span className="text-slate-500 opacity-75">
                                        ({bestPts} pts)
                                      </span>
                                    )}
                                    {showOpt && (
                                      <span
                                        className={`text-[0.65rem] ${
                                          darkMode ? "text-red-300" : "text-red-600"
                                        }`}
                                      >
                                        (opt: {bestPts} pts)
                                      </span>
                                    )}
                                  </span>
                                  {isGuidedWordTarget ? (
                                    <span className="sr-only">
                                      Cliquez sur ce mot pour savoir qui l'a trouvé.
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 flex-1 min-h-0">
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <RankingWidgetMobile
                          fullRanking={resultsRankingList}
                          selfNick={selfNick}
                          darkMode={darkMode}
                          expanded={true}
                          animateRank={false}
                          animateReorder={resultsMetaPulse}
                          showWheel={false}
                          flatStyle={true}
                          showRoundAward={true}
                          assetVersion={assetVersion}
                          gobbleWordAwardsByNick={gobbleAwardsForLive}
                          renderNickSuffix={renderNickSuffix}
                          renderAfterRank={
                            resultsRankingModeForMobile === "total" ? renderRankDelta : null
                          }
                          recordBadgesByNick={
                            resultsRankingModeForMobile === "round"
                              ? recordBadgesByNickForRound
                              : null
                          }
                          onRecordBadgeClick={openRecordModal}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {resultsDots}
            {(isTargetRound ? targetSummary : endStats) && (
              <div className={summaryWrapperClass}>
                {isTargetRound
                  ? renderTargetSummaryCard("w-full")
                  : renderEndStatsCard("w-full")}
              </div>
            )}
          </div>

        </div>
        {praiseOverlay}
        {chatOverlays}
      </>
    );
    }

   return (
    <>
      <div
        className={`flex flex-col ${
          darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
        }`}
        style={mobileViewportContainerStyle}
      >
   

        <style>{slideStyles}</style>

        {/* En-tête compact : titre, salon, score et boutons rapides */}
        <MobileHeader
          activeRoom={activeRoom}
          countdownLines={countdownLines}
          darkMode={darkMode}
          gridSize={gridSize}
          headerRef={mobileHeaderRef}
          isFinaleBanner={isFinaleBanner}
          isTargetRound={isTargetRound}
          onOpenSettings={() => setIsSettingsOpen(true)}
          phase={phase}
          roomLabelSeparator=" - "
          roundStatsText={
            phase === "playing" && roundStats && !isTargetRound
              ? `${roundStats.words ?? "?"} mots - ${
                  formatNumber(roundStats.totalPts ?? roundStats.maxPts ?? 0) || "?"
                } pts`
              : null
          }
          setShowHelp={setShowHelp}
          showHelpButton={true}
          showRoundStats={true}
          tournament={tournament}
        />
        {showHelp && (
          <div
            className="fixed inset-0 z-[9996] flex items-start justify-center bg-black/45 px-4 pt-20 pb-6"
            onClick={() => setShowHelp(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`w-full max-w-sm rounded-2xl border px-4 py-3 shadow-xl ${
                darkMode
                  ? "bg-slate-900/90 text-slate-100 border-slate-700"
                  : "bg-white/90 text-slate-900 border-slate-200"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[11px] font-extrabold tracking-widest uppercase text-amber-500">
                Aide rapide
              </div>
              <div className="mt-2 text-[12px] font-semibold">Principes de base</div>
              <ul className="mt-1 text-[11px] list-disc list-inside space-y-1">
                <li>Forme des mots en reliant des tuiles qui se touchent (diagonales OK).</li>
                <li>Une tuile ne peut pas etre reutilisee dans le meme mot.</li>
                <li>Entree valide le mot, Backspace efface.</li>
              </ul>
              <div className="mt-3 text-[12px] font-semibold">Bareme</div>
              <ul className="mt-1 text-[11px] list-disc list-inside space-y-1">
                <li>Score = somme des lettres + bonus de longueur.</li>
                <li>Bonus L2/L3 multiplient la lettre.</li>
                <li>Bonus M2/M3 multiplient le mot.</li>
              </ul>
              <div className="mt-3 text-[12px] font-semibold">Manches speciales</div>
              <ul className="mt-1 text-[11px] list-disc list-inside space-y-1">
                <li>Lettre bonus : une lettre rapporte plus de points.</li>
                <li>Rapidite : tous les mots valent 11 points.</li>
                <li>Monstrueuse : grille plus grande, plus de mots possibles.</li>
                <li>Objectif : trouver le mot le plus long ou le plus rentable.</li>
              </ul>
              <div className="mt-3 text-[12px] font-semibold">Support</div>
              <p className="mt-1 text-[11px]">
                <a
                  href="mailto:support@gobble.fr"
                  className="underline underline-offset-2 text-amber-600 dark:text-amber-400"
                >
                  support@gobble.fr
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Contenu principal mobile : classement + apercu mot + grille */}
        <div
          className="flex-1 flex flex-col gap-1 px-3 pt-1 pb-2 overflow-hidden box-border"
          style={{
            ...mobileBodyHeightStyle,
            paddingTop: mobileBodyPaddingTop,
          }}
        >
          {phase === "playing" && isTargetRound ? (
            <div
              ref={mobileRankingRef}
              className="relative rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border"
              style={
                specialBlockHeight > 0
                  ? {
                      height: `${specialBlockHeight}px`,
                      maxHeight: `${specialBlockHeight}px`,
                      minHeight: 0,
                      paddingTop: `${specialPadY}px`,
                      paddingBottom: `${specialPadY}px`,
                    }
                  : { paddingTop: `${specialPadY}px`, paddingBottom: `${specialPadY}px` }
              }
            >
              <div
                className="font-extrabold tracking-widest text-center text-amber-500 dark:text-amber-300"
                style={{ fontSize: `${specialTitleFont}px` }}
              >
                {specialRound?.type === "target_long"
                  ? "TROUVE LE PLUS LONG MOT"
                  : specialRound?.type === "target_score"
                  ? "TROUVE LE MEILLEUR MOT"
                  : "MANCHE SPECIALE"}
              </div>
              <div
                className="mt-2 text-center font-black tracking-widest tabular-nums"
                style={{ fontSize: `${specialWordFont}px` }}
              >
                {specialHintDisplay ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span>{specialHintDisplay}</span>
                    {showSolvedTargetLoupe && (
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                          darkMode
                            ? "bg-slate-800 border-slate-600 text-slate-100"
                            : "bg-white border-gray-300 text-gray-700"
                        } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDefinition(solvedTargetWord);
                        }}
                        aria-label="Voir la dGinition"
                        title="Voir la dGinition"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="11" cy="11" r="7" />
                          <line x1="16.65" y1="16.65" x2="21" y2="21" />
                        </svg>
                      </button>
                    )}
                  </span>
                ) : (
                  <span
                    className="tracking-normal opacity-80"
                    style={{ fontSize: `${Math.max(11, Math.round(13 * specialScale))}px` }}
                  >
                    MOT MYSTÈRE
                  </span>
                )}
              </div>
              {specialRound?.type === "target_score" ? (
                <div
                  className="mt-1 font-semibold opacity-80 text-center"
                  style={{ fontSize: `${specialMetaFont}px` }}
                >
                  {Number.isFinite(targetScoreMax) && targetScoreMax > 0
                    ? `${formatNumber(targetScoreMax)} pts`
                    : "-- pts"}
                </div>
              ) : null}
              {specialHint?.length ? (
                <div
                  className="mt-1 font-semibold opacity-70 text-center"
                  style={{ fontSize: `${specialMetaFont}px` }}
                >
                  {specialHint.length} lettres
                </div>
              ) : null}
              <div
                className="mt-1 font-semibold opacity-80 text-center"
                style={{ fontSize: `${specialMetaFont}px` }}
              >
                {nextHintLabel}
              </div>
              {phase === "playing" && !isDailyPlay && !isTargetRound ? (
                <button
                  type="button"
                  className={`absolute bottom-2 right-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide backdrop-blur ${
                    darkMode
                      ? "bg-slate-900/70 text-white border border-white/10"
                      : "bg-white/80 text-slate-900 border border-slate-200"
                  }`}
                  onClick={() => openPlayersOverlaySnapshot(fullRanking)}
                >
                  Liste des joueurs
                </button>
              ) : null}
            </div>
          ) : (
            <div
              ref={mobileRankingRef}
              className="relative rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border"
              style={
                mobileLayoutSizing.rankingHeight > 0
                  ? {
                      height: `${Math.round(mobileLayoutSizing.rankingHeight)}px`,
                      maxHeight: `${Math.round(mobileLayoutSizing.rankingHeight)}px`,
                      minHeight: 0,
                    }
                  : undefined
              }
            >
              {phase === "playing" && !isDailyPlay && !isTargetRound ? (
                <button
                  type="button"
                  className={`absolute top-2 right-2 z-10 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide backdrop-blur ${
                    darkMode
                      ? "bg-slate-900/70 text-white border border-white/10"
                      : "bg-white/80 text-slate-900 border border-slate-200"
                  }`}
                  onClick={() => openPlayersOverlaySnapshot(fullRanking)}
                >
                  Liste des joueurs
                </button>
              ) : null}
              <RankingWidgetMobile
                fullRanking={fullRanking}
                selfNick={selfNick}
                darkMode={darkMode}
                expanded={false}
                flatStyle={true}
                highlightedPlayers={highlightPlayers}
                fitHeight={true}
                assetVersion={assetVersion}
                gobbleWordAwardsByNick={gobbleAwardsForLive}
                renderNickSuffix={renderNickSuffix}
                className="h-full"
              />
            </div>
          )}

          <MobileWordPreview
            countdownLines={countdownLines}
            currentDisplay={currentDisplay}
            darkMode={darkMode}
            liveWord={liveWord}
            onRotateGrid={rotateGridClockwise}
            phase={phase}
            previewBlockHeight={previewBlockHeight}
            previewGapPx={previewGapPx}
            previewTileBaseStyle={previewTileBaseStyle}
            previewStats={{
              show: showPreviewStats,
              wordsFoundLabel,
              totalWordsLabel,
              scoreLabel,
              totalScoreLabel,
            }}
            shake={shake}
          />
          <div className="flex-1 min-h-0 flex flex-col gap-1">
            <MobileGrid
              board={board}
              BONUS_CLASSES={BONUS_CLASSES}
              bonusLetterKey={bonusLetterKey}
              bonusLetterScore={bonusLetterScore}
              darkMode={darkMode}
              gridRef={gridRef}
              gridShake={gridShake}
              gridSize={gridSize}
              implodeActive={implodeActive}
              gridRotationTurns={gridRotationTurns}
              handleMouseDown={handleMouseDown}
              handleMouseMove={handleMouseMove}
              handleMouseUp={handleMouseUp}
              handleTouchEnd={handleTouchEnd}
              handleTouchMove={handleTouchMove}
              handleTouchStart={handleTouchStart}
              hintCellSet={hintCellSet}
              hintOutlineCellSet={hintOutlineCellSet}
              isMobileLayout={isMobileLayout}
              lightGridSurfaceStyle={lightGridSurfaceStyle}
              MOBILE_LAYOUT_MAX_WIDTH={MOBILE_GRID_MAX_WIDTH}
              mobileGapPx={mobileGapPx}
              mobileGridSide={mobileGridSide}
              mobileTileFontPx={mobileTileFontPx}
              normalizeBonusLabel={normalizeBonusLabel}
              normalizeLetterKey={normalizeLetterKey}
              phase={phase}
              specialSolvedOverlay={specialSolvedOverlay}
              tileRefs={tileRefs}
              tileScore={tileScore}
              tick={tick}
              usedSet={usedSet}
            />
            <div
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-2 shadow-sm flex-1 min-h-0 box-border"
              style={{
                minHeight: `${liveFeedMinHeight}px`,
                flexBasis: `${liveFeedMinHeight}px`,
              }}
            >
              <LiveFeed
                items={mobileAnnouncements}
                darkMode={darkMode}
                maxHeight="100%"
              />
            </div>
          </div>
        </div>
      </div>
      {praiseOverlay}
      {chatOverlays}
    </>
  );
  }

  
  return (
    <>
      <div className="p-6 max-w-[1600px] mx-auto">
        <style>{slideStyles}</style>
      <div className="topbar mb-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-white border rounded-xl px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-base sm:text-lg font-extrabold tracking-tight leading-none">GOBBLE</div>
            <div className="text-[0.7rem] sm:text-xs text-gray-500 leading-none">Boggle en ligne</div>
          </div>

          <div className="flex items-center gap-1 text-[11px] sm:text-xs text-gray-700">
            <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">
              {tournament?.round && tournament?.totalRounds ? (
                <>
                  {isFinaleBanner ? (
                    <>Manche finale</>
                  ) : (
                    <>
                      Manche {tournament.round}/{tournament.totalRounds}
                    </>
                  )}
                </>
              ) : isFinaleBanner ? (
                <>Manche finale</>
              ) : (
                <>
                  {activeRoom?.label || "Salon"} · {gridSize}x{gridSize}
                </>
              )}
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm sm:text-base font-extrabold text-center">
                  {countdownLines.map((line, idx) => (
                    <span
                      key={`${line}-${idx}`}
                      className={`block ${
                        /^\d+$/.test(line)
                          ? "text-xl font-black leading-none"
                          : String(line).startsWith("MANCHE SPECIALE")
                          ? "text-[0.65rem] font-extrabold tracking-widest text-orange-600 dark:text-orange-300"
                          : ""
                      }`}
                    >
                      {line}
                    </span>
                  ))}
                </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-2 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold rounded-lg border bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
            >
              <span className="material-icons-outlined text-[16px] leading-none" aria-hidden="true">
                settings
              </span>
              <span className="sr-only">Parametres</span>
            </button>
            <button
              onClick={() => setShowHelp((v) => !v)}
              className="px-2 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold rounded-lg border bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="sr-only">Aide</span>
            </button>
          </div>
        </div>
      </div>

      {connectionError && (
        <div className="mb-4 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
          {connectionError}
        </div>
      )}

      {showHelp && (
        <div className="mb-4 bg-white border rounded-xl p-3 text-sm text-gray-700">
          <div className="font-bold mb-1">Aide rapide</div>
          <ul className="list-disc list-inside space-y-1">
            <li>Saisie clavier ou glisser doigt/souris sur la grille pour former un mot.</li>
            <li>Entrée valide le mot, Backspace efface.</li>
            <li>Tab alterne entre saisie et chat (focus automatique).</li>
            <li>Score = lettres (bonus L2/L3) x multiplicateurs de mot (M2/M3) + bonus de longueur.</li>
          </ul>
        </div>
      )}

      {/* plus de overflow-x-auto ici, on laisse le navigateur gerer le scroll horizontal */}
      <div
                className="main-grid grid gap-4 sm:gap-6 items-stretch grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
        style={
          isMobileLayout
            ? {}
            : {
                height: MAIN_GRID_HEIGHT,
                minHeight: "520px",
                maxHeight: MAIN_GRID_HEIGHT,
                gridTemplateColumns: GRID_COL_TEMPLATE,
              }
        }
      >
      
        {/* Colonne 1 : Joueurs */}
        <div
          className="card bg-white border rounded-xl p-4 w-full flex flex-col gap-3 min-h-0 order-2 md:order-1"
                    style={
            isMobileLayout
              ? { ...lightPanelStyle, minHeight: 0, overflow: "visible" }
              : { ...lightPanelStyle, ...COLUMN_HEIGHT_STYLE, overflow: "hidden" }
          }

        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              {activeRoom?.label || "Salon"}{" "}
              {Array.isArray(players) && players.length > 0 ? `(${players.length})` : ""}
            </h2>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border border-gray-200">
              {serverStatus === "running"
                ? "Manche en cours"
                : serverStatus === "break"
                ? "Pause"
                : "En attente"}
            </span>
          </div>

{phase === "playing" && (
  <div className="flex flex-col gap-2 flex-1 min-h-0">
    <div className="text-sm font-semibold">Classement provisoire</div>

    <div className="flex-1 min-h-0">
      {isTargetRound && (
        <div className={`mb-2 rounded-xl border px-3 py-2 ${darkMode ? "bg-slate-900/70 border-white/10" : "bg-white border-slate-200"}`}>
          <div className="text-[11px] font-extrabold tracking-widest text-center text-amber-500 dark:text-amber-300">
            {specialRound?.type === "target_long"
              ? "TROUVE LE PLUS LONG MOT"
              : specialRound?.type === "target_score"
              ? "TROUVE LE MEILLEUR MOT"
              : "MANCHE SPECIALE"}
          </div>
          <div className="mt-3 text-center font-black tracking-widest text-xl sm:text-2xl tabular-nums">
            {specialHintDisplay ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span>{specialHintDisplay}</span>
                {showSolvedTargetLoupe && (
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                      darkMode
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : "bg-white border-gray-300 text-gray-700"
                    } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDefinition(solvedTargetWord);
                    }}
                    aria-label="Voir la dGinition"
                    title="Voir la dGinition"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.65" y1="16.65" x2="21" y2="21" />
                    </svg>
                  </button>
                )}
              </span>
            ) : (
              <span className="text-[13px] sm:text-sm tracking-normal opacity-80">
                MOT MYSTÈRE
              </span>
            )}
          </div>
          {specialHint?.length ? (
            <div className="mt-1 text-[11px] font-semibold opacity-70 text-center">
              {specialHint.length} lettres
            </div>
          ) : null}
          <div className="mt-2 text-[11px] font-semibold opacity-80 text-center">
            {nextHintLabel}
          </div>
        </div>
      )}
      {!isTargetRound && (
        <RankingWidgetMobile
          fullRanking={rankingSource || []}
          selfNick={selfNick}
          darkMode={darkMode}
          expanded={!isMobileLayout}
          animateRank={false}
          showWheel={!isMobileLayout}
          showBadge={!isMobileLayout}
          flatStyle={isMobileLayout}
          highlightedPlayers={highlightPlayers}
          assetVersion={assetVersion}
          gobbleWordAwardsByNick={gobbleAwardsForLive}
          renderNickSuffix={renderNickSuffix}
        />
      )}
    </div>
  </div>
)}



  {phase === "results" && (finalRanking.length > 0 || (tournamentRanking || []).length > 0) && (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Classement</div>
        <div className="inline-flex rounded-full border border-gray-300 overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => {
              setResultsRankingModeWithPulse("round");
            }}
            className={`px-3 py-1 transition ${
              resultsRankingMode === "round" ? "bg-blue-600 text-white" : "bg-white text-gray-600"
            }`}
          >
            Manche
          </button>
          <button
            type="button"
            onClick={() => {
              setResultsRankingModeWithPulse("total");
            }}
            className={`px-3 py-1 transition ${
              resultsRankingMode === "total" ? "bg-blue-600 text-white" : "bg-white text-gray-600"
            }`}
          >
            Total
          </button>
        </div>
      </div>
      {resultsRankingMode === "total" && tournament?.round && tournament?.totalRounds && (
        <div className="text-xs text-gray-500 whitespace-nowrap">
          {tournament.round === tournament.totalRounds ? (
            <>Manche finale</>
          ) : (
            <>
              Manche {tournament.round}/{tournament.totalRounds}
            </>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <RankingWidgetMobile
          fullRanking={resultsRankingList}
          selfNick={selfNick}
          darkMode={darkMode}
          expanded={true}
          animateRank={false}
          animateReorder={resultsMetaPulse}
          showWheel={false}
          showBadge={!isMobileLayout}
          flatStyle={isMobileLayout}
          highlightedPlayers={highlightPlayers}
          showRoundAward={true}
          assetVersion={assetVersion}
          gobbleWordAwardsByNick={gobbleAwardsForLive}
          renderNickSuffix={renderNickSuffix}
          renderAfterRank={resultsRankingMode === "total" ? renderRankDelta : null}
          recordBadgesByNick={
            resultsRankingMode === "round" ? recordBadgesByNickForRound : null
          }
          onRecordBadgeClick={openRecordModal}
        />
      </div>

    </div>
  )}

          {phase !== "playing" && finalRanking.length === 0 && (
            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="text-sm font-semibold">Joueurs connectés</div>
              <div className="flex flex-wrap gap-2 flex-1 min-h-0 overflow-auto content-start items-start">
                {(visiblePlayerList.length
                  ? visiblePlayerList
                  : [{ nick: "En attente..." }]).map((p) => {
                  const canOpenMenu =
                    p?.installId && p.installId !== installId && p.nick;
                  const pillClass = `px-3 py-1 rounded-full text-xs border ${
                    p.nick === selfNick
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : "bg-gray-50 border-gray-200 text-gray-700"
                  }`;
                  const content = (
                    <>
                      {p.nick}
                      {p.nick ? renderMedals(p.nick, p) : null}
                    </>
                  );
                  return canOpenMenu ? (
                    <button
                      key={p.nick}
                      type="button"
                      className={`${pillClass} hover:underline`}
                      onClick={(e) =>
                        openUserMenu(e, {
                          nick: p.nick,
                          installId: p.installId,
                          messageId: null,
                        })
                      }
                    >
                      {content}
                    </button>
                  ) : (
                    <span key={p.nick} className={pillClass}>
                      {content}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {/* Colonne 2 : Grille */}
        <div
          ref={playColumnRef}
          className="card bg-white border rounded-xl flex flex-col items-center space-y-6 w-full min-h-0 order-1 md:order-2 p-2"
                    style={
            isMobileLayout
              ? { minHeight: 0, overflow: "visible" }
              : { ...COLUMN_HEIGHT_STYLE, overflow: "hidden" }
          }

        >
          {!isMobileLayout && (
            <div className="w-full flex justify-center">
              <div
                ref={countdownRef}
                className={`text-center font-bold text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}
                style={
                  computedGridWidth
                    ? { width: computedGridWidth, minWidth: computedGridWidth, maxWidth: computedGridWidth }
                    : undefined
                }
              >
                {countdownLines.map((line, idx) => (
                  <div key={`${line}-${idx}`}>{line}</div>
                ))}
              </div>
            </div>
          )}
                   <div
            className={isMobileLayout ? "relative w-full" : "relative w-fit"}
            style={
              isMobileLayout
                ? undefined
                : computedGridWidth
                ? {
                    width: computedGridWidth,
                    minWidth: computedGridWidth,
                    maxWidth: computedGridWidth,
                  }
                : undefined
            }
          >

            {phase === "results" && !isMobileLayout && (isTargetRound ? targetSummary : endStats) && (
              <div
                className={`absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-sm ${
                  darkMode ? "bg-[#0b1020]/85" : "bg-white/80"
                }`}
              >
                {isTargetRound
                  ? renderTargetSummaryCard("w-full max-w-sm bg-transparent", false)
                  : renderEndStatsCard("w-full max-w-sm bg-transparent", false)}
              </div>
            )}
            {phase === "playing" && specialSolvedOverlay && (
              <div
                className={`absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-sm ${
                  darkMode ? "bg-[#0b1020]/80" : "bg-white/75"
                }`}
              >
                <div className="text-center px-4 py-6">
                  <div className="text-2xl font-black tracking-tight">
                    Bravo, vous avez trouvé !
                  </div>
                  {typeof tick === "number" && (
                    <div className="mt-3 text-4xl font-black tabular-nums">
                      Temps restant : {Math.max(0, tick)}s
                    </div>
                  )}
                </div>
              </div>
            )}
            {implodeActive ? <div className="black-hole" aria-hidden="true" /> : null}
            <div
            
              ref={gridRef}
              className={
                (isMobileLayout
                  ? "grid bg-white border rounded-xl px-2 py-2 w-full"
                  : "grid p-4 bg-white border rounded-xl w-fit mx-auto") +
                (gridShake ? " shake" : "")
              }
              style={{
                gridTemplateColumns: isMobileLayout
                  ? `repeat(${gridSize}, minmax(0, 1fr))`
                  : `repeat(${gridSize}, ${tileSizePx}px)`,
                gap: isMobileLayout ? "4px" : `${tileGapPx}px`,
                touchAction: "none",
                ...(isMobileLayout
                  ? {}
                  : {
                      width: computedGridWidth || undefined,
                      minWidth: computedGridWidth || undefined,
                      maxWidth: computedGridWidth || undefined,
                    }),
                ...lightGridSurfaceStyle,
              }}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              onTouchMove={handleTouchMove}
            >



              {board.map((_, displayIndex) => {
                const boardIndex = mapDisplayToBoardIndex(
                  displayIndex,
                  gridSize,
                  gridRotationTurns
                );
                const cell = board[boardIndex] || { letter: "?", bonus: null };
                const { letter, bonus } = cell;
                const displayBonus = normalizeBonusLabel(bonus);
                const isUsed = usedSet.has(boardIndex);
                const isBonusLetterTile =
                  bonusLetterKey && normalizeLetterKey(letter) === bonusLetterKey;
                const isHint = hintCellSet.has(boardIndex);
                const isHintOutline = hintOutlineCellSet.has(boardIndex);
                const letterPts = isBonusLetterTile
                  ? bonusLetterScore ?? 20
                  : tileScore(cell);
                const bonusClass = isBonusLetterTile
                  ? "bonus-letter-tile"
                  : displayBonus
                  ? BONUS_CLASSES[displayBonus]
                  : "bg-orange-200 border-orange-500 border-2";
                const highlightClass = isUsed ? "tile-used" : "";
                const hintClass = isHint ? "tile-hint" : "";
                const hintOutlineClass = isHintOutline ? "tile-hint-outline" : "";
                const showBonusBadge = displayBonus && !bonusLetterKey;

                return (
                  <button
  key={displayIndex}
  ref={(el) => (tileRefs.current[boardIndex] = el)}
  onMouseDown={() => handleMouseDown(boardIndex)}
  onTouchStart={(e) => handleTouchStart(e, boardIndex)}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
  onTouchCancel={handleTouchEnd}
  type="button"
  className={[
    // plus de tailles figées en px ici
    "tile-cell relative rounded-lg flex items-center justify-center font-extrabold select-none focus:outline-none focus:ring-0",
    bonusClass,
    highlightClass,
    hintClass,
    hintOutlineClass,
  ]
    .filter(Boolean)
    .join(" ")}
  style={{
    // sur ce layout mobile, chaque tuile prend 100% de sa cellule de grille
    width: "100%",
    aspectRatio: "1 / 1",
    willChange: "transform",
    fontSize: isMobileLayout ? "clamp(18px, 7vw, 30px)" : `${tileFontPx}px`,
  }}
>
  <span className="tile-letter">
    {letter}
  </span>
  {letterPts > 0 ? <span className="tile-points">{letterPts}</span> : null}
  {showBonusBadge && (
    <span
      className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${
        displayBonus === "M3"
          ? "bg-red-600 text-white"
          : displayBonus === "M2"
          ? "bg-blue-700 text-white"
          : "bg-amber-600 text-white"
      }`}
    >
      {displayBonus}
    </span>
  )}
</button>

                );
              })}
            </div>
          </div>

          <div
            className={`${gameBlockClasses} relative overflow-hidden`}
            ref={previewRef}
            style={
              computedGridWidth
                ? {
                    width: computedGridWidth,
                    minWidth: computedGridWidth,
                    maxWidth: computedGridWidth,
                  }
                : undefined
            }
            onClick={() => {
              setActiveArea("game");
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            }}
          >
            {bigScoreFlash && (
              <div
                className="big-score-burst"
                style={{ top: 6, right: 8 }}
              >
                +{bigScoreFlash.pts}
              </div>
            )}
            <div
              className="w-full flex items-center"
              style={{ minHeight: `${previewBarMinHeight}px` }}
            >
              <div className="w-9 shrink-0" />
              <div
                className={`flex-1 min-w-0 overflow-visible text-center font-bold text-lg leading-none flex items-center justify-center ${
                  shake ? "shake" : ""
                }`}
              >
                  {phase !== "playing" ? (
    <span className="text-gray-800 dark:text-white">
      {countdownLines.map((line, idx) => (
        <span
          key={`${line}-${idx}`}
          className={`block ${
            /^\d+$/.test(line)
              ? "text-2xl font-black leading-none"
              : String(line).startsWith("MANCHE SPECIALE")
              ? "text-[0.7rem] font-extrabold tracking-widest text-orange-600 dark:text-orange-300"
              : ""
          }`}
        >
          {line}
        </span>
      ))}
    </span>
  ) : liveWord ? (
    <div
      className="flex justify-center items-center gap-1 max-w-full overflow-visible"
      style={{ transform: `scale(${previewScale})`, transformOrigin: "center" }}
    >
      {liveWord.split("").map((ch, idx) => {
        // rotation déterministe légère, entre -5° et +5°
        const angle = ((idx * 17 + liveWord.length * 13) % 11) - 5;
        return (
          <div
            key={idx}
            className="preview-tile"
            style={{ ...previewTileStyle, transform: `rotate(${angle}deg)` }}
          >
            {ch}
          </div>
        );
      })}
    </div>
  ) : showPreviewStatus ? (
    <span className="text-gray-700 dark:text-slate-200">
      {currentDisplay.toUpperCase()}
    </span>
  ) : showPreviewStats ? (
    <div className="text-gray-700 dark:text-slate-200 text-sm leading-tight font-semibold">
      <div>{`mots : ${wordsFoundLabel} / ${totalWordsLabel}`}</div>
      <div>{`score : ${scoreLabel} / ${totalScoreLabel}`}</div>
    </div>
  ) : (
    <span className="text-gray-700 dark:text-slate-200">{READY_LABEL}</span>
  )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  rotateGridClockwise();
                }}
                className="w-9 h-9 shrink-0 rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm transition hover:bg-white flex items-center justify-center dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
                title="Rotation 90 deg"
              >
                <span
                  className="material-icons-outlined text-[18px] leading-none"
                  aria-hidden="true"
                >
                  autorenew
                </span>
                <span className="sr-only">Rotation 90 deg</span>
              </button>
            </div>
          </div>
        </div>

       {/* Colonne 3 : Score et résultats */}
        <div
          className="card bg-white border rounded-xl p-4 w-full flex flex-col overflow-hidden min-h-0 order-3"
          style={{ ...lightPanelStyle, ...COLUMN_HEIGHT_STYLE }}
        >
          {/* bloc score */}
          <div className="bg-white border rounded-xl p-3 w-full space-y-2 mb-4 shrink-0 relative overflow-hidden">
            <div className="text-lg font-bold text-center">Score total : {score}</div>
            {specialRound?.isSpecial && (
              <div className="text-center text-xs font-semibold text-orange-700">
                <div>
                  {specialRound.label}{" "}
                  {specialRound.type === "speed"
                    ? `mots fixes ${specialRound.fixedWordScore} pts`
                    : specialRound.type === "monstrous"
                    ? "grille monstrueuse en vue"
                    : specialRound.type === "bonus_letter"
                    ? `les ${specialRound.bonusLetter || "?"} valent ${specialRound.bonusLetterScore ?? 20} pts`
                    : "objectif : 1 seul mot"}
                </div>
              </div>
            )}
            <div className="text-center text-sm text-gray-600">
              {roundStats && !isTargetRound ? (
                <span>
                  {roundStats.words ?? "?"} mots possibles {" "}
                  {formatNumber(roundStats.totalPts ?? roundStats.maxPts ?? 0) || "?"} pts
                </span>
              ) : (
                <span>{isTargetRound ? "Stats masquées (manche cible)" : "Stats de grille indisponibles"}</span>
              )}
            </div>
          </div>

          {phase === "playing" ? (
            <div className="flex flex-col flex-1 min-h-0">
              <LiveFeed items={mixedFeed} darkMode={darkMode} maxHeight="100%" />
            </div>
          ) : isTargetRound ? (
            <div className="flex flex-col flex-1 min-h-0" />
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div>
                    <h2 className="text-lg font-bold">Mots</h2>
                    <div className="text-xs text-gray-500">
                      {showAllWords ? `Tous (${allWords.length})` : `Trouvés (${foundWordsCount})`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <div className={`inline-flex rounded-full overflow-hidden ${darkMode ? "border border-slate-700" : "border border-gray-300"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          captureListPositions(flipList);
                          setShowAllWords(false);
                        }}
                        className={`px-3 py-1 transition ${
                          !showAllWords
                            ? darkMode
                              ? "bg-blue-700 text-white"
                              : "bg-blue-600 text-white"
                            : darkMode
                              ? "bg-slate-900 text-gray-300"
                              : "bg-white text-gray-600"
                        }`}
                      >
                        Trouvés
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          captureListPositions(flipList);
                          setShowAllWords(true);
                        }}
                        className={`px-3 py-1 transition ${
                          showAllWords
                            ? darkMode
                              ? "bg-blue-700 text-white"
                              : "bg-blue-600 text-white"
                            : darkMode
                              ? "bg-slate-900 text-gray-300"
                              : "bg-white text-gray-600"
                        }`}
                      >
                        Tous
                      </button>
                    </div>
                  </div>
                </div>

              {displayList.length === 0 ? (
                <div className="text-sm text-gray-500 shrink-0">
                  {showAllWords && allWords.length === 0 ? "Aucun mot (solveur non lancé)" : "Aucun mot trouvé."}
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ maxHeight: WORDS_SCROLL_MAX_HEIGHT }}>
                  <ul className="relative flex flex-col text-sm">
                    {displayList.map((entry) => {
                      const selected = analysis?.word === entry.word;
                      const status = entry.status;
                      const isPending = status === "pending";
                      const isRejected = status === "rejected";
                      const isFound = entry.isFound || isPending;
                      const bestPts = entry.bestPts;
                      const userPts = entry.userPts;
                      const showOpt =
                        isFound &&
                        typeof bestPts === "number" &&
                        typeof userPts === "number" &&
                        bestPts !== userPts &&
                        !isPending &&
                        !isRejected;
                      const visible = showAllWords || isFound || isRejected;
                      const wordClassName = isRejected
                        ? darkMode
                          ? "font-semibold text-red-300 line-through"
                          : "font-semibold text-red-600 line-through"
                        : isPending
                        ? darkMode
                          ? "font-semibold text-slate-300 opacity-70"
                          : "font-semibold text-gray-500 opacity-70"
                        : isFound
                        ? "font-semibold"
                        : "text-gray-600";
                      return (
                        <li
                          key={entry.word}
                          onMouseEnter={() => analyzeWord(entry.word)}
                          onMouseLeave={() => {
                            setAnalysis(null);
                            setHighlightPlayers([]);
                          }}
                          ref={(el) => {
                            if (el) listItemRefs.current.set(entry.word, el);
                            else listItemRefs.current.delete(entry.word);
                          }}
                          className={`cursor-pointer rounded px-1 flex items-center justify-between gap-2 transition ${
                            selected
                              ? "bg-blue-50 text-blue-800"
                              : "hover:bg-gray-100"
                          }`}
                          style={{
                            transitionDuration: "220ms",
                            opacity: visible ? 1 : 0,
                            transform: visible ? "translateY(0)" : "translateY(-8px)",
                            maxHeight: visible ? "48px" : "0px",
                            paddingTop: "2px",
                            paddingBottom: "2px",
                            overflow: "hidden",
                            pointerEvents: visible ? "auto" : "none",
                            position: visible ? "relative" : "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            color:
                              !isFound && !isPending && darkMode
                                ? DARK_WORD_INACTIVE
                                : undefined,
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {isFound ? (
                              <span
                                style={{
                                  ...foundDotStyle,
                                  opacity: isPending ? 0.4 : 1,
                                }}
                                aria-hidden="true"
                              />
                            ) : (
                              <span
                                style={{ ...foundDotStyle, opacity: 0 }}
                                aria-hidden="true"
                              />
                            )}
                            <span className="flex items-center gap-1 min-w-0">
                              <span className={wordClassName}>{entry.word}</span>
                              {renderGobbleCandidate(entry.word)}
                            </span>
                          </span>
                          <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                            {typeof userPts === "number" && isFound && (
                              <span
                                className={`font-extrabold ${
                                  darkMode ? "text-slate-100" : "text-slate-800"
                                }`}
                              >
                                +{userPts} pts
                              </span>
                            )}
                            {isPending && (
                              <span className="text-[0.65rem] text-gray-400">
                                envoi...
                              </span>
                            )}
                            {isRejected && (
                              <span
                                className={`text-[0.65rem] ${
                                  darkMode ? "text-red-300" : "text-red-600"
                                }`}
                              >
                                refusé
                              </span>
                            )}
                            {!isFound && typeof bestPts === "number" && (
                              <span className="text-slate-500 opacity-75">
                                ({bestPts} pts)
                              </span>
                            )}
                            {showOpt && (
                              <span
                                className={`text-[0.65rem] ${
                                  darkMode ? "text-red-300" : "text-red-600"
                                }`}
                              >
                                (opt: {bestPts} pts)
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Colonne 4 : Chat */}
        {!isDailyPlay && (
          <div
          className={`${chatBlockClasses} card w-full min-h-0 order-4`}
          style={{ ...COLUMN_HEIGHT_STYLE, overflow: "hidden" }}
          onClick={() => {
            setActiveArea("chat");
            if (chatInputRef.current) {
              chatInputRef.current.focus();
            }
          }}
          >
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-center">Chat</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`text-[11px] font-semibold ${
                  darkMode ? "text-slate-300" : "text-slate-600"
                }`}
                onClick={() => setIsChatRulesOpen(true)}
              >
                Règles
              </button>
              <button
              type="button"
              className={`text-[11px] font-semibold ${
                darkMode ? "text-amber-300" : "text-blue-600"
              }`}
              onClick={() => setShowBlockedList((prev) => !prev)}
            >
              Joueurs bloqués ({blockedCount})
            </button>
            </div>
          </div>
          {renderBlockedListPanel()}

          <div
            ref={chatDesktopListRef}
            className="chat-messages flex-1 border rounded px-2 py-1 bg-white/85 dark:bg-slate-900/75 text-xs space-y-1 flex flex-col justify-end overflow-hidden"
          >
            {visibleMessages.map((msg, idx) => {
              // idx = 0 (en haut) -> plus ancien, idx = dernier -> plus r?cent
              const count = visibleMessages.length;
              const rankFromBottom = count - 1 - idx; // 0 = tout en bas (le plus r?cent)
              let opacity = 1;

              if (rankFromBottom >= chatFullVisibleLines) {
                const extra = rankFromBottom - (chatFullVisibleLines - 1);
                const maxExtra = chatVisibleLimit - chatFullVisibleLines;
                const t = maxExtra > 0 ? Math.min(extra / maxExtra, 1) : 1;
                opacity = 1 - t * (1 - MIN_CHAT_OPACITY);
              }

              const author = (msg.nick || msg.author || "Anonyme").trim();
              const authorInstallId =
                typeof msg.installId === "string" ? msg.installId : "";
              const isYou = authorInstallId
                ? authorInstallId === installId
                : author === selfNick;
              const isSystem = isSystemAuthor(author);
              const isLast = msg.id === lastMessageId;
              const canOpenMenu =
                !isSystem && authorInstallId && authorInstallId !== installId;

              return (
                <div
                  key={msg.id}
                  data-chat-row
                  className={`w-full transition-opacity duration-300 ${
                    isLast ? "slide-fade-in" : ""
                  }`}
                  style={{ opacity }}
                >
                  {isSystem ? (
                    <div className="w-full px-1 py-0.5 text-sm italic text-orange-700">
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      className={[
                        "w-full px-1 py-0.5 text-sm",
                        isYou ? "bg-blue-50" : "bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {canOpenMenu ? (
                          <button
                            type="button"
                            className="font-semibold mr-1 text-black hover:underline"
                            onClick={(e) =>
                              openUserMenu(e, {
                                nick: author,
                                installId: authorInstallId,
                                messageId: msg.id,
                              })
                            }
                          >
                            {author} :
                          </button>
                        ) : (
                          <span className="font-semibold mr-1 text-black">
                            {author} :
                          </span>
                        )}
                        <span className="text-black">{msg.text}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_REPLIES.map((txt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => submitChat(null, txt)}
                disabled={chatInputDisabled}
              className="px-2 py-1 text-sm rounded-full border bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {txt}
            </button>
          ))}
          </div>

        <div className="mt-3 flex gap-2">
          <input
            ref={chatInputRef}
            type={chatInputType}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="send"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-autofill="off"
              aria-autocomplete="none"
              aria-label="Message du chat"
            onFocus={handleChatInputFocus}
            readOnly={chatInputDisabled}
            aria-disabled={chatInputDisabled}
            className="flex-1 border rounded px-3 py-2 text-sm ios-input chat-input"
            placeholder={chatInputPlaceholder}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatInputKeyDown}
          />
          <button
            type="button"
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
            disabled={!chatInput.trim() || chatInputDisabled}
            onClick={() => submitChat(null)}
          >
            Envoyer
          </button>
          </div>
        </div>
        )}
      </div>
      </div>
      {praiseOverlay}
      {chatOverlays}
    </>
  );
}
