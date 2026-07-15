import {
  SFX_KEYS,
  makeIncrementalSfxKey,
  makeScoreSfxKey,
  makeScore2SfxKey,
} from "../assets/assetKeys";
import AMBIENT_MUSIC_TRACKS_FALLBACK from "./ambientDefaults.json";

export const DEBUG_AUDIO = false;
export const AUDIO_MASTER_GAIN = 0.7;
export const SOUND_MASTER_VOLUME_DEFAULT = 1;
export const AUDIO_POLYPHONY_LIMIT = 10;
export const AUDIO_COOLDOWN_PRUNE_MS = 60_000;
export const AUDIO_COOLDOWN_MAX_KEYS = 256;
export const AUDIO_COOLDOWNS_MS = {
  tileStep: 12,
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
  bonusVoice: 1200,
};
export const VOCAB_SAMPLE_BASE_FREQ = 440;

const MEDIA_CACHE_PURGE_VERSION = "2026-07-14-bonus-sfx-1";
export const MEDIA_CACHE_PURGE_STORAGE_KEY = `gobbleMediaCachePurged:${MEDIA_CACHE_PURGE_VERSION}`;
export const SW_MEDIA_CACHE_PREFIX = "gobble-cache-media-";
export const SOUND_ASSET_VERSION = "2026-07-14-bonus-sfx-1";
export const SOUND_ROOT = "/sound";
const AMBIENT_MUSIC_MANIFEST = `${SOUND_ROOT}/music/index.json`;
const AMBIENT_MUSIC_TRACKS_BASE = [
  `${SOUND_ROOT}/music/oiseauxnuit.mp3`,
  `${SOUND_ROOT}/music/oiseauxsoir.mp3`,
  `${SOUND_ROOT}/music/reveiloiseaux.mp3`,
  `${SOUND_ROOT}/music/reveiloiseaux2.mp3`,
];
export const AMBIENT_MUSIC_TRACKS_DEFAULT =
  Array.isArray(AMBIENT_MUSIC_TRACKS_FALLBACK) && AMBIENT_MUSIC_TRACKS_FALLBACK.length
    ? AMBIENT_MUSIC_TRACKS_FALLBACK
    : AMBIENT_MUSIC_TRACKS_BASE;

export const INCREMENTAL_SOUND_COUNT = 16;
const INCREMENTAL_BASE_NOTE_NUMBER = 9;
export const INCREMENTAL_BASE_NOTE_INDEX = INCREMENTAL_BASE_NOTE_NUMBER - 1;
const INCREMENTAL_SOUND_BASE_PATH = `${SOUND_ROOT}/game/incremental/09.wav`;
export const INCREMENTAL_BASE_SFX_KEY = makeIncrementalSfxKey("09");

export const SCORE_SOUND_BANDS = [
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
export const SCORE_LOW_KEY = makeScoreSfxKey("01");
export const SCORE2_LOW_KEY = makeScore2SfxKey("01");

function splitUrlPathAndSuffix(src) {
  const raw = String(src || "").trim();
  if (!raw) return { path: "", suffix: "" };
  const queryIdx = raw.indexOf("?");
  const hashIdx = raw.indexOf("#");
  let cut = raw.length;
  if (queryIdx >= 0) cut = Math.min(cut, queryIdx);
  if (hashIdx >= 0) cut = Math.min(cut, hashIdx);
  return {
    path: raw.slice(0, cut),
    suffix: raw.slice(cut),
  };
}

function stripExtension(src) {
  const { path, suffix } = splitUrlPathAndSuffix(src);
  if (!path) return String(src || "");
  return `${path.replace(/\.[a-z0-9]{2,5}$/i, "")}${suffix}`;
}

function buildCandidatesFromBase(base, order) {
  const cleaned = stripExtension(base);
  const { path: cleanPath, suffix } = splitUrlPathAndSuffix(cleaned);
  if (!cleanPath) return [];
  return order.map((ext) => `${cleanPath}.${ext}${suffix}`);
}

function buildSfxCandidates(url) {
  const candidates = buildCandidatesFromBase(url, ["m4a", "wav", "mp3"]);
  return candidates.length ? candidates : [url];
}

function dedupeManifest(entries) {
  const map = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry?.key) return;
    map.set(entry.key, entry);
  });
  return Array.from(map.values());
}

export function normalizeSoundMasterVolume(raw, fallback = SOUND_MASTER_VOLUME_DEFAULT) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function withSoundAssetVersion(url) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  const joiner = raw.includes("?") ? "&" : "?";
  return `${raw}${joiner}v=${encodeURIComponent(SOUND_ASSET_VERSION)}`;
}

const SOUND_PATHS = {
  gobbleVoice: withSoundAssetVersion(`${SOUND_ROOT}/game/gobble.mp3`),
  doubleGobbleVoice: withSoundAssetVersion(`${SOUND_ROOT}/game/doublegobble.mp3`),
  bonusVoice: withSoundAssetVersion(`${SOUND_ROOT}/game/bonus.mp3`),
  blackHole: withSoundAssetVersion(`${SOUND_ROOT}/game/chasse.mp3`),
  chebabeu: withSoundAssetVersion(`${SOUND_ROOT}/game/chebabeu.wav`),
  clavier: withSoundAssetVersion(`${SOUND_ROOT}/game/clavier.wav`),
  souris: withSoundAssetVersion(`${SOUND_ROOT}/game/souris.wav`),
  shortWord: withSoundAssetVersion(`${SOUND_ROOT}/game/error.mp3`),
  roundStart: withSoundAssetVersion(`${SOUND_ROOT}/game/dong.wav`),
  specialFound: withSoundAssetVersion(`${SOUND_ROOT}/game/charleston.wav`),
  tictac10: withSoundAssetVersion(`${SOUND_ROOT}/game/tictac10.wav`),
  coeur: withSoundAssetVersion(`${SOUND_ROOT}/game/coeur.wav`),
  tictoc: withSoundAssetVersion(`${SOUND_ROOT}/game/tictoc.mp3`),
  vocabOverlay: withSoundAssetVersion(`${SOUND_ROOT}/ui/progvoca.wav`),
  vocabCling: withSoundAssetVersion(`${SOUND_ROOT}/game/piece.wav`),
  invalidWord: withSoundAssetVersion(`${SOUND_ROOT}/game/invalide.mp3`),
  dejaJoue: withSoundAssetVersion(`${SOUND_ROOT}/game/dejajoue.wav`),
  uiClick: withSoundAssetVersion(`${SOUND_ROOT}/ui/click.wav`),
  uiClose: withSoundAssetVersion(`${SOUND_ROOT}/ui/bipmontre.wav`),
  tournamentFireworks: withSoundAssetVersion(`${SOUND_ROOT}/game/artifice.mp3`),
  tournamentApplause: withSoundAssetVersion(`${SOUND_ROOT}/game/applause.wav`),
};
export const SCORE_SFX_KEYS = SCORE_SOUND_PATHS.map((src) => {
  const label = src.split("/").pop()?.split(".")[0] || "00";
  return makeScoreSfxKey(label);
});
export const SCORE2_SFX_KEYS = SCORE2_SOUND_PATHS.map((src) => {
  const label = src.split("/").pop()?.split(".")[0] || "00";
  return makeScore2SfxKey(label);
});

const BOOT_ASSET_SOUNDS_BASE = [
  { key: SFX_KEYS.gobbleVoice, url: SOUND_PATHS.gobbleVoice, priority: "high", meta: { eqKey: "gobbleVoice" } },
  { key: SFX_KEYS.doubleGobbleVoice, url: SOUND_PATHS.doubleGobbleVoice, priority: "high", meta: { eqKey: "gobbleVoice" } },
  { key: SFX_KEYS.bonusVoice, url: SOUND_PATHS.bonusVoice, priority: "high", meta: { eqKey: "bonusVoice" } },
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

const ESSENTIAL_SFX_KEYS = new Set([
  SFX_KEYS.gobbleVoice,
  SFX_KEYS.doubleGobbleVoice,
  SFX_KEYS.bonusVoice,
  SFX_KEYS.roundStart,
  SFX_KEYS.specialFound,
  SFX_KEYS.tictac10,
  SFX_KEYS.coeur,
  SFX_KEYS.tictoc,
  SFX_KEYS.vocabOverlay,
  SFX_KEYS.vocabCling,
  SFX_KEYS.invalidWord,
  SFX_KEYS.dejaJoue,
  SFX_KEYS.shortWord,
  SFX_KEYS.uiClick,
  SFX_KEYS.uiClose,
  INCREMENTAL_BASE_SFX_KEY,
  SCORE_LOW_KEY,
  SCORE2_LOW_KEY,
]);

const BOOT_ASSET_SFX_ESSENTIAL = BOOT_ASSET_SOUNDS_BASE.filter((entry) =>
  ESSENTIAL_SFX_KEYS.has(entry.key)
);
const BOOT_ASSET_SFX_OPTIONAL = BOOT_ASSET_SOUNDS_BASE.filter(
  (entry) => !ESSENTIAL_SFX_KEYS.has(entry.key)
).map((entry) => ({
  ...entry,
  priority: "low",
}));
const INCREMENTAL_SFX_ENTRIES = [{
  key: INCREMENTAL_BASE_SFX_KEY,
  url: INCREMENTAL_SOUND_BASE_PATH,
  priority: "high",
  meta: { eqKey: "tileStep" },
}];
const SCORE_SFX_ENTRIES = SCORE_SOUND_PATHS.map((url, idx) => ({
  key: SCORE_SFX_KEYS[idx],
  url,
  priority: "high",
  meta: { eqKey: "score" },
}));
const SCORE2_SFX_ENTRIES = SCORE2_SOUND_PATHS.map((url, idx) => ({
  key: SCORE2_SFX_KEYS[idx],
  url,
  priority: "high",
  meta: { eqKey: "score2" },
}));
const BOOT_ASSET_SFX_VARIATIONS = [
  ...INCREMENTAL_SFX_ENTRIES,
  ...SCORE_SFX_ENTRIES,
  ...SCORE2_SFX_ENTRIES,
];
export const REGISTERED_SFX_MANIFEST = dedupeManifest([
  ...BOOT_ASSET_SFX_ESSENTIAL,
  ...BOOT_ASSET_SFX_OPTIONAL,
  ...BOOT_ASSET_SFX_VARIATIONS,
]);

export function buildSfxManifest(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    key: item.key,
    type: "sfx",
    candidates: buildSfxCandidates(item.url),
    priority: item.priority,
    meta: item.meta || {},
  }));
}

export function resolveAmbientManifestTracks(payload) {
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

export async function loadAmbientTrackList() {
  if (typeof fetch === "undefined") return AMBIENT_MUSIC_TRACKS_DEFAULT;
  try {
    const res = await fetch(AMBIENT_MUSIC_MANIFEST, { cache: "force-cache" });
    if (!res.ok) return AMBIENT_MUSIC_TRACKS_DEFAULT;
    const data = await res.json();
    const resolved = resolveAmbientManifestTracks(data);
    return resolved && resolved.length ? resolved : AMBIENT_MUSIC_TRACKS_DEFAULT;
  } catch (_) {
    return AMBIENT_MUSIC_TRACKS_DEFAULT;
  }
}

export async function purgeRuntimeMediaCache({ force = false } = {}) {
  if (typeof window === "undefined" || typeof caches === "undefined") {
    return { ok: false, reason: "cache-api-unavailable", deleted: 0 };
  }
  if (!force && typeof localStorage !== "undefined") {
    try {
      const seen = localStorage.getItem(MEDIA_CACHE_PURGE_STORAGE_KEY);
      if (seen === "1") {
        return { ok: true, skipped: true, deleted: 0 };
      }
    } catch (_) {}
  }
  try {
    const names = await caches.keys();
    const targets = names.filter((name) => String(name || "").startsWith(SW_MEDIA_CACHE_PREFIX));
    if (targets.length) {
      await Promise.all(targets.map((name) => caches.delete(name)));
    }
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(MEDIA_CACHE_PURGE_STORAGE_KEY, "1");
      } catch (_) {}
    }
    return { ok: true, deleted: targets.length };
  } catch (_) {
    return { ok: false, reason: "cache-delete-failed", deleted: 0 };
  }
}
