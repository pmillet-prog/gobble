// Fichier UTF-8 : conserver les accents, emojis et règles de normalisation (??, etc.). Ne pas convertir d'encodage.
// 
import React, { useEffect, useState, useRef } from "react";
import socket from "./socket";
import LiveFeed, { buildMixedFeed } from "./components/LiveFeed.jsx";
import RankingWidgetMobile from "./components/RankingWidgetMobile.jsx";
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
  "room-5x5": { label: "Grille 5x5", gridSize: 5, duration: 120, breakSeconds: 45 },
};

const DEFAULT_DURATION = 120;
const COUNTDOWN = 0;
const TOURNAMENT_TOTAL_ROUNDS = 5;
// Hauteur max de la liste des mots en fin de partie : on remplit davantage l'espace sans ?tirer toute la colonne
const WORDS_SCROLL_MAX_HEIGHT = "clamp(320px, calc(100vh - 280px), 720px)";
// Hauteur cible du bloc principal : clamp sur la fenêtre pour ?viter les colonnes infinies en zoom/d?zoom
const MAIN_GRID_HEIGHT = "clamp(520px, 82vh, 880px)";
const COLUMN_HEIGHT_STYLE = {
  height: MAIN_GRID_HEIGHT,
  maxHeight: MAIN_GRID_HEIGHT,
  minHeight: "520px",
};
const GRID_COL_TEMPLATE = "1.05fr 1.6fr 0.85fr 1.05fr";
const MIN_GRID_WIDTH = 260;
const MAX_GRID_WIDTH = 980;
const GRID_PADDING_PX = 32; // p-4 (16px de chaque c?t?)
const BASE_TILE_PX = 56;
const BASE_GAP_PX = 8; // gap-2 de référence
const BASE_GAP_RATIO = BASE_GAP_PX / BASE_TILE_PX; // ~0.14 pour conserver les proportions
const MIN_TILE_SIZE = 40; // garde une lisibilité minimale
const DARK_ROW_TEXT = "#e5e7eb";
const DARK_DIVIDER_COLOR = "#1f2937";
const DARK_WORD_INACTIVE = "#e2e8f0";

function getGridSizeForRoom(roomKey) {
  return ROOM_OPTIONS[roomKey]?.gridSize || 4;
}

function getDefaultRoomId() {
  if (typeof window !== "undefined") {
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    return isMobile ? "room-4x4" : "room-4x4";
  }
  return "room-4x4";
}

function clampValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

const BONUS_CLASSES = {
  L2: "bg-[rgba(163,196,243,0.85)] border-[rgba(99,147,230,0.9)] border-2", // bleu clair plus vif
  L3: "bg-[rgba(51,93,227,0.8)] border-[rgba(30,64,175,0.95)] text-white border-2", // bleu profond
  M2: "bg-[rgba(255,191,180,0.9)] border-[rgba(248,113,113,0.95)] border-2", // corail vif
  M3: "bg-[rgba(239,68,68,0.85)] border-[rgba(185,28,28,0.95)] text-white border-2", // rouge intense
};


// Petite CSS pour le slide d'apparition
const slideStyles = `
html {
  color-scheme: light;
}
html.dark {
  color-scheme: dark;
}
body {
  background-color: #ffffff;
  color: #0f172a;
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

@keyframes softPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.5);
  }
  100% {
    box-shadow: 0 0 0 18px rgba(37, 99, 235, 0);
  }
}

@keyframes shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-6px); }
  40%, 60% { transform: translateX(6px); }
}

@keyframes confettiFall {
  0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 1; }
}

.confetti-piece {
  position: absolute;
  top: -10vh;
  border-radius: 2px;
  opacity: 0.95;
  animation: confettiFall var(--confetti-duration, 3.4s) linear infinite;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,0.12));
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

@keyframes praisePop {
  0% { transform: translate(-50%, -50%) scale(0.78); opacity: 0; }
  18% { transform: translate(-50%, -58%) scale(1.06); opacity: 1; }
  70% { transform: translate(-50%, -76%) scale(1.18); opacity: 0.92; }
  100% { transform: translate(-50%, -92%) scale(1.28); opacity: 0; }
}

.praise-pop {
  position: fixed;
  left: 50%;
  top: 44%;
  transform: translate(-50%, -50%);
  animation: praisePop 0.75s ease-out forwards;
  pointer-events: none;
  letter-spacing: -0.02em;
  text-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  will-change: transform, opacity;
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
  background: #e5e7eb;
  color: #111827;
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

`;

const MAX_CHAT_LINES = 18;
const FULL_VISIBLE_LINES_FROM_BOTTOM = 9;
const MIN_CHAT_OPACITY = 0.03;
const BIG_SCORE_THRESHOLD = 100;
const CHAT_MIN_DELAY = 600;
const QUICK_REPLIES = ["GG !", "Bien joue", "On continue ?", "Belle grille !"];
const SHOW_ALL_LABELS = { found: "Trouves", all: "Tous les mots" };
function generateClientId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `cid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const formatNumber = (value) =>
  typeof value === "number" ? value.toLocaleString("fr-FR") : null;

export default function App() {
  const initialRoomId = getDefaultRoomId();
  const initialGridSize = getGridSizeForRoom(initialRoomId);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [gridSize, setGridSize] = useState(initialGridSize);
  const [phase, setPhase] = useState("lobby");
  const [tick, setTick] = useState(0);
  const [board, setBoard] = useState(
    Array(initialGridSize * initialGridSize).fill({ letter: "?", bonus: null })
  );
  const [currentTiles, setCurrentTiles] = useState([]);
  const [highlightPath, setHighlightPath] = useState([]);
  const [dictionary, setDictionary] = useState(null);
  const [accepted, setAccepted] = useState([]);
  const [score, setScore] = useState(0);
  const [shakeGrid, setShakeGrid] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [lastWords, setLastWords] = useState([]);
  const [showAllWords, setShowAllWords] = useState(false);
  const [sortMode, setSortMode] = useState("score");
  const [toast, setToast] = useState(null);
  const [allWords, setAllWords] = useState([]);
  const [shake, setShake] = useState(false);
  const tileRefs = useRef([]);
  const [lastInputMode, setLastInputMode] = useState("keyboard");
  const audioCtxRef = useRef(null);
  const gobbleVoiceRef = useRef({ audio: null, last: 0 });
  const tileStepRef = useRef(0);         // <-- AJOUT
  const isTouchDeviceRef = useRef(false);
  const gridRef = useRef(null);
  const secretTapRef = useRef({ count: 0, lastTs: 0 });
  const canVibrateRef = useRef(false);
  const [gridWidth, setGridWidth] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [highlightPlayers, setHighlightPlayers] = useState([]);
  const listItemRefs = useRef(new Map());
  const mobileHeaderRef = useRef(null);
  const mobileHelpRef = useRef(null);
  const prevPositionsRef = useRef(new Map());
  const [bigScoreFlash, setBigScoreFlash] = useState(null);
  const [praiseFlash, setPraiseFlash] = useState(null);
  const [gridShake, setGridShake] = useState(false);
  const [bigGridUnlocked, setBigGridUnlocked] = useState(false);
  const [mobileResultsTab, setMobileResultsTab] = useState("classement");
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
  const [serverEndsAt, setServerEndsAt] = useState(null);
  const [serverRoundDurationMs, setServerRoundDurationMs] = useState(null);
  const [players, setPlayers] = useState([]);
  const [provisionalRanking, setProvisionalRanking] = useState([]);
  const [finalResults, setFinalResults] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [serverStatus, setServerStatus] = useState("waiting");
  const serverTimeOffsetRef = useRef(0); // ms: serverNow - clientNow
  const [announcements, setAnnouncements] = useState([]);
  const [roundStats, setRoundStats] = useState(null);
  const [specialRound, setSpecialRound] = useState(null);
  const [nextStartAt, setNextStartAt] = useState(null);
  const [breakCountdown, setBreakCountdown] = useState(null);
  const [upcomingSpecial, setUpcomingSpecial] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState("");
  const [installSupport, setInstallSupport] = useState("unknown"); // unknown | available | unavailable | installed | maybe
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });
  const [mobileLayoutSizing, setMobileLayoutSizing] = useState({
    viewportWidth: 0,
    viewportHeight: 0,
    gridSide: 0,
    rankingHeight: 0,
    wordPreviewHeight: 0,
    liveFeedHeight: 0,
    bodyHeight: 0,
  });
  const [isChatOpenMobile, setIsChatOpenMobile] = useState(false);
  const [mobileChatUnreadCount, setMobileChatUnreadCount] = useState(0);
  const [roomStats, setRoomStats] = useState({});
  const [medals, setMedals] = useState({});
  const [tournament, setTournament] = useState(null); // { id, round, totalRounds, ... }
  const [tournamentTotals, setTournamentTotals] = useState({}); // nick -> points
  const [tournamentRanking, setTournamentRanking] = useState([]); // [{ nick, score }]
  const [tournamentRoundPoints, setTournamentRoundPoints] = useState({}); // nick -> points earned this round
  const [tournamentSummary, setTournamentSummary] = useState(null); // finale: { winnerNick, records, ranking }
  const [breakKind, setBreakKind] = useState(null); // between_rounds | tournament_end
  const [resultsRankingMode, setResultsRankingMode] = useState("round"); // round | total
  const [specialHint, setSpecialHint] = useState(null); // { kind, pattern, length }
  const [specialSolvedOverlay, setSpecialSolvedOverlay] = useState(null); // { nick, word, kind }
  const [foundTargetThisRound, setFoundTargetThisRound] = useState(false);
  const [clientId, setClientId] = useState(() => {
    try {
      const existing = localStorage.getItem("boggle_client_id");
      if (existing) return existing;
      const fresh = generateClientId();
      localStorage.setItem("boggle_client_id", fresh);
      return fresh;
    } catch (_) {
      return generateClientId();
    }
  });

  // Zone active pour le clavier : "game" ou "chat"
  const [activeArea, setActiveArea] = useState("game");

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const currentTilesRef = useRef([]);
  const acceptedRef = useRef([]);
  const acceptedScoresRef = useRef(new Map());
  const chatInputRef = useRef(null);
  const isChatOpenMobileRef = useRef(false);
  const wordHistoryRef = useRef([]);
  const wordHistoryIndexRef = useRef(-1);
  const chatHistoryRef = useRef([]);
  const chatHistoryIndexRef = useRef(-1);
  const solutionsRef = useRef(new Map());
  const chatLastSentRef = useRef(0);
  const toastTimerRef = useRef(null);
  const praiseTimerRef = useRef(null);
  const praiseLastRef = useRef(0);
  const confettiPiecesRef = useRef(null);
  const allWordsComputeRef = useRef({ kickoff: null, timer: null, idle: null, key: null });
  const prevPlayersRef = useRef(new Set());
  const isChromiumMobileRef = useRef(false);
  const testBotsRef = useRef(false);
  const liveBotsRef = useRef(new Map());
  const botTimersRef = useRef(new Map());
  const bestGridMaxRef = useRef(0);
  const bestGridMaxLenRef = useRef(0);
  const bestWordAnnounceRef = useRef(-1);
  const lastTickSoundRef = useRef(0);
  const tickToneToggleRef = useRef(false);
  const [liveBots, setLiveBots] = useState([]);

  // drag souris
  const draggingRef = useRef(false);
  const playColumnRef = useRef(null);

  // Débloque le contexte audio au premier geste utilisateur (mobile/desktop)
  useEffect(() => {
    function unlockAudio() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlockAudio);
    }
    window.addEventListener("pointerdown", unlockAudio);
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => {
    const el = playColumnRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    // init immédiat (on enlève un petit padding interne pour coller au contenu)
    const initialWidth = el.getBoundingClientRect().width;
    if (initialWidth) {
      const clamped = clampGridWidth(initialWidth);
      if (clamped) setGridWidth(clamped);
    }

    const observer = new ResizeObserver((entries) => {
      const target = entries[0]?.target;
      if (!target) return;
      const w = target.getBoundingClientRect().width; // border-box width (incl. padding)
      if (!w) return;
      const clamped = clampGridWidth(w);
      if (clamped) setGridWidth(clamped);
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
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobileLayout(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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

    const raf = window.requestAnimationFrame(focusChatInput);
    const t = window.setTimeout(focusChatInput, 120);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isChatOpenMobile, isMobileLayout]);

 useEffect(() => {
  if (!isMobileLayout) return;

  // Tant que le mode 5x5 n'est PAS débloqué, on force le 4x4
  if (!bigGridUnlocked && roomId !== "room-4x4") {
    setRoomId("room-4x4");
  }
}, [isMobileLayout, roomId, bigGridUnlocked]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMobileLayout || !(phase === "playing" || phase === "results")) return;

    let rafId = null;
    let timeoutId = null;

    const computeMobileLayoutNow = () => {
      const vv = window.visualViewport;
      const viewportHeightCandidates = [
        vv?.height,
        window.innerHeight,
        document.documentElement?.clientHeight,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const viewportHeight = viewportHeightCandidates.length
        ? Math.min(...viewportHeightCandidates)
        : 0;

      const viewportWidthCandidates = [
        vv?.width,
        window.innerWidth,
        document.documentElement?.clientWidth,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const viewportWidth = viewportWidthCandidates.length
        ? Math.min(...viewportWidthCandidates)
        : 0;
      const headerHeight = mobileHeaderRef.current?.offsetHeight || 0;
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
      const bodyHeight = Math.max(
        0,
        viewportHeight - headerHeight - extraTopHeight
      );

      // marges/gaps principaux (px-3, pb-3 + espacements entre blocs)
      const verticalPadding = 8 + 12;
      const layoutGaps = 24 + 8; // gap-3 entre blocs (2 x 12px) + gap-2 entre grille/flux (8px)
      const availableHeight = Math.max(
        0,
        bodyHeight - verticalPadding - layoutGaps
      );
      const blocksBudget = availableHeight > 0 ? availableHeight : bodyHeight;
      const availableWidth = Math.max(0, viewportWidth - 24); // px-3 (12px) de chaque c?t?

      const baseFontSize =
        parseFloat(
          window.getComputedStyle(document.documentElement).fontSize || "16"
        ) || 16;
      const rankingTarget = clampValue(
        Math.round(baseFontSize * 1.6 * 5 + 32),
        140,
        200
      );
      const previewTarget = 52;
      const liveFeedMin = 80;

      const requiredBelowGrid = rankingTarget + previewTarget + liveFeedMin;
      const maxGridFromHeight = Math.max(140, blocksBudget - requiredBelowGrid);
      let gridSide = Math.min(availableWidth, maxGridFromHeight);
      gridSide = Math.max(140, gridSide);

      const remaining = Math.max(0, blocksBudget - gridSide);

      if (remaining <= 0) {
        setMobileLayoutSizing({
          viewportWidth,
          viewportHeight,
          gridSide,
          rankingHeight: 0,
          wordPreviewHeight: 0,
          liveFeedHeight: 0,
          bodyHeight,
        });
        return;
      }

      const rankingHeight = Math.min(rankingTarget, remaining);
      const wordPreviewHeight = Math.min(
        previewTarget,
        Math.max(0, remaining - rankingHeight)
      );
      const liveFeedAvailable = Math.max(
        0,
        remaining - rankingHeight - wordPreviewHeight
      );
      const liveFeedHeight = Math.min(liveFeedMin, liveFeedAvailable);

      setMobileLayoutSizing({
        viewportWidth,
        viewportHeight,
        gridSide: gridSide || 0,
        rankingHeight: rankingHeight || 0,
        wordPreviewHeight: wordPreviewHeight || 0,
        liveFeedHeight: liveFeedHeight || 0,
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
    document.addEventListener("fullscreenchange", scheduleComputeMobileLayout);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", scheduleComputeMobileLayout);
    vv?.addEventListener("scroll", scheduleComputeMobileLayout);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener("resize", scheduleComputeMobileLayout);
      window.removeEventListener("scroll", scheduleComputeMobileLayout);
      document.removeEventListener("fullscreenchange", scheduleComputeMobileLayout);
      vv?.removeEventListener("resize", scheduleComputeMobileLayout);
      vv?.removeEventListener("scroll", scheduleComputeMobileLayout);
    };
  }, [isMobileLayout, phase, gridSize, showHelp]);

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
      isMobileLayout && (phase === "playing" || phase === "results");
    if (!shouldLock) return;

    const previousOverflow = document.body.style.overflow;
    const previousHeight = document.body.style.height;
    document.body.style.overflow = "hidden";

    const applyLockedHeight = () => {
      const vv = window.visualViewport;
      const candidates = [
        vv?.height,
        window.innerHeight,
        document.documentElement?.clientHeight,
      ].filter((v) => Number.isFinite(v) && v > 0);
      const h = candidates.length ? Math.min(...candidates) : 0;
      if (h > 0) {
        document.body.style.height = `${Math.round(h)}px`;
      }
    };

    applyLockedHeight();
    window.addEventListener("resize", applyLockedHeight);
    window.addEventListener("scroll", applyLockedHeight, { passive: true });
    document.addEventListener("fullscreenchange", applyLockedHeight);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", applyLockedHeight);
    vv?.addEventListener("scroll", applyLockedHeight);

    return () => {
      window.removeEventListener("resize", applyLockedHeight);
      window.removeEventListener("scroll", applyLockedHeight);
      document.removeEventListener("fullscreenchange", applyLockedHeight);
      vv?.removeEventListener("resize", applyLockedHeight);
      vv?.removeEventListener("scroll", applyLockedHeight);
      document.body.style.overflow = previousOverflow;
      document.body.style.height = previousHeight;
    };
  }, [isMobileLayout, phase]);

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

  // Son "GOBBLE" (MP3 placé dans /public/GOBBLE.mp3)
  function playGobbleVoice() {
    if (isMuted) return;
    const nowTs = Date.now();
    if (nowTs - gobbleVoiceRef.current.last < 1200) return; // throttle
    gobbleVoiceRef.current.last = nowTs;

    if (!gobbleVoiceRef.current.audio) {
      const audio = new Audio("/gobble.mp3"); // fichier en minuscules dans /public
      audio.preload = "auto";
      gobbleVoiceRef.current.audio = audio;
    }

    const audio = gobbleVoiceRef.current.audio;
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch (_) {}
  }

    // Petit "bip" progressif à chaque tuile ajoutéee
function playTileStepSound(step) {
  if (isMuted) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
    audioCtxRef.current = new AudioCtx();
  }
  const ctx = audioCtxRef.current;

  const start = () => {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;

    // A4 comme base, gamme pentatonique (ça reste consonant)
    const baseFreq = 440;
    const intervals = [0, 2, 4, 7, 9, 12, 14, 16]; // demi-tons
    const idx = Math.min(intervals.length - 1, step);
    const semi = intervals[idx];
    const freq = baseFreq * Math.pow(2, semi / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    try {
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (_) {}
  };

  ctx.resume().then(start).catch(start);
}

  // Petit "tic tac" pour la fin de manche
  function playTickSound() {
    if (isMuted) return;
    const nowTs = Date.now();
    if (nowTs - lastTickSoundRef.current < 750) return;
    lastTickSoundRef.current = nowTs;
    tickToneToggleRef.current = !tickToneToggleRef.current;
    const baseFreq = 420;
    const freq = tickToneToggleRef.current ? baseFreq * 1.2 : baseFreq * 0.9;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    const start = () => {
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      try {
        osc.start(now);
        osc.stop(now + 0.36);
      } catch (_) {}
    };
    ctx.resume().then(start).catch(start);
  }

  function playRoundStartSound() {
  if (isMuted) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
    audioCtxRef.current = new AudioCtx();
  }
  const ctx = audioCtxRef.current;

  const start = () => {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;

    // On part sur un DO5 comme tonique (C5)
    const baseFreq = 523.25;

    // 1 1 3 5 3 5 en degrés de gamme majeure -> 0,0,4,7,4,7 demi-tons
    const semitones = [0, 4, 7, 12, 7, 16];

    // Durée et tempo de la petite phrase
    const noteDur = 0.12;      // durée de chaque note
    const gap = 0.02;          // petit espace entre les notes
    const totalDur = semitones.length * (noteDur + gap) + 0.12;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.42, now + 0.025);
    master.gain.linearRampToValueAtTime(0.0001, now + totalDur);

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(180, now);
    filter.Q.setValueAtTime(0.7, now);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-24, now);
    comp.knee.setValueAtTime(22, now);
    comp.ratio.setValueAtTime(10, now);
    comp.attack.setValueAtTime(0.004, now);
    comp.release.setValueAtTime(0.18, now);

    master.connect(filter);
    filter.connect(comp);
    comp.connect(ctx.destination);

    semitones.forEach((semi, idx) => {
      const osc = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const gain = ctx.createGain();
      const voiceB = ctx.createGain();
      const panner =
        typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;

      const freq = baseFreq * Math.pow(2, semi / 12);
      const t0 = now + idx * (noteDur + gap);

      osc.type = idx % 2 === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t0);
      oscB.type = "sine";
      oscB.frequency.setValueAtTime(freq * 2, t0);
      voiceB.gain.setValueAtTime(0.22, t0);

      // Attack/decay par note
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + noteDur);

      if (panner) {
        const pan =
          semitones.length <= 1 ? 0 : (idx / (semitones.length - 1)) * 0.8 - 0.4;
        panner.pan.setValueAtTime(pan, t0);
        gain.connect(panner);
        panner.connect(master);
      } else {
        gain.connect(master);
      }

      osc.connect(gain);
      oscB.connect(voiceB);
      voiceB.connect(gain);

      try {
        osc.start(t0);
        oscB.start(t0);
        osc.stop(t0 + noteDur + 0.04);
        oscB.stop(t0 + noteDur + 0.04);
      } catch (_) {}
    });
  };

  ctx.resume().then(start).catch(start);
}


  // Synchronise l'état muet avec l'élément audio (certaines plateformes le gardent en mémoire)
  useEffect(() => {
    const audio = document.getElementById("error-sound");
    if (audio) {
      audio.muted = isMuted;
      if (!isMuted) audio.volume = 1;
    }
  }, [isMuted]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  async function toggleFullscreen() {
    if (typeof document === "undefined") return;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {
      // ignore
    }
  }

  // Palette de sons par paliers de score (plus mélodique)
  const SCORE_SFX_BANDS = [
    { min: 0, intervals: [0], gain: 0.13, dur: 0.38 },
    { min: 5, intervals: [0, 7], gain: 0.15, dur: 0.42 },
    { min: 10, intervals: [0, 4, 7], gain: 0.17, dur: 0.45 },
    { min: 20, intervals: [0, 4, 9, 12], gain: 0.2, dur: 0.5 },
    { min: 35, intervals: [0, 3, 7, 12, 15], gain: 0.22, dur: 0.55 },
    { min: 50, intervals: [0, 5, 9, 12, 17], gain: 0.24, dur: 0.6 },
  ];

  function playScoreSound(points) {
    if (isMuted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    const start = () => {
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;
      const band =
        SCORE_SFX_BANDS.slice()
          .sort((a, b) => a.min - b.min)
          .reduce((acc, b) => (points >= b.min ? b : acc), SCORE_SFX_BANDS[0]);

      // Gamme pentatonique pour la progression, racine en SOL4 (392 Hz)
      const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16];
      const step = Math.min(pentatonic.length - 1, Math.floor(points / 8));
      const rootFreq = 392 * Math.pow(2, pentatonic[step] / 12);

      const attack = 0.02;
      const decay = 0.1;
      const release = 0.25;
      const totalDur = band.dur;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(band.gain, now + attack);
      master.gain.linearRampToValueAtTime(band.gain * 0.6, now + attack + decay);
      master.gain.linearRampToValueAtTime(band.gain * 0.45, now + totalDur - release);
      master.gain.linearRampToValueAtTime(0.0001, now + totalDur);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(5200, now);
      filter.Q.setValueAtTime(0.65, now);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-26, now);
      comp.knee.setValueAtTime(26, now);
      comp.ratio.setValueAtTime(10, now);
      comp.attack.setValueAtTime(0.004, now);
      comp.release.setValueAtTime(0.2, now);

      master.connect(filter);
      filter.connect(comp);
      comp.connect(ctx.destination);

      band.intervals.forEach((semi, idx) => {
        const noteStart = now + idx * 0.03; // arpège plus perceptible
        const osc = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        const gain = ctx.createGain();
        const voiceB = ctx.createGain();
        const panner =
          typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
        const freq = rootFreq * Math.pow(2, semi / 12);
        osc.frequency.setValueAtTime(freq, noteStart);
        oscB.frequency.setValueAtTime(freq * 2, noteStart); // octave au-dessus
        osc.type = idx % 2 === 0 ? "triangle" : "sine";
        oscB.type = "sine";
        voiceB.gain.setValueAtTime(0.28, noteStart);

        // légère dérive pour adoucir
        const detuneJitter = (Math.random() - 0.5) * 10;
        const baseDetune = idx * 3 + detuneJitter;
        osc.detune.setValueAtTime(baseDetune, noteStart);
        oscB.detune.setValueAtTime(baseDetune * 0.7, noteStart);

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(5.2, noteStart);
        lfoGain.gain.setValueAtTime(8, noteStart); // cents
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        lfoGain.connect(oscB.detune);

        // enveloppe locale
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(1, noteStart + attack * 0.8);
        gain.gain.linearRampToValueAtTime(0.75, noteStart + attack + decay);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + totalDur);

        if (panner) {
          const pan =
            band.intervals.length <= 1
              ? 0
              : (idx / (band.intervals.length - 1)) * 0.7 - 0.35;
          panner.pan.setValueAtTime(pan, noteStart);
          gain.connect(panner);
          panner.connect(master);
        } else {
          gain.connect(master);
        }

        osc.connect(gain);
        oscB.connect(voiceB);
        voiceB.connect(gain);

        try {
          lfo.start(noteStart);
          lfo.stop(noteStart + totalDur);
          osc.start(noteStart); // très léger décalage pour l'effet arpège
          oscB.start(noteStart);
          osc.stop(noteStart + totalDur);
          oscB.stop(noteStart + totalDur);
        } catch (err) {
          /* ignore sporadic start/stop errors */
        }
      });
    };

    ctx.resume().then(start).catch(start);
  }

  function maybePlayAnnouncementSound(item) {
    if (!item) return;
    const self = (nickname || "").trim();
    if (item.nick && self && item.nick.trim() !== self) return;
    if (item.type === "best_possible_score" || item.type === "longest_possible") {
      playGobbleVoice();
    }
  }

  useEffect(() => {
    const onRoomsStats = (payload = []) => {
      if (!Array.isArray(payload)) return;
      const map = {};
      payload.forEach((entry) => {
        if (!entry?.roomId) return;
        map[entry.roomId] = {
          label: entry.label,
          players: entry.players || 0,
        };
      });
      setRoomStats(map);
    };

    socket.on("roomsStats", onRoomsStats);
    if (!socket.connected) {
      try {
        socket.connect();
      } catch (_) {}
    }

    return () => {
      socket.off("roomsStats", onRoomsStats);
    };
  }, []);

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
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(50);
      }
    } catch (_) {}
    setTimeout(() => setGridShake(false), 520);
  }

  function triggerPraiseFlash(text, { kind = "blue", shakeGrid = false } = {}) {
    const now = Date.now();
    if (now - praiseLastRef.current < 650) return;
    praiseLastRef.current = now;
    setPraiseFlash({ id: now + Math.random(), text, kind });
    if (praiseTimerRef.current) clearTimeout(praiseTimerRef.current);
    praiseTimerRef.current = setTimeout(() => setPraiseFlash(null), 820);
    if (shakeGrid) triggerGridShake();
  }

  useEffect(() => {
    if (phase !== "playing") {
      setHighlightPath([]);
    }
  }, [phase]);

   useEffect(() => {
  if (phase === "playing") {
    playRoundStartSound();
  }
}, [phase]);

  useEffect(() => {
    if (phase === "playing" && typeof tick === "number" && tick > 0 && tick <= 10) {
      playTickSound();
    }
  }, [tick, phase]);

  useEffect(() => {
    if (phase !== "playing") {
      setAnalysis(null);
      setHighlightPlayers([]);
    }
  }, [phase]);

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

    function handleSecretTitleTap() {
    const now = Date.now();
    const { count, lastTs } = secretTapRef.current;

    // Si plus d'1,2s se sont écoulées, on repart de zéro
    if (now - lastTs > 1200) {
      secretTapRef.current = { count: 1, lastTs: now };
      return;
    }

    const newCount = count + 1;
    if (newCount >= 3) {
      // Triple tap : on bascule le mode 5x5 même sur mobile
      secretTapRef.current = { count: 0, lastTs: now };
      setBigGridUnlocked((prev) => {
        const next = !prev;
        try {
          showToast(
            next ? "Mode 5x5 débloqué sur mobile" : "Retour au mode standard"
          );
        } catch (_) {}
        return next;
      });
      return;
    }

    secretTapRef.current = { count: newCount, lastTs: now };
  }

  function getTileIndexFromPoint(x, y) {
    for (let i = 0; i < tileRefs.current.length; i++) {
      const el = tileRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // Hitbox tactile : toute la tuile (rapide), + tolérance légère dans l'inter-tuile.
      const minDim = Math.min(rect.width, rect.height);
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return i;
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
    fetch("/dico.txt")
      .then((r) => r.text())
      .then((txt) => {
        const list = txt
          .split(/\r?\n/)
          .map((x) => normalizeWord(x.trim()))
          .filter(Boolean);
        setDictionary(new Set(list));
    });
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
    const onBeforeUnload = (e) => {
      if (phase === "playing") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);

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
    }) {
      if (!grid || !Array.isArray(grid)) return;
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
      setTournament(tournamentPayload || null);
      setSpecialHint(null);
      setSpecialSolvedOverlay(null);
      setFoundTargetThisRound(false);
      startGameFromServer(
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
    }) {
      botTimersRef.current.forEach((id) => clearTimeout(id));
      botTimersRef.current.clear();
      setLiveBots([]);

      if (endedRoomId) {
        setCurrentRoomId(endedRoomId);
        setRoomId(endedRoomId);
      }
      setPhase("results");
      setServerStatus("break");
      setProvisionalRanking([]);
      setAnnouncements([]);
      setFinalResults(Array.isArray(results) ? results : []);
      setServerEndsAt(null);
      setServerRoundDurationMs(null);
      setRoundId(endedId || null);
      setTournament(tournamentPayload || tournament || null);
      setBreakKind(tournamentPayload?.breakKind || null);
      setTournamentRoundPoints(tournamentPayload?.roundAwarded || {});
      setTournamentTotals(tournamentPayload?.totals || {});
      setTournamentRanking(
        Array.isArray(tournamentPayload?.ranking)
          ? tournamentPayload.ranking.map((e) => ({
              nick: e.nick,
              score: e.points,
              gobbles: e.gobbles ?? null,
              delta: e.delta ?? 0,
            }))
          : []
      );
      setTournamentSummary(summary || null);
      if (tournamentPayload?.breakKind === "tournament_end") {
        setResultsRankingMode("total");
      } else {
        setResultsRankingMode("round");
      }

      if (Array.isArray(results)) {
        const selfScore = results.find((r) => r.nick === nickname.trim())?.score;
        if (typeof selfScore === "number") {
          setScore(selfScore);
        }
      }
    }

    function onBreakStarted({
      roomId: incomingRoomId,
      nextStartAt: nextTs,
      breakKind: bk = null,
      tournament: tournamentPayload = null,
      nextSpecial = null,
      tournamentSummary: summary = null,
    }) {
      if (incomingRoomId && currentRoomId && incomingRoomId !== currentRoomId) return;
      syncServerTime();
      setNextStartAt(nextTs || null);
      setBreakKind(bk);
      if (tournamentPayload) setTournament(tournamentPayload);
      setUpcomingSpecial(nextSpecial && nextSpecial.isSpecial ? nextSpecial : null);
      if (summary) setTournamentSummary(summary);
    }

    function onPlayersUpdate(list = []) {
      const sanitized = Array.isArray(list) ? list : [];
      setPlayers(sanitized);
      const prev = prevPlayersRef.current;
      const current = new Set(sanitized.map((p) => p.nick).filter(Boolean));
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
          [...prevMsgs, ...sysMessages].slice(-MAX_CHAT_LINES)
        );
      }
      prevPlayersRef.current = current;
    }

    function onRankingUpdate({ roomId: incomingRoomId, roundId: rid, ranking = [] } = {}) {
      if (incomingRoomId && currentRoomId && incomingRoomId !== currentRoomId) return;
      if (roundId && rid && rid !== roundId) return;
      setProvisionalRanking(ranking);
    }

    function onChatHistory(history = []) {
      if (!Array.isArray(history)) return;
      setChatMessages(history.slice(-MAX_CHAT_LINES));
    }

    function onChatNew(msg) {
      if (!msg || typeof msg !== "object") return;
      setChatMessages((prev) => [...prev, msg].slice(-MAX_CHAT_LINES));

      const author = (msg.author || msg.nick || "").trim();
      const me = nickname.trim();
      if (author && me && author === me) return;
      if (!isChatOpenMobileRef.current) {
        setMobileChatUnreadCount((prev) => prev + 1);
      }
    }

    function onAnnouncement(data) {
      maybePlayAnnouncementSound(data);
      setAnnouncements((prev) => [...prev, data].slice(-40));
    }

    function onConnectError() {
      setIsConnecting(false);
      setIsLoggedIn(false);
      setLoginError("Connexion au serveur impossible");
      setConnectionError("Connexion au serveur impossible");
      setPlayers([]);
      setProvisionalRanking([]);
    }

    function onDisconnect() {
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
      setBreakKind(null);
      setSpecialHint(null);
      setSpecialSolvedOverlay(null);
      setFoundTargetThisRound(false);
      const fresh = generateClientId();
      setClientId(fresh);
      try {
        localStorage.setItem("boggle_client_id", fresh);
      } catch (_) {}
    }

    function onMedalsUpdate(payload) {
      setMedals(payload && typeof payload === "object" ? payload : {});
    }

    function onSpecialHint(payload) {
      if (!payload || typeof payload !== "object") return;
      if (roundId && payload.roundId && payload.roundId !== roundId) return;
      setSpecialHint({
        kind: payload.kind || null,
        pattern: payload.pattern || "",
        length: payload.length || null,
      });
    }

    function onSpecialSolved(payload) {
      if (!payload || typeof payload !== "object") return;
      if (roundId && payload.roundId && payload.roundId !== roundId) return;
      const me = nickname.trim();
      if (!me || (payload.nick || "") !== me) return;
      setFoundTargetThisRound(true);
      setSpecialSolvedOverlay({
        nick: payload.nick || "",
        word: "",
        kind: payload.kind || null,
      });
      try {
        playGobbleVoice();
        triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
      } catch (_) {}
    }

    socket.on("roundStarted", onRoundStarted);
    socket.on("roundEnded", onRoundEnded);
    socket.on("breakStarted", onBreakStarted);
    socket.on("playersUpdate", onPlayersUpdate);
    socket.on("rankingUpdate", onRankingUpdate);
    socket.on("chat:history", onChatHistory);
    socket.on("chat:new", onChatNew);
    socket.on("announcement", onAnnouncement);
    socket.on("medalsUpdate", onMedalsUpdate);
    socket.on("specialHint", onSpecialHint);
    socket.on("specialSolved", onSpecialSolved);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("roundStarted", onRoundStarted);
      socket.off("roundEnded", onRoundEnded);
      socket.off("breakStarted", onBreakStarted);
      socket.off("playersUpdate", onPlayersUpdate);
      socket.off("rankingUpdate", onRankingUpdate);
      socket.off("chat:history", onChatHistory);
      socket.off("chat:new", onChatNew);
      socket.off("announcement", onAnnouncement);
      socket.off("medalsUpdate", onMedalsUpdate);
      socket.off("specialHint", onSpecialHint);
      socket.off("specialSolved", onSpecialSolved);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
    };
  }, [roundId, nickname, currentRoomId, roomId]);


  useEffect(() => {
    let id = null;

    const finalizeRound = () => {
      if (dictionary) {
        const filtered = filterDictionary(dictionary, board);
        const solved = solveAll(board, filtered);
        solutionsRef.current = solved;

        const all = [...solved.entries()].map(([word, path]) => ({
          word,
          pts: computeScore(word, path, board),
          path,
        }));

        all.sort((a, b) => b.pts - a.pts);
        setAllWords(all);
      }

      setServerStatus("break");
      setPhase("results");
    };

    if (phase === "countdown") {
      setTick(COUNTDOWN);
      id = setInterval(() => {
        setTick((t) => {
          if (t <= 1) {
            clearInterval(id);
            startGame();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } else if (phase === "playing") {
      const maxDuration =
        Number.isFinite(serverRoundDurationMs)
          ? Math.max(1, Math.round(serverRoundDurationMs / 1000))
          : ROOM_OPTIONS[currentRoomId || roomId]?.duration ?? DEFAULT_DURATION;

      if (serverEndsAt) {
        const updateRemaining = () => {
          const now = getNowServerMs();
          const remaining = Math.min(
            maxDuration,
            Math.max(0, Math.round((serverEndsAt - now) / 1000))
          );

          if (remaining <= 0) {
            clearInterval(id);
            finalizeRound();
            return 0;
          }

          return remaining;
        };

        setTick(updateRemaining());
        id = setInterval(() => {
          setTick(updateRemaining);
        }, 1000);
      } else {
        const fallbackDuration = maxDuration;
        setTick(fallbackDuration);
        id = setInterval(() => {
          setTick((t) => {
            if (t <= 1) {
              clearInterval(id);
              finalizeRound();
              return 0;
            }
            return t - 1;
          });
        }, 1000);
      }
    }

    return () => {
      if (id) clearInterval(id);
    };
  }, [phase, serverEndsAt, serverRoundDurationMs, board, dictionary, currentRoomId, roomId]);

  useEffect(() => {
    if (phase !== "results") return;
    if (!dictionary) return;
    if (allWords.length > 0) return;

    setAllWords(buildAllWordsLocal());
  }, [phase, board, dictionary, allWords.length]);

  // Bots désactivés
  useEffect(() => {
    botTimersRef.current.forEach((id) => clearTimeout(id));
    botTimersRef.current.clear();
    liveBotsRef.current.clear();
    setLiveBots([]);
  }, [phase, roundId, allWords, dictionary]);

  // Bots désactivés : on ne complète plus les résultats localement
  useEffect(() => {
    /* no-op */
  }, [phase, allWords, roundId, nickname]);

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
    socket.emit("timeSync", null, (res) => {
      const t1 = Date.now();
      if (res?.ok && typeof res.serverNow === "number") {
        const rtt = Math.max(0, t1 - t0);
        const offset = res.serverNow + rtt / 2 - t1;
        serverTimeOffsetRef.current = offset;
      }
      next?.();
    });
  }

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

    const attemptLogin = () => {
      socket.emit("login", { nick, clientId, roomId }, (res) => {
        if (!res?.ok) {
          if (res?.error === "pseudo_taken") {
            setLoginError("Pseudo deja utilise");
          } else if (res?.error === "nick_too_long") {
            setLoginError("25 caracteres max");
          } else if (res?.error === "invalid_room") {
            setLoginError("Salle indisponible");
          } else {
            setLoginError("Connexion refusee");
          }
          setIsConnecting(false);
          return;
        }

        const joinedRoom = res?.roomId || roomId;
        setCurrentRoomId(joinedRoom);
        setRoomId(joinedRoom);
        const nextSize = getGridSizeForRoom(joinedRoom);
        setGridSize(nextSize);
        setBoard(Array(nextSize * nextSize).fill({ letter: "?", bonus: null }));
        setIsLoggedIn(true);
        setIsConnecting(false);
        setServerStatus("waiting");
        setScore(0);
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
    testBotsRef.current = false;
    solutionsRef.current = new Map();
    bestGridMaxRef.current = 0;
    bestGridMaxLenRef.current = 0;
    setAccepted([]);
    acceptedScoresRef.current = new Map();
    acceptedRef.current = [];
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
    setStatusMessage("");
    cancelAllWordsCompute();
    setAllWords([]);
    bestWordAnnounceRef.current = -1;
    setFinalResults([]);
    setProvisionalRanking([]);
    liveBotsRef.current.clear();
    botTimersRef.current.forEach((id) => clearTimeout(id));
    botTimersRef.current.clear();
    setLiveBots([]);
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
    setServerRoundDurationMs(
      Number.isFinite(durationMs) ? Math.max(1, Math.round(durationMs)) : null
    );
    setServerStatus("running");
    setConnectionError("");
    setPhase("playing");
    // plus de bots auto
  }

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

  function scheduleAllWordsCompute(sourceBoard, { updateBestRefs = true, jobKey } = {}) {
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

    // Laisse le temps au joueur de saisir les premiers mots sans jank.
    allWordsComputeRef.current.kickoff = setTimeout(kickoff, 4500);
  }

  function buildAllWordsLocal(sourceBoard = board, opts = {}) {
    const updateBestRefs = opts.updateBestRefs !== false;
    if (!dictionary) return [];
    if (!sourceBoard || sourceBoard.length === 0) return [];
    const filtered = filterDictionary(dictionary, sourceBoard);
    const solved = solveAll(sourceBoard, filtered);
    solutionsRef.current = solved;

    const all = [...solved.entries()].map(([word, path]) => ({
      word,
      pts: computeScore(word, path, sourceBoard),
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

  useEffect(() => {
    if (phase !== "playing") return;
    if (specialRound?.type === "speed") return;
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

  function startBotsIfReady() {
    // bots désactivés
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
    testBotsRef.current = false;
    solutionsRef.current = new Map();
    bestGridMaxRef.current = 0;
    bestGridMaxLenRef.current = 0;
    setAccepted([]);
    acceptedScoresRef.current = new Map();
    acceptedRef.current = [];
    setSpecialRound(null);
    setUpcomingSpecial(null);
    setRoundStats(null);
    setScore(0);
    setLastWords([]);
    setStatusMessage("");
    cancelAllWordsCompute();
    setAllWords([]);
    bestWordAnnounceRef.current = -1;
    setFinalResults([]);
    setProvisionalRanking([]);
    setRoundId(null);
    setServerEndsAt(null);
    setServerStatus("running");
    setNextStartAt(null);
    setBreakCountdown(null);
    liveBotsRef.current.clear();
    botTimersRef.current.forEach((id) => clearTimeout(id));
    botTimersRef.current.clear();
    setLiveBots([]);
    setTick(ROOM_OPTIONS[currentRoomId || roomId]?.duration ?? DEFAULT_DURATION);
    setPhase("playing");
    // bots désactivés
  }

  function goBackToLobby() {
    try {
      socket.disconnect();
    } catch (_) {}
    setIsLoggedIn(false);
    setPhase("lobby");
    setRoundId(null);
    setServerEndsAt(null);
    setServerStatus("waiting");
    setPlayers([]);
    setProvisionalRanking([]);
    setFinalResults([]);
    setAnnouncements([]);
    setNextStartAt(null);
    setBreakCountdown(null);
    setUpcomingSpecial(null);
    setConnectionError("");
    setStatusMessage("");
    setAccepted([]);
    acceptedRef.current = [];
    acceptedScoresRef.current = new Map();
    setCurrentTiles([]);
    currentTilesRef.current = [];
    setHighlightPath([]);
    const fillSize = gridSize || getGridSizeForRoom(roomId);
    setBoard(Array(fillSize * fillSize).fill({ letter: "?", bonus: null }));
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

  function clearSelection() {
    setCurrentTiles([]);
    currentTilesRef.current = [];
    setHighlightPath([]);
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
    const path = findBestPathForWord(board, wordNorm);
    if (!path || path.length === 0) return;
    const letters = path.map((idx) => board[idx].letter);
    setCurrentTiles(letters);
    currentTilesRef.current = letters;
    setHighlightPath(path);
    setStatusMessage("");
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

  /**
   * Ajout de lettres via le clavier, avec pathfinder optimisé.
   */
  function addLetterFromKeyboard(label) {
    setStatusMessage("");

    setCurrentTiles((prev) => {
      const next = [...prev, label];
      currentTilesRef.current = next;

      const raw = normalizeWord(next.join(""));
      if (!raw) return prev;

      const path = findBestPathForWord(board, raw);
      if (path) setHighlightPath(path);
      else setHighlightPath([]);

      return next;
    });
  }

  function removeLastLetterFromKeyboard() {
    setStatusMessage("");
    setCurrentTiles((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      currentTilesRef.current = next;
      if (!next.length) {
        setHighlightPath([]);
        return next;
      }
      const raw = normalizeWord(next.join(""));
      if (!raw) {
        setHighlightPath([]);
        return next;
      }
      const path = findBestPathForWord(board, raw);
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

  function playErrorSound() {
    if (isMuted) return;
    const audio = document.getElementById("error-sound");
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }

  function playDuplicateErrorTone() {
    if (isMuted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime + 0.01;
    const freqs = [170, 120]; // deux bips graves, le second plus bas
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = now + idx * 0.1;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.16);
      } catch (_) {}
    });
  }

    // =============== VIBRATIONS (optionnelles, mobile) ===============
  function vibrateLight() {
    if (!canVibrateRef.current) return;
    try {
      navigator.vibrate(15);
    } catch (_) {}
  }

  function vibrateSuccess(wordLength) {
    // Haptique supprimé sur validation : on réserve la vibration aux erreurs.
    return;
  }


  function vibrateErrorPattern() {
    if (!canVibrateRef.current) return;
    try {
      navigator.vibrate([40, 60, 40]);
    } catch (_) {}
  }

    function error(msg) {
    setStatusMessage(msg);
    setShake(false);
    // restart the animation even if the state was already true
    requestAnimationFrame(() => setShake(true));
    const lower = (msg || "").toLowerCase();
    const isDuplicate =
      lower.includes("déjà") || lower.includes("deja");
    if (isDuplicate) {
      playDuplicateErrorTone();
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
    if (phase !== "playing") return;
    setActiveArea("game");
    draggingRef.current = true;
    setLastInputMode(mode);
    setStatusMessage("");

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
        const nextPath = prevPath.slice(0, -1);
        setCurrentTiles((prevLetters) => {
          const newLetters = prevLetters.slice(0, -1);
          currentTilesRef.current = newLetters;
          tileStepRef.current = Math.max(0, newLetters.length - 1);
          return newLetters;
        });
        return nextPath;
      }

      const neigh = neighbors(lastIndex, gridSize);
      if (!neigh.includes(index)) return prevPath;
      if (prevPath.includes(index)) return prevPath;

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
          // du cÙtÈ d'o? l'on arrive (pour faciliter les diagonales sans rendre
          // les cases trop difficiles ‡ sÈlectionner au doigt).
          const CORNER_THRESHOLD = 0.78;
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
  if (phase !== "playing") return;
  if (!e.touches || e.touches.length === 0) return;

  setActiveArea("game");
  draggingRef.current = true;
  setLastInputMode("touch");
  setStatusMessage("");

  const letter = board[index].letter;
  setCurrentTiles([letter]);
  currentTilesRef.current = [letter];
  setHighlightPath([index]);
}

function handleTouchMove(e) {
  if (!draggingRef.current) return;
  if (!e.touches || e.touches.length === 0) return;

  const touch = e.touches[0];
  const idx = getTileIndexFromPoint(touch.clientX, touch.clientY);
  if (idx == null) return;

  // on ne passe plus l???event souris, on laisse juste la logique de chemin faire son job
  handleMouseEnter(idx, touch);
}

function handleTouchEnd() {
  if (!draggingRef.current) return;
  draggingRef.current = false;
  submit();

  // surtout pas de preventDefault ici, ça peut foutre le bazar sur mobile
  function handleMouseUp() {
  if (!draggingRef.current) return;
  draggingRef.current = false;
  submit();
}

}




  function submit()  {
  if (typeof window !== "undefined") {
    window.scrollTo(0, 0);
  }

  if (foundTargetThisRound) {
    return error("Tu as déjà trouvé !");
  }
    
    const display = currentTilesRef.current.join("");
    const raw = normalizeWord(display);

    if (!raw || raw.length < 3) return error("Mot trop court");
    if (!dictionary || !dictionary.has(raw)) return error("Absent du dico");
    if (acceptedRef.current.includes(raw)) return error("D\u00e9j\u00e0 trouv\u00e9");

    let path;
    const touchContext =
      lastInputMode === "touch" || (isTouchDeviceRef.current && lastInputMode !== "keyboard");
    const usesManualPath = touchContext || lastInputMode === "mouse";

    if (usesManualPath) {
      path = highlightPath;
      if (!path || path.length === 0) return error("Mot absent de la grille");
    } else {
      path = findBestPathForWord(board, raw);
      if (!path) return error("Mot absent de la grille");
      setHighlightPath(path);
    }

    // Mode en ligne : on délègue la validation / le score au serveur
    if (roundId && socket.connected && isLoggedIn) {
      socket.emit("submitWord", { roundId, word: raw }, (res) => {
        if (!res || !res.ok) {
          if (res?.error === "invalid_word") {
            return error("Mot refusé par le serveur");
          }
          if (res?.error === "already_played") {
            return error("Mot d\u00e9j\u00e0 jou\u00e9 (serveur)");
          }
          if (res?.error === "not_target") {
            return error("Ce n'est pas le bon mot");
          }
          if (res?.error === "already_found") {
            return error("Déjà trouvé !");
          }
          return error("Erreur serveur");
        }

        const pts = res.wordScore;
        const isTargetRoundNow =
          specialRound?.type === "target_long" || specialRound?.type === "target_score";

        setScore(res.score);
        acceptedScoresRef.current.set(raw, pts);
        pushWordHistory(raw);

        const wordBonuses = summarizeBonuses(path, board);
        setLastWords((prev) => {
          const displayStr = display || raw.toUpperCase();
          const now = Date.now();
          const feedLabel = isTargetRoundNow ? "gobble" : null;
          const next = [
            { id: now, ts: now, display: displayStr, pts, label: feedLabel, bonuses: wordBonuses },
            ...prev,
          ];
          return next.slice(0, 24);
        });

        const wordLen = normalizeWord(display || raw || "").length || 3;

 if (!isTargetRoundNow) {
   maybeAnnounceBestWord(nickname.trim() || "Moi", display || raw, pts);
   playScoreSound(pts);
 }
  const isSpeedRound = specialRound?.type === "speed";
 const maxPossiblePts = bestGridMaxRef.current || 0;
 const maxPossibleLen = bestGridMaxLenRef.current || 0;
 const isGobbleNow =
   !isSpeedRound &&
   ((maxPossiblePts > 0 && pts === maxPossiblePts) ||
     (maxPossibleLen > 0 && wordLen === maxPossibleLen));

 if (!isTargetRoundNow) {
   if (isGobbleNow) {
     playGobbleVoice();
     triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
   } else if (pts >= 50) {
     triggerPraiseFlash("ENORME !", { kind: "gold", shakeGrid: true });
   } else if (pts >= 35) {
     triggerPraiseFlash("FABULEUX !", { kind: "purple" });
   } else if (pts >= 20) {
     triggerPraiseFlash("EXCELLENT !", { kind: "blue" });
   }
   if (pts >= BIG_SCORE_THRESHOLD) {
     triggerBigScoreFlash(pts);
   }
 }
 if (isTargetRoundNow) {
   showToast("Trouve !");
 } else {
   showToast(`+${pts} pts`);
 }


        setAccepted((prev) => {
          const updated = [...prev, raw];
          acceptedRef.current = updated;
          return updated;
        });

        setStatusMessage(isTargetRoundNow ? "Trouve !" : `+${pts} pts`);
        clearSelection();
      });

      return;
    }

    if (roundId && (!socket.connected || !isLoggedIn)) {
      return error("Reconnecte-toi au serveur pour valider");
    }

    // Mode solo local : on garde le scoring existant
    const pts = computeScore(raw, path, board);

    setScore((s) => s + pts);
    acceptedScoresRef.current.set(raw, pts);
    pushWordHistory(raw);

    const wordBonuses = summarizeBonuses(path, board);
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    setLastWords((prev) => {
      const displayStr = display || raw.toUpperCase();
      const now = Date.now();
      const feedLabel = isTargetRoundNow ? "gobble" : null;
      const next = [
        { id: now, ts: now, display: displayStr, pts, label: feedLabel, bonuses: wordBonuses },
        ...prev,
      ];
      return next.slice(0, 24);
    });

    const wordLen = normalizeWord(display || raw || "").length || 3;

 playScoreSound(pts);
 maybeAnnounceBestWord(nickname.trim() || "Moi", display || raw, pts);
 const isSpeedRound = specialRound?.type === "speed";
 const maxPossiblePts = bestGridMaxRef.current || 0;
 const maxPossibleLen = bestGridMaxLenRef.current || 0;
 const isGobbleNow =
   !isSpeedRound &&
   ((maxPossiblePts > 0 && pts === maxPossiblePts) ||
     (maxPossibleLen > 0 && wordLen === maxPossibleLen));

 if (isGobbleNow) {
   playGobbleVoice();
   triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
 } else if (pts >= 50) {
   triggerPraiseFlash("ENORME !", { kind: "gold", shakeGrid: true });
 } else if (pts >= 35) {
   triggerPraiseFlash("FABULEUX !", { kind: "purple" });
 } else if (pts >= 20) {
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

    setStatusMessage(`+${pts} pts`);
    clearSelection();
  }


  function analyzeWord(word) {
    if (!word) return;
    const path =
      solutionsRef.current.get(word) || findBestPathForWord(board, word);
    if (!path || path.length === 0) {
      setAnalysis(null);
      setHighlightPath([]);
      setHighlightPlayers([]);
      return;
    }
    const bonuses = summarizeBonuses(path, board);
    const pts = computeScore(word, path, board);
    const matchedPlayers = finalResults
      .filter((res) => Array.isArray(res.words) && res.words.some((w) => normalizeWord(w) === normalizeWord(word)))
      .map((res) => res.nick);
    setAnalysis({ word, pts, bonuses });
    setHighlightPath([]); // ne pas afficher le chemin en fin de partie
    setHighlightPlayers(matchedPlayers);
  }

  // Chat
  function submitChat(e, forcedText = null) {
    if (e) e.preventDefault();
    const text = (forcedText ?? chatInput).trim();
    if (!text) return;
    const now = Date.now();
    if (now - chatLastSentRef.current < CHAT_MIN_DELAY) return;
    chatLastSentRef.current = now;

    if (!socket.connected) {
      setConnectionError("Connecte-toi au serveur pour envoyer un message.");
      return;
    }

    socket.emit("chat:send", text, (res) => {
      if (!res?.ok) {
        setConnectionError("Message non envoyé");
      } else {
        setConnectionError("");
      }
    });

    pushChatHistory(text);
    if (!forcedText) setChatInput("");
  }

  const usedSet = phase === "playing" ? new Set(highlightPath) : new Set();
  const currentDisplay =
    currentTiles.length > 0
      ? currentTiles.join("")
      : typeof statusMessage === "string"
      ? statusMessage
      : "";
        // Mot en cours d'écriture : on prend l'état, et si jamais
  // il est vide on tombe sur la ref (utile pour certains cas tactile)
  const liveWord =
    currentTiles.length > 0
      ? currentTiles.join("")
      : currentTilesRef.current.join("");

  const currentBonuses = summarizeBonuses(highlightPath, board);
  const wordMultiplier =
    Math.pow(2, currentBonuses.M2 || 0) * Math.pow(3, currentBonuses.M3 || 0);
  const showBonuses =
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
  const allWordsMap = new Map(allWords.map((w) => [w.word, w]));
  const foundList = acceptedRef.current.map((word) => ({
    word,
    isFound: true,
    userPts: acceptedScoresRef.current.get(word),
    bestPts: allWordsMap.get(word)?.pts,
  }));
  foundList.sort((a, b) => (b.userPts || 0) - (a.userPts || 0));
  const baseList = allWords.length > 0 ? allWords : foundList;
  const displayList = baseList.map((entry) => ({
    word: entry.word,
    isFound: acceptedRef.current.includes(entry.word),
    userPts: acceptedScoresRef.current.get(entry.word),
    bestPts: entry.pts,
  }));
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

    const specialTypeLabel = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (upcomingSpecial.type === "speed") return "JEU RAPIDE";
      if (upcomingSpecial.type === "monstrous") return "GRILLE MONSTRUEUSE";
      if (upcomingSpecial.type === "target_long") return "MOT LE PLUS LONG";
      if (upcomingSpecial.type === "target_score") return "MOT EN OR";
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
        <div className="text-center text-lg font-bold">Bilan</div>
        <div className="space-y-4">
          {endStats.bestWord && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className={`${resultLabelClass} text-xs sm:text-sm font-semibold`}>
                  Meilleur mot
                </span>
                <span className="flex items-center gap-2 text-right flex-wrap justify-end">
                  <span className="font-bold break-all text-sm sm:text-base">
                    {endStats.bestWord.word}
                  </span>
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
                <span className="flex items-center gap-2 text-right flex-wrap justify-end">
                  <span className="font-bold break-all text-sm sm:text-base">
                    {endStats.longestWord.word}
                  </span>
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

  // messages visibles dans le chat (max 18), ancrés en bas
  const visibleMessages = chatMessages.slice(-MAX_CHAT_LINES);
  const lastMessageId =
    visibleMessages[visibleMessages.length - 1]?.id ?? null;

  const selfNick = nickname.trim();
  const botRankingEntries = [];

  function buildRanking() {
    const entries = [];
    const seen = new Set();

    provisionalRanking.forEach((entry) => {
      entries.push({
        nick: entry.nick,
        score: typeof entry.score === "number" ? entry.score : null,
        rank: typeof entry.rank === "number" ? entry.rank : null,
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
        entries.push({ nick: selfNick, score: currentScore, rank: null });
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

  const rankingSource = buildRanking();

  // Animation FLIP pour la liste de mots
  useEffect(() => {
    const prev = prevPositionsRef.current;
    if (!prev || prev.size === 0) return;
    requestAnimationFrame(() => {
      displayList.forEach((entry, idx) => {
        const el = listItemRefs.current.get(entry.word);
        if (!el) return;
        const rect = el.getBoundingClientRect();
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
      });
      prevPositionsRef.current = new Map();
    });
  }, [showAllWords, displayList.length]);

  useEffect(() => {
    if (phase === "results") {
      setMobileResultsTab("classement");
      setShowAllWords(false);
    }
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
    specialRound?.type === "target_long" || specialRound?.type === "target_score";
  const formatTargetTime = (ms) => {
    if (!Number.isFinite(ms)) return "PAS TROUVÉ";
    const seconds = Math.max(0, ms) / 1000;
    return `${seconds.toFixed(1).replace(".", ",")}s`;
  };
  const finalRanking = finalResults.length
    ? [...finalResults]
        .map((entry) => {
          if (isTargetRound) {
            const timeMs = Number.isFinite(entry.targetFoundMs) ? entry.targetFoundMs : null;
            return {
              ...entry,
              wordsCount: null,
              rightLabel: Number.isFinite(timeMs) ? formatTargetTime(timeMs) : "PAS TROUVÉ",
            };
          }
          return {
            ...entry,
            wordsCount: Array.isArray(entry.words) ? entry.words.length : null,
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

    for (const entry of finalResults) {
      const words = Array.isArray(entry.words) ? entry.words : [];
      if (!mostWords || words.length > mostWords.count) {
        mostWords = { nick: entry.nick, count: words.length };
      }

      for (const raw of words) {
        const norm = normalizeWord(raw);
        const path = findBestPathForWord(board, norm);
        if (!path) continue;
        const pts = computeScore(norm, path, board);
        if (!bestWord || pts > bestWord.pts) {
          bestWord = { nick: entry.nick, word: raw, pts };
        }
        if (!longestWord || norm.length > longestWord.len) {
          longestWord = { nick: entry.nick, word: raw, len: norm.length };
        }
      }
    }

    return { winner, bestWord, longestWord, mostWords };
  }, [finalResults, board]);

  function renderMedals(nick) {
    const m = medals?.[nick];
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
      <span className="inline-flex items-center gap-0.5 ml-1">{parts}</span>
    ) : null;
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

  function randomBotNick() {
    const prefixes = ["Nova", "Echo", "Pixel", "Turbo", "Jolt", "Rift", "Zen", "Pogo", "Lynx", "Orion"];
    const suffixes = ["Fox", "Panda", "Raven", "Otter", "Mantis", "Cobra", "Llama", "Koala", "Tigre", "Hawk"];
    const number = Math.floor(Math.random() * 90) + 10;
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    return `${p}${s}${number}`;
  }

  function sampleWords(entries, count) {
    const pool = [...entries];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  function buildTestBots(all) {
    const total = all.length;
    if (total === 0) return [];
    const BOT_COUNT = 10;
    const bots = [];
    for (let i = 0; i < BOT_COUNT; i++) {
      const level = 0.05 + Math.random() * 0.35; // 5% à 40% du dico
      const target = Math.min(total, Math.max(5, Math.round(total * level)));
      const picks = sampleWords(all, target);
      const score = picks.reduce((sum, entry) => sum + (entry.pts || 0), 0);
      const paceFast = 3000 + Math.random() * 4000; // 3-7s
      const paceSlow = 8000 + Math.random() * 7000; // 8-15s
      const pace = level > 0.25 ? paceFast : paceSlow;
      bots.push({
        nick: randomBotNick(),
        score,
        words: picks.map((p) => p.word),
        level,
        pace,
      });
    }
    return bots;
  }

  function resetLiveBots() {
    liveBotsRef.current.clear();
    botTimersRef.current.forEach((id) => clearTimeout(id));
    botTimersRef.current.clear();
    setLiveBots([]);
  }

  function initLiveBots(all) {
    const bots = buildTestBots(all).map((b) => ({
      ...b,
      score: 0,
      words: [],
      remaining: [...b.words],
    }));
    const map = new Map();
    bots.forEach((b) => map.set(b.nick, b));
    liveBotsRef.current = map;
    setLiveBots(bots);
  }

  function scheduleBotTurn(nick) {
    const bot = liveBotsRef.current.get(nick);
    if (!bot || bot.remaining.length === 0) return;
    const delay = bot.pace * (0.7 + Math.random() * 0.6); // +/-30%
    const id = setTimeout(() => {
      playBotWord(nick);
    }, delay);
    botTimersRef.current.set(nick, id);
  }

  function playBotWord(nick) {
    if (phase !== "playing") return;
    const bot = liveBotsRef.current.get(nick);
    if (!bot) return;
    if (bot.remaining.length === 0) return;

    const word = bot.remaining.shift();
    if (!word) return;

    // évite de rejouer les mots de l'humain pour rendre le classement plus lisible
    if (acceptedRef.current.includes(word)) {
      scheduleBotTurn(nick);
      return;
    }

    const path = solutionsRef.current.get(word) || findBestPathForWord(board, word);
    const pts = path ? computeScore(word, path, board) : 0;

    bot.score += pts;
    bot.words = [...bot.words, word];
    liveBotsRef.current.set(nick, bot);
    setLiveBots(Array.from(liveBotsRef.current.values()));
    maybeAnnounceBestWord(nick, word, pts);

    if (bot.remaining.length > 0 && phase === "playing") {
      scheduleBotTurn(nick);
    }
  }

  // Surbrillance par border-4 interne (plus de ring)
  const gameBlockClasses =
    "p-4 bg-white rounded-xl space-y-3 w-full max-w-md " +
    (activeArea === "game"
      ? "border-4 border-black"
      : "border border-gray-300");

  const chatBlockClasses =
    "bg-white rounded-xl p-4 w-full max-w-sm flex flex-col h-full " +
    (activeArea === "chat"
      ? "border-4 border-black"
      : "border border-gray-300");
  const activeRoomId = currentRoomId || roomId;
  const activeRoom = ROOM_OPTIONS[activeRoomId] || ROOM_OPTIONS["room-4x4"];
  const baseRooms = Object.keys(ROOM_OPTIONS);
  const availableRooms =
    isMobileLayout && !bigGridUnlocked ? ["room-4x4"] : baseRooms;

  const lightPanelStyle = darkMode ? {} : { backgroundColor: "#ffffff" };
  const lightGridSurfaceStyle = {};
  const clampGridWidth = (raw) => {
    if (!raw || Number.isNaN(raw)) return null;
    const adjusted = raw - 24; // laisse un peu d'air avec les bordures/paddings
    return Math.min(MAX_GRID_WIDTH, Math.max(MIN_GRID_WIDTH, adjusted));
  };
  const measuredWidth = clampGridWidth(gridWidth);
  const fallbackWidth = clampGridWidth(
    playColumnRef.current?.getBoundingClientRect?.().width ||
      (gridSize === 5 ? 640 : 560)
  );
  const effectiveGridWidth =
    measuredWidth ??
    fallbackWidth ??
    (gridSize === 5 ? Math.min(MAX_GRID_WIDTH, 420) : Math.min(MAX_GRID_WIDTH, 360));
  const gapRatio = Math.max(0.08, Math.min(0.18, BASE_GAP_RATIO * (4 / gridSize))); // 4x4 inchangé, 5x5 resserré
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
  const fontScale = gridSize >= 5 ? 0.68 : 1; // 5x5 plus petit sans toucher 4x4
  const tileFontPx = Math.max(14, Math.min(32, tileSizePx * 0.48 * fontScale));
  const previewBarMinHeight = 56;
  const previewTileStyle = {};
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

  const countdownLines = (() => {
    if (phase === "playing") return [countdownLabel];

    const inResults = serverStatus === "break" || phase === "results";
    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    if (!inResults) return [countdownLabel];

    const lines = [];

    const isNextFinal =
      tournament?.nextRound &&
      tournament?.totalRounds &&
      tournament.nextRound === tournament.totalRounds;

    if (!isNextFinal && upcomingSpecial?.isSpecial) {
      const typeLabel =
        upcomingSpecial.type === "speed"
          ? "JEU RAPIDE"
          : upcomingSpecial.type === "monstrous"
          ? "GRILLE MONSTRUEUSE"
          : upcomingSpecial.type === "target_long"
          ? "MOT LE PLUS LONG"
          : upcomingSpecial.type === "target_score"
          ? "MOT EN OR"
          : null;
      lines.push(typeLabel ? `MANCHE SPECIALE : ${typeLabel}` : "MANCHE SPECIALE");
    }

    if (bc !== null) lines.push(countdownLabel);

    return lines.length ? lines : [countdownLabel];
  })();

        if (!isLoggedIn) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center px-4 ${
          darkMode
            ? "bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800 text-white"
            : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
        }`}
      >
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl p-8 space-y-6 ${
          darkMode
            ? "bg-slate-900/70 border border-white/10"
            : "bg-white/90 border border-slate-200"
        }`}
      >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
  <div
    className="flex items-baseline gap-2 text-3xl font-black tracking-tight cursor-pointer select-none"
    onClick={handleSecretTitleTap}
  >
    <span>GOBBLE</span>
    <span className="text-[11px] font-extrabold tracking-widest px-2 py-0.5 rounded-full border border-amber-300 bg-amber-100 text-amber-900">
      BETA
    </span>
  </div>
  <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
    Salon multijoueur sans compte...
  </p>
</div>

            <div className="flex flex-col items-start gap-1 text-xs">
              <span className={`px-3 py-1 rounded-full border ${darkMode ? "bg-white/10 border-white/10" : "bg-slate-100 border-slate-200 text-slate-700"}`}>
                {isConnecting ? "Connexion..." : "Serveur en \u00e9coute"}
              </span>
              {connectionError && (
                <span className={darkMode ? "text-red-300" : "text-red-600"}>{connectionError}</span>
              )}
            </div>
          </div>

          <div className={`grid md:grid-cols-3 gap-4 text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            <div className={`p-3 rounded-lg border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="font-semibold">Pseudo unique</div>
              <div className={`text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                Pas de compte, juste un pseudo non utilisé par un autre joueur.
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="font-semibold">Chat en direct</div>
              <div className={`text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                Messages partagés dès que tu es connecté.
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className="font-semibold">Classement live</div>
              <div className={`text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                Ta position se met à jour, les scores détaillés arrivent en fin de manche.
              </div>
            </div>
          </div>

          <form
            onSubmit={handleLogin}
            className={`rounded-xl p-5 flex flex-col gap-3 border ${
              darkMode ? "bg-slate-800/70 border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <label className="text-sm font-semibold">
              Pseudo
              <input
              type="text"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white text-slate-900 outline-none border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/60"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={isConnecting}
              maxLength={25}
            />
            </label>
            {loginError && (
              <div className="text-red-300 text-xs">{loginError}</div>
            )}
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold">Choix du salon</div>
              <div className="flex flex-wrap gap-2">
                {availableRooms.map((rid) => {
                  const opt = ROOM_OPTIONS[rid];
                  const selected = roomId === rid;
                  const count = roomStats[rid]?.players ?? 0;
                  return (
                    <button
                      key={rid}
                      type="button"
                      onClick={() => setRoomId(rid)}
                      disabled={isConnecting}
                      className={`px-3 py-2 rounded-lg border text-left flex-1 min-w-[140px] transition ${
                        selected
                          ? "bg-blue-600 text-white border-blue-500"
                          : darkMode
                          ? "bg-white/10 border-white/20 text-slate-100 hover:bg-white/20"
                          : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      <div className="font-semibold leading-tight">
                        {opt?.label || rid}
                      </div>
                      <div className={`mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${darkMode ? "bg-white/15 border-white/20" : "bg-white border-slate-200"}`}>
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                        <span>{count} joueur{count > 1 ? "s" : ""}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {isMobileLayout && (
                <div className={`text-[11px] ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
                  Option 5x5 dispo sur desktop
                </div>
              )}
            </div>
            <button
              type="submit"
              className="mt-1 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition disabled:opacity-60"
              disabled={isConnecting}
            >
              {isConnecting ? "Connexion..." : "Entrer dans la partie"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const showTournamentFinale =
    phase === "results" &&
    breakKind === "tournament_end" &&
    tournamentSummary &&
    Array.isArray(tournamentSummary.ranking) &&
    tournamentSummary.ranking.length > 0;

  if (!confettiPiecesRef.current) {
    const colors = ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"];
    confettiPiecesRef.current = Array.from({ length: 70 }, (_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * 1.2;
      const duration = 2.8 + Math.random() * 2.2;
      const sizeW = 6 + Math.random() * 6;
      const sizeH = 10 + Math.random() * 10;
      const rot = Math.floor(Math.random() * 360);
      const color = colors[i % colors.length];
      return { id: i, left, delay, duration, sizeW, sizeH, rot, color };
    });
  }
  const confettiPieces = confettiPiecesRef.current;

  if (showTournamentFinale) {
    const finaleRanking = tournamentSummary.ranking.map((e) => ({
      nick: e.nick,
      score: e.points,
    }));
    const records = tournamentSummary.records || {};
    const winnerNick = tournamentSummary.winnerNick || "Joueur";
    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;

    return (
      <div
        className={`min-h-screen relative overflow-hidden ${
          darkMode
            ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white"
            : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
        }`}
      >
        <style>{slideStyles}</style>

        <div className="pointer-events-none absolute inset-0">
          {confettiPieces.map((p) => (
            <span
              key={p.id}
              className="confetti-piece"
              style={{
                left: `${p.left}%`,
                backgroundColor: p.color,
                width: `${p.sizeW}px`,
                height: `${p.sizeH}px`,
                transform: `rotate(${p.rot}deg)`,
                animationDelay: `${p.delay}s`,
                ["--confetti-duration"]: `${p.duration}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="text-center">
            <div className="text-sm font-semibold tracking-widest opacity-80">FIN DU MINI-TOURNOI</div>
            <div className="mt-1 text-3xl sm:text-4xl font-black tracking-tight">
              Bravo {winnerNick} !
            </div>
            <div className="mt-2 text-sm font-bold opacity-90">
              {bc != null
                ? `Nouveau tournoi dans : ${bc}s`
                : "Nouveau tournoi imminent..."}
            </div>
          </div>

          <div className="bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl p-4 shadow-xl">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="font-extrabold">Classement général</div>
              <div className="text-xs text-slate-500 dark:text-slate-300 whitespace-nowrap">
                Manche {TOURNAMENT_TOTAL_ROUNDS}/{TOURNAMENT_TOTAL_ROUNDS}
              </div>
            </div>
            <div className="h-[360px]">
              <RankingWidgetMobile
                fullRanking={finaleRanking}
                selfNick={selfNick}
                darkMode={darkMode}
                expanded={true}
                animateRank={false}
                showWheel={false}
                flatStyle={true}
                renderNickSuffix={renderMedals}
                renderAfterRank={renderRankDelta}
              />
            </div>
          </div>

          <div className="bg-white/85 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/10 rounded-xl p-3">
            <div className="text-xs font-extrabold tracking-widest text-slate-600 dark:text-slate-300">
              STATS DU TOURNOI
            </div>
            <div className="mt-2 grid gap-2 text-xs leading-tight">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Plus de mots en une manche</span>
                <span className="tabular-nums">
                  {records?.mostWords?.nick ? (
                    <>
                      <strong>{records.mostWords.nick}</strong> ({records.mostWords.count}) · manche{" "}
                      {records.mostWords.round}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Mot en or</span>
                <span className="tabular-nums">
                  {records?.bestWord?.nick ? (
                    <>
                      <strong>{records.bestWord.nick}</strong> :{" "}
                      <strong>{records.bestWord.word}</strong> ({records.bestWord.pts} pts) · manche{" "}
                      {records.bestWord.round}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Mot le plus long</span>
                <span className="tabular-nums">
                  {records?.longestWord?.nick ? (
                    <>
                      <strong>{records.longestWord.nick}</strong> :{" "}
                      <strong>{records.longestWord.word}</strong> ({records.longestWord.len}) · manche{" "}
                      {records.longestWord.round}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden lg:flex w-full lg:w-[320px] xl:w-[360px] flex-col">
          <div className="bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl p-4 shadow-xl flex flex-col min-h-0 h-[min(720px,calc(100vh-4rem))]">
            <h2 className="font-bold mb-2 text-center">Chat</h2>
            <div className="flex-1 min-h-0 border rounded px-2 py-1 bg-white text-xs space-y-1 flex flex-col justify-end overflow-hidden">
              {visibleMessages.map((msg, idx) => {
                const count = visibleMessages.length;
                const rankFromBottom = count - 1 - idx;
                let opacity = 1;

                if (rankFromBottom >= FULL_VISIBLE_LINES_FROM_BOTTOM) {
                  const extra =
                    rankFromBottom - (FULL_VISIBLE_LINES_FROM_BOTTOM - 1);
                  const maxExtra =
                    MAX_CHAT_LINES - FULL_VISIBLE_LINES_FROM_BOTTOM;
                  const t = Math.min(extra / maxExtra, 1);
                  opacity = 1 - t * (1 - MIN_CHAT_OPACITY);
                }

                const author = (msg.author || msg.nick || "Anonyme").trim();
                const isYou = author === nickname.trim();
                const isSystem = ["systeme", "system", "systÇùme"].includes(
                  author.toLowerCase()
                );
                const isLast = msg.id === lastMessageId;

                return (
                  <div
                    key={msg.id}
                    className={`w-full transition-opacity duration-300 ${
                      isLast ? "slide-fade-in" : ""
                    }`}
                    style={{ opacity }}
                  >
                    {isSystem ? (
                      <div className="w-full px-1 py-0.5 text-[0.65rem] italic text-orange-700">
                        {msg.text}
                      </div>
                    ) : (
                      <div
                        className={[
                          "w-full px-1 py-0.5 text-[0.7rem]",
                          isYou ? "bg-blue-50" : "bg-white",
                        ].join(" ")}
                      >
                        <span className="font-semibold mr-1 text-black">
                          {author} :
                        </span>
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
                  className="px-2 py-1 text-[0.7rem] rounded-full border bg-gray-100 hover:bg-gray-200"
                >
                  {txt}
                </button>
              ))}
            </div>

            <form onSubmit={submitChat} className="mt-3 flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                className="flex-1 border rounded px-2 py-1 text-xs"
                placeholder="Ç¸crire un message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    cycleChatHistory(-1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    cycleChatHistory(1);
                  }
                }}
              />
              <button
                type="submit"
                className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
                disabled={!chatInput.trim()}
              >
                Envoyer
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
      </div>
    );
  }

  // ========================================================================
  // *** NOUVELLE MISE EN PAGE MOBILE PENDANT LA MANCHE ***
  // ========================================================================

  // === Mise en page mobile dédiée pendant la manche ===
  // ??cran unique : classement + prévisualisation du mot + grille en bas + bouton de chat
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
        Math.max(200, Math.min(fallbackViewportWidth - 24, fallbackViewportWidth))
    );
    const previewFallback = 52;
    const liveFeedFallback = 80;
    const mobilePreviewHeight = Math.round(
      mobileLayoutSizing.wordPreviewHeight || previewFallback
    );
    const mobileLiveFeedHeight = Math.round(
      mobileLayoutSizing.liveFeedHeight || liveFeedFallback
    );
    const previewBlockHeight = Math.max(52, mobilePreviewHeight);
    const liveFeedMinHeight = Math.max(80, mobileLiveFeedHeight);
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
    const mobileGapPx = Math.max(
      6,
      Math.min(
        14,
        Math.round(
          (mobileGridSide / Math.max(gridSize, 1)) * BASE_GAP_RATIO
        )
      )
    );
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
            minHeight: 0,
              height: "calc(100vh - 96px)", // fallback compatible si dvh indisponible
          };

    const mobileViewportHeightCandidates =
      typeof window !== "undefined"
        ? [
            mobileLayoutSizing.viewportHeight,
            window.visualViewport?.height,
            window.innerHeight,
            typeof document !== "undefined"
              ? document.documentElement?.clientHeight
              : null,
          ].filter((v) => Number.isFinite(v) && v > 0)
        : [];
    const mobileViewportHeight = mobileViewportHeightCandidates.length
      ? Math.min(...mobileViewportHeightCandidates)
      : 0;
    const mobileViewportContainerStyle =
      mobileViewportHeight > 0
        ? {
            minHeight: `${Math.round(mobileViewportHeight)}px`,
            height: `${Math.round(mobileViewportHeight)}px`,
            maxHeight: `${Math.round(mobileViewportHeight)}px`,
            overflow: "hidden",
          }
        : {
            minHeight: "100vh",
            height: "100vh",
            maxHeight: "100vh",
            overflow: "hidden",
          };

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const chatBottomInsetPx =
      typeof window !== "undefined" &&
      vv &&
      Number.isFinite(vv.height) &&
      Number.isFinite(vv.offsetTop)
        ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        : 0;
    const chatOverlayStyle = chatBottomInsetPx
      ? { paddingBottom: `${chatBottomInsetPx}px` }
      : undefined;
    const chatSheetHeightPx =
      mobileViewportHeight > 0
        ? clampValue(
            Math.round(mobileViewportHeight * 0.9),
            260,
            Math.round(mobileViewportHeight)
          )
        : 0;
    const chatSheetStyle = chatSheetHeightPx
      ? {
          height: `${chatSheetHeightPx}px`,
          maxHeight: `${chatSheetHeightPx}px`,
        }
      : undefined;

    if (isResults) {
      return (
        <div
          className={`flex flex-col ${
            darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
          }`}
          style={mobileViewportContainerStyle}
        >
          <style>{slideStyles}</style>

          <div
            ref={mobileHeaderRef}
            className="px-3 pt-2 pb-1 border-b border-slate-200/70 dark:border-slate-700/70"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <div className="text-lg font-extrabold tracking-tight leading-none">GOBBLE</div>
                <div className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-tight">
                  {tournament?.round && tournament?.totalRounds ? (
                    <>
                      Manche {tournament.round}/{tournament.totalRounds}
                    </>
                  ) : (
                    <>
                      {activeRoom?.label || "Salon"} {gridSize}x{gridSize}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right leading-tight text-xs font-bold">
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
                <button
                  onClick={() => setIsMuted((v) => !v)}
                  className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                  type="button"
                >
                  {isMuted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M11 5L6 9H3v6h3l5 4z" />
                      <line x1="14" y1="9" x2="20" y2="15" />
                      <line x1="20" y1="9" x2="14" y2="15" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M11 5L6 9H3v6h3l5 4z" />
                      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                    </svg>
                  )}
                  <span className="sr-only">{isMuted ? "Son coupé" : "Son actif"}</span>
                </button>
                <button
                  onClick={() => setDarkMode((v) => !v)}
                  className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                  type="button"
                >
                  {darkMode ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                    </svg>
                  )}
                  <span className="sr-only">{darkMode ? "Mode clair" : "Mode sombre"}</span>
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="px-2 py-1 rounded-lg border text-[11px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                  type="button"
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
                  >
                    {isFullscreen ? (
                      <>
                        <path d="M9 9H5V5" />
                        <path d="M3 10L10 3" />
                        <path d="M15 15h4v4" />
                        <path d="m14 21 7-7" />
                      </>
                    ) : (
                      <>
                        <path d="M9 3H5a2 2 0 0 0-2 2v4" />
                        <path d="M3 3l6 6" />
                        <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
                        <path d="m21 21-6-6" />
                      </>
                    )}
                  </svg>
                  <span className="sr-only">
                    {isFullscreen ? "Quitter le plein écran" : "Passer en plein écran"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div
            className="flex-1 flex flex-col gap-2 px-3 pt-2 pb-3 overflow-hidden box-border"
            style={mobileBodyHeightStyle}
          >
            <div
            className={`relative rounded-xl px-3 py-2 flex flex-col gap-2 overflow-hidden flex-1 min-h-0 ${
              darkMode
                ? "bg-slate-900/90"
                : "bg-white/90"
            } box-border`}
            style={{ minHeight: "320px" }}
          >
              <div className="text-xs">
                <div className="flex w-full border-b border-slate-200 dark:border-slate-700">
                  {["classement", "mots"].map((tab) => {
                    const active = mobileResultsTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setMobileResultsTab(tab)}
                        className={`flex-1 py-2 text-center font-semibold transition ${
                          active
                            ? "text-blue-600 border-b-2 border-blue-600"
                            : "text-slate-600 dark:text-slate-300 border-b-2 border-transparent hover:text-blue-600"
                        }`}
                      >
                        {tab === "classement" ? "Classement" : "Mots"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden transition-all duration-300">
                {mobileResultsTab === "mots" ? (
                  <div className="flex flex-col gap-2 h-full">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="inline-flex rounded-full border border-gray-300 overflow-hidden">
                        <button
                          onClick={() => {
                            captureListPositions(displayList);
                            setShowAllWords(false);
                          }}
                          className={`px-3 py-1 transition ${
                            !showAllWords ? "bg-blue-600 text-white" : "bg-white text-gray-600"
                          }`}
                        >
                          Trouvés
                        </button>
                        <button
                          onClick={() => {
                            captureListPositions(displayList);
                            setShowAllWords(true);
                          }}
                          className={`px-3 py-1 transition ${
                            showAllWords ? "bg-blue-600 text-white" : "bg-white text-gray-600"
                          }`}
                        >
                          Tous
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ maxHeight: WORDS_SCROLL_MAX_HEIGHT }}>
                      {displayList.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-xs text-slate-400">
                          Aucun mot trouvé.
                        </div>
                      ) : (
                        <ul className="relative flex flex-col text-sm">
                          {displayList.map((entry) => {
                            const selected = analysis?.word === entry.word;
                            const isFound = entry.isFound;
                            const bestPts = entry.bestPts;
                            const userPts = entry.userPts;
                            const showOpt =
                              isFound && typeof bestPts === "number" && typeof userPts === "number" && bestPts !== userPts;
                            const visible = showAllWords || isFound;
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
                                  selected ? "bg-blue-50 text-blue-800" : "hover:bg-gray-100"
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
                                  color: !isFound && darkMode ? DARK_WORD_INACTIVE : undefined,
                                }}
                              >
                                <span className="flex items-center gap-2">
                                  {isFound ? (
                                    <span style={foundDotStyle} aria-hidden="true" />
                                  ) : (
                                    <span style={{ ...foundDotStyle, opacity: 0 }} aria-hidden="true" />
                                  )}
                                  <span className={isFound ? "font-semibold" : "text-gray-600"}>
                                    {entry.word}
                                  </span>
                                </span>
                                <span className="text-xs text-gray-600 flex items-center gap-2">
                                  {typeof userPts === "number" && isFound && (
                                    <span className="font-semibold">+{userPts} pts</span>
                                  )}
                                  {!isFound && typeof bestPts === "number" && (
                                    <span className="text-gray-500">({bestPts} pts)</span>
                                  )}
                                  {showOpt && (
                                    <span className="text-[0.65rem] text-orange-700">opt: {bestPts} pts</span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 h-full">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="inline-flex rounded-full border border-gray-300 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setResultsRankingMode("round")}
                          className={`px-3 py-1 transition ${
                            resultsRankingMode === "round"
                              ? "bg-blue-600 text-white"
                              : "bg-white text-gray-600"
                          }`}
                        >
                          Manche
                        </button>
                        <button
                          type="button"
                          onClick={() => setResultsRankingMode("total")}
                          className={`px-3 py-1 transition ${
                            resultsRankingMode === "total"
                              ? "bg-blue-600 text-white"
                              : "bg-white text-gray-600"
                          }`}
                        >
                          Total
                        </button>
                      </div>
                      {resultsRankingMode === "total" &&
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
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <RankingWidgetMobile
                        fullRanking={fullRanking}
                        selfNick={selfNick}
                        darkMode={darkMode}
                        expanded={true}
                        animateRank={false}
                        showWheel={false}
                        flatStyle={true}
                        renderNickSuffix={renderMedals}
                        renderAfterRank={resultsRankingMode === "total" ? renderRankDelta : null}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {endStats && (
              <div className="mt-2">
                {renderEndStatsCard("w-full")}
              </div>
            )}
          </div>

          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
            <button
              type="button"
              onClick={() => {
                setMobileChatUnreadCount(0);
                setIsChatOpenMobile(true);
              }}
              className="px-3 py-2 rounded-full shadow-lg text-xs font-semibold bg-blue-600 text-white relative inline-flex items-center whitespace-nowrap"
            >
              Chat
              {mobileChatUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          </div>

          {isChatOpenMobile && (
            <div
              className="fixed inset-0 z-40 flex items-end justify-center bg-black/50"
              style={chatOverlayStyle}
            >
              <div
                className={`w-full rounded-t-2xl border-t flex flex-col ${
                  darkMode
                    ? "bg-slate-900 text-slate-100 border-slate-700"
                    : "bg-white text-slate-900 border-slate-200"
                }`}
                style={chatSheetStyle}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="font-extrabold text-base">Chat</div>
                  <button
                    type="button"
                    onClick={() => setIsChatOpenMobile(false)}
                    className={`h-10 px-4 text-sm font-semibold rounded-xl border ${
                      darkMode
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : "bg-slate-50 border-slate-200 text-slate-900"
                    }`}
                  >
                    Fermer
                  </button>
                </div>
                <div className="flex flex-col flex-1 min-h-0 px-3 py-2 gap-2">
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 text-xs">
                  {visibleMessages.length === 0 ? (
                    <div className="text-[11px] text-slate-400 text-center mt-4">
                      Aucun message pour l'instant.
                    </div>
                  ) : (
                    [...visibleMessages].reverse().map((msg) => {
                      const author = (msg.author || msg.nick || "Anonyme").trim();
                      const isYou = author === selfNick;
                      const isSystem = ["systeme", "system", "système"].includes(
                        author.toLowerCase()
                      );
                      return (
                        <div
                          key={msg.id}
                          className={
                            isSystem
                              ? "px-2 py-0.5 text-[0.65rem] italic text-orange-700 dark:text-amber-300 self-start"
                              : `px-2 py-1 rounded-lg ${
                                  isYou
                                    ? "bg-blue-600 text-white self-end"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 self-start"
                                }`
                          }
                        >
                          {isSystem ? (
                            <span>{msg.text}</span>
                          ) : (
                            <>
                              <span className="font-semibold mr-1">{author}:</span>
                              <span>{msg.text}</span>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                  </div>
                  <form
                    onSubmit={submitChat}
                    className="flex items-center gap-2 pt-1 pb-1 border-t border-slate-200 dark:border-slate-700 shrink-0"
                  >
                    <input
                      type="text"
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                      placeholder="écrire un message..."
                    />
                    <button
                      type="button"
                      className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
                      disabled={!chatInput.trim()}
                      onPointerDown={(e) => {
                        if (!chatInput.trim()) return;
                        e.preventDefault();
                        submitChat();
                        if (chatInputRef.current) {
                          try {
                            chatInputRef.current.focus({ preventScroll: true });
                          } catch (_) {
                            chatInputRef.current.focus();
                          }
                        }
                      }}
                      onClick={(e) => e.preventDefault()}
                    >
                      Envoyer
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

   return (
  <div
    className={`flex flex-col ${
      darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
    }`}
    style={mobileViewportContainerStyle}
  >
   

        <style>{slideStyles}</style>

        {/* En-tête compact : titre, salon, score et boutons rapides */}
        <div
          ref={mobileHeaderRef}
          className="px-3 pt-2 pb-1 border-b border-slate-200/70 dark:border-slate-700/70"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <div className="text-lg font-extrabold tracking-tight leading-none">GOBBLE</div>
              <div className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-tight">
                {tournament?.round && tournament?.totalRounds ? (
                  <>
                    {tournament.round === tournament.totalRounds ? (
                      <>Manche finale</>
                    ) : (
                      <>
                        Manche {tournament.round}/{tournament.totalRounds}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {activeRoom?.label || "Salon"} · {gridSize}x{gridSize}
                  </>
                )}
              </div>
              {phase === "playing" && roundStats && !isTargetRound && (
                <div className="text-[0.65rem] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  {roundStats.words ?? "?"} mots ·{" "}
                  {formatNumber(roundStats.totalPts ?? roundStats.maxPts ?? 0) || "?"} pts
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right leading-tight text-xs font-bold">
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

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMuted((v) => !v)}
                  className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                  type="button"
                >
                  {isMuted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M11 5L6 9H3v6h3l5 4z" />
                      <line x1="14" y1="9" x2="20" y2="15" />
                      <line x1="20" y1="9" x2="14" y2="15" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M11 5L6 9H3v6h3l5 4z" />
                      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                    </svg>
                  )}
                  <span className="sr-only">{isMuted ? "Son coupé" : "Son actif"}</span>
                </button>

                <button
                  onClick={() => setDarkMode((v) => !v)}
                  className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                  type="button"
                >
                  {darkMode ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                    </svg>
                  )}
                  <span className="sr-only">{darkMode ? "Mode clair" : "Mode sombre"}</span>
                </button>

                  <button
  onClick={toggleFullscreen}
  className="px-2 py-1 rounded-lg border text-[11px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
  type="button"
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
  >
    {isFullscreen ? (
      <>
        <path d="M9 9H5V5" />
        <path d="M3 10L10 3" />
        <path d="M15 15h4v4" />
        <path d="m14 21 7-7" />
      </>
    ) : (
      <>
        <path d="M9 3H5a2 2 0 0 0-2 2v4" />
        <path d="M3 3l6 6" />
        <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
        <path d="m21 21-6-6" />
      </>
    )}
  </svg>
  <span className="sr-only">
    {isFullscreen ? "Quitter le plein écran" : "Passer en plein écran"}
  </span>
</button>


                <button
                  onClick={() => setShowHelp((v) => !v)}
                  className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                  type="button"
                >
                  ?
                </button>
              </div>
            </div>
          </div>
        </div>

        {showHelp && (
          <div ref={mobileHelpRef} className="mx-3 mt-2 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-[11px] text-gray-700 dark:text-slate-200">
            <div className="font-bold mb-1 text-xs">Aide rapide</div>
            <ul className="list-disc list-inside space-y-1">
              <li>Saisie clavier ou glisser doigt/souris sur la grille pour former un mot.</li>
              <li>Entrée valide le mot, Backspace efface.</li>
              <li>Tab alterne entre saisie et chat (focus automatique).</li>
              <li>Score = lettres (bonus L2/L3) x multiplicateurs de mot (M2/M3) + bonus de longueur.</li>
            </ul>
          </div>
        )}

        {/* Contenu principal mobile : classement + apercu mot + grille */}
        <div
          className="flex-1 flex flex-col gap-3 px-3 pt-2 pb-3 overflow-hidden box-border"
          style={mobileBodyHeightStyle}
        >
          {phase === "playing" && isTargetRound ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border">
              <div className="text-[11px] font-extrabold tracking-widest text-slate-600 dark:text-slate-300">
                {specialRound?.type === "target_long"
                  ? "TROUVE LE PLUS LONG MOT"
                  : specialRound?.type === "target_score"
                  ? "TROUVE LE MOT EN OR"
                  : "MANCHE SPECIALE"}
              </div>
              <div className="mt-2 text-center font-black tracking-widest text-2xl tabular-nums">
                {specialHint?.pattern ? (
                  specialHint.pattern
                ) : (
                  <span className="text-[13px] tracking-normal opacity-80">
                    MOT MYSTÈRE
                  </span>
                )}
              </div>
              {specialHint?.pattern && specialHint?.length ? (
                <div className="mt-1 text-[11px] font-semibold opacity-70 text-center">
                  {specialHint.length} lettres
                </div>
              ) : null}
              <div className="mt-1 text-[11px] font-semibold opacity-80 text-center">
                {specialHint?.pattern ? "Indice mis a jour..." : "Indice dans 15 secondes..."}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border">
              <RankingWidgetMobile
                fullRanking={fullRanking}
                selfNick={selfNick}
                darkMode={darkMode}
                expanded={false}
                flatStyle={true}
                highlightedPlayers={highlightPlayers}
              />
            </div>
          )}

          <div
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1.5 shadow-sm flex-none box-border"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: `${previewBlockHeight}px`,
              height: `${previewBlockHeight}px`,
            }}
          >
            <div
              className={`w-full text-center font-bold text-base flex items-center justify-center ${shake ? "shake" : ""}`}
            >
              {phase !== "playing" ? (
                <span className="text-slate-700 dark:text-white">
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
                <div className="flex justify-center items-center" style={{ gap: `${previewGapPx}px` }}>
                  {liveWord.split("").map((ch, idx) => {
                    const angle = ((idx * 17 + liveWord.length * 13) % 11) - 5;
                    return (
                      <div
                        key={idx}
                        className="preview-tile"
                        style={{ ...previewTileBaseStyle, transform: `rotate(${angle}deg)` }}
                      >
                        {ch}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="text-slate-700 dark:text-slate-200">
                  {(currentDisplay || "Prêt à jouer").toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div
              className="flex justify-center items-center flex-shrink-0"
              style={{ minHeight: `${mobileGridSide}px` }}
            >
              <div
                 ref={gridRef}
                 className={
                  "grid relative bg-white border rounded-xl shadow-sm w-full p-3 box-border" +
                  (gridShake ? " shake" : "")
                }
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                  gap: `${mobileGapPx}px`,
                  touchAction: "none",
                  width: `${mobileGridSide}px`,
                  height: `${mobileGridSide}px`,
                  maxWidth: "100%",
                  maxHeight: `${mobileGridSide}px`,
                  aspectRatio: "1 / 1",
                  ...lightGridSurfaceStyle,
                }}
                onMouseUp={handleMouseUp}
                onTouchMove={handleTouchMove}
              >
                {board.map((cell, i) => {
                  const { letter, bonus } = cell;
                  const isUsed = usedSet.has(i);
                  const letterPts = tileScore(cell);
                  const bonusClass = bonus
                    ? BONUS_CLASSES[bonus]
                    : "bg-orange-200 border-orange-500 border-2";
                  const highlightClass = isUsed ? "tile-used" : "";

                  return (
                    <button
                      key={i}
                      ref={(el) => (tileRefs.current[i] = el)}
                      onMouseDown={() => handleMouseDown(i)}
                      onMouseEnter={(e) => handleMouseEnter(i, e)}
                      onTouchStart={(e) => handleTouchStart(e, i)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      type="button"
                      className={[
                        "relative rounded-lg flex items-center justify-center font-extrabold select-none focus:outline-none focus:ring-0",
                        isMobileLayout
                          ? "w-full"
                          : "w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] text-xl",
                        bonusClass,
                        highlightClass,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        isMobileLayout
                          ? { aspectRatio: "1 / 1", fontSize: `${mobileTileFontPx}px` }
                          : undefined
                      }
                    >
                      <span className="tile-letter">
                        {letter}
                      </span>
                      {letterPts > 0 ? (
                        <span className="tile-points">{letterPts}</span>
                      ) : null}
                      {bonus && (
                        <span
                          className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${
                            bonus === "M3"
                              ? "bg-red-600 text-white"
                              : bonus === "M2"
                              ? "bg-blue-700 text-white"
                              : "bg-amber-600 text-white"
                          }`}
                        >
                          {bonus}
                        </span>
                      )}
                    </button>
                  );
                })}
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
              </div>
            </div>

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

        {/* Bouton de chat flottant + volet de chat */}
        <div className="fixed bottom-4 right-4 z-30">
          <button
            type="button"
            onClick={() => {
              setMobileChatUnreadCount(0);
              setIsChatOpenMobile(true);
            }}
            className="px-3 py-2 rounded-full shadow-lg text-xs font-semibold bg-blue-600 text-white relative inline-flex items-center whitespace-nowrap"
          >
            Chat
            {mobileChatUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>

        {isChatOpenMobile && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/50"
            style={chatOverlayStyle}
          >
            <div
              className={`w-full rounded-t-2xl border-t flex flex-col ${
                darkMode
                  ? "bg-slate-900 text-slate-100 border-slate-700"
                  : "bg-white text-slate-900 border-slate-200"
              }`}
              style={chatSheetStyle}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <div className="font-extrabold text-base">Chat</div>
                <button
                  type="button"
                  onClick={() => setIsChatOpenMobile(false)}
                  className={`h-10 px-4 text-sm font-semibold rounded-xl border ${
                    darkMode
                      ? "bg-slate-800 border-slate-600 text-slate-100"
                      : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                >
                  Fermer
                </button>
              </div>
              <div className="flex flex-col flex-1 min-h-0 px-3 py-2 gap-2">
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 text-xs">
                  {visibleMessages.length === 0 ? (
                    <div className="text-[11px] text-slate-400 text-center mt-4">
                      Aucun message pour l'instant.
                    </div>
                  ) : (
                    [...visibleMessages].reverse().map((msg) => {
                      const author = (msg.author || msg.nick || "Anonyme").trim();
                      const isYou = author === selfNick;
                      const isSystem = ["systeme", "system", "système"].includes(
                        author.toLowerCase()
                      );
                      return (
                        <div
                          key={msg.id}
                          className={
                            isSystem
                              ? "px-2 py-0.5 text-[0.65rem] italic text-orange-700 dark:text-amber-300 self-start"
                              : `px-2 py-1 rounded-lg ${
                                  isYou
                                    ? "bg-blue-600 text-white self-end"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 self-start"
                                }`
                          }
                        >
                          {isSystem ? (
                            <span>{msg.text}</span>
                          ) : (
                            <>
                              <span className="font-semibold mr-1">{author}:</span>
                              <span>{msg.text}</span>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <form
                  onSubmit={submitChat}
                  className="flex gap-2 pt-1 pb-1 border-t border-slate-200 dark:border-slate-700"
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    className="flex-1 border rounded px-2 py-1 text-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                    placeholder="écrire un message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        cycleChatHistory(-1);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        cycleChatHistory(1);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
                    disabled={!chatInput.trim()}
                    onPointerDown={(e) => {
                      if (!chatInput.trim()) return;
                      e.preventDefault();
                      submitChat();
                      if (chatInputRef.current) {
                        try {
                          chatInputRef.current.focus({ preventScroll: true });
                        } catch (_) {
                          chatInputRef.current.focus();
                        }
                      }
                    }}
                    onClick={(e) => e.preventDefault()}
                  >
                    Envoyer
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {phase === "playing" && praiseFlash && (
          <div
            key={praiseFlash.id}
            className={[
              "praise-pop font-extrabold tracking-tight",
              praiseFlash.kind === "gobble"
                ? "text-amber-300 drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)] text-5xl"
                : praiseFlash.kind === "gold"
                ? "text-amber-200 drop-shadow-[0_18px_28px_rgba(0,0,0,0.3)] text-4xl"
                : praiseFlash.kind === "purple"
                ? "text-fuchsia-200 drop-shadow-[0_18px_28px_rgba(0,0,0,0.3)] text-4xl"
                : "text-sky-200 drop-shadow-[0_18px_28px_rgba(0,0,0,0.3)] text-4xl",
            ].join(" ")}
          >
            {praiseFlash.text}
          </div>
        )}

        <audio id="error-sound" preload="auto" muted={isMuted}>
          <source
            src="https://www.myinstants.com/media/sounds/icq-uh-oh.mp3"
            type="audio/mpeg"
          />
        </audio>
      </div>
    );
  }

  
  return (
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
                  {tournament.round === tournament.totalRounds ? (
                    <>Manche finale</>
                  ) : (
                    <>
                      Manche {tournament.round}/{tournament.totalRounds}
                    </>
                  )}
                </>
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
            {isLoggedIn && (
              <button
                onClick={goBackToLobby}
                className="px-2 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold rounded-lg border bg-white hover:bg-gray-100 flex items-center justify-center"
              >
                Changer de salon
              </button>
            )}
            <button
              onClick={() => setIsMuted((v) => !v)}
              className="px-2 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold rounded-lg border bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              >
              {isMuted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <line x1="14" y1="9" x2="20" y2="15" />
                  <line x1="20" y1="9" x2="14" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )}
              <span className="sr-only">{isMuted ? "Son coupé" : "Son actif"}</span>
            </button>
            <button
              onClick={() => setDarkMode((v) => !v)}
              className="px-2 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold rounded-lg border bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              >
              {darkMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span className="sr-only">{darkMode ? "Mode clair" : "Mode sombre"}</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="px-2 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-semibold rounded-lg border bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center justify-center"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isFullscreen ? (
                  <>
                    <path d="M9 9H5V5" />
                    <path d="M3 10L10 3" />
                    <path d="M15 15h4v4" />
                    <path d="m14 21 7-7" />
                  </>
                ) : (
                  <>
                    <path d="M9 3H5a2 2 0 0 0-2 2v4" />
                    <path d="M3 3l6 6" />
                    <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
                    <path d="m21 21-6-6" />
                  </>
                )}
              </svg>
              <span className="sr-only">{isFullscreen ? "Quitter plein écran" : "Plein écran"}</span>
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
          <div className="text-[11px] font-extrabold tracking-widest text-slate-600 dark:text-slate-300">
            {specialRound?.type === "target_long"
              ? "TROUVE LE PLUS LONG MOT"
              : specialRound?.type === "target_score"
              ? "TROUVE LE MOT EN OR"
              : "MANCHE SPECIALE"}
          </div>
          <div className="mt-3 text-center font-black tracking-widest text-xl sm:text-2xl tabular-nums">
            {specialHint?.pattern ? (
              specialHint.pattern
            ) : (
              <span className="text-[13px] sm:text-sm tracking-normal opacity-80">
                MOT MYSTÈRE
              </span>
            )}
          </div>
          {specialHint?.pattern && specialHint?.length ? (
            <div className="mt-1 text-[11px] font-semibold opacity-70 text-center">
              {specialHint.length} lettres
            </div>
          ) : null}
          <div className="mt-2 text-[11px] font-semibold opacity-80 text-center">
            {specialHint?.pattern ? "Indice mis a jour..." : "Indice dans 15 secondes..."}
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
          renderNickSuffix={renderMedals}
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
            onClick={() => setResultsRankingMode("round")}
            className={`px-3 py-1 transition ${
              resultsRankingMode === "round" ? "bg-blue-600 text-white" : "bg-white text-gray-600"
            }`}
          >
            Manche
          </button>
          <button
            type="button"
            onClick={() => setResultsRankingMode("total")}
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
          showWheel={false}
          showBadge={!isMobileLayout}
          flatStyle={isMobileLayout}
          highlightedPlayers={highlightPlayers}
          renderNickSuffix={renderMedals}
          renderAfterRank={resultsRankingMode === "total" ? renderRankDelta : null}
        />
      </div>

    </div>
  )}

          {phase !== "playing" && finalRanking.length === 0 && (
            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="text-sm font-semibold">Joueurs connectés</div>
              <div className="flex flex-wrap gap-2 flex-1 min-h-0 overflow-auto content-start items-start">
                {(players.length ? players : [{ nick: "En attente..." }]).map((p) => (
                  <span
                    key={p.nick}
                    className={`px-3 py-1 rounded-full text-xs border ${p.nick === selfNick
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : "bg-gray-50 border-gray-200 text-gray-700"}
                    }`}
                  >
                    {p.nick}
                    {renderMedals(p.nick)}
                  </span>
                ))}
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

            {phase === "results" && endStats && !isMobileLayout && (
              <div
                className={`absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-sm ${
                  darkMode ? "bg-[#0b1020]/85" : "bg-white/80"
                }`}
              >
                {renderEndStatsCard("w-full max-w-sm bg-transparent", false)}
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
                         onTouchMove={handleTouchMove}
            >



              {board.map((cell, i) => {
                const { letter, bonus } = cell;
                const isUsed = usedSet.has(i);
                const letterPts = tileScore(cell);
                const bonusClass = bonus
                  ? BONUS_CLASSES[bonus]
                  : "bg-orange-200 border-orange-500 border-2";
                const highlightClass = isUsed ? "tile-used" : "";

                return (
                  <button
  key={i}
  ref={(el) => (tileRefs.current[i] = el)}
  onMouseDown={() => handleMouseDown(i)}
  onMouseEnter={(e) => handleMouseEnter(i, e)}
  onTouchStart={(e) => handleTouchStart(e, i)}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
  onTouchCancel={handleTouchEnd}
  type="button"
  className={[
    // plus de tailles figées en px ici
    "relative rounded-lg flex items-center justify-center font-extrabold select-none focus:outline-none focus:ring-0",
    bonusClass,
    highlightClass,
  ]
    .filter(Boolean)
    .join(" ")}
  style={{
    // sur ce layout mobile, chaque tuile prend 100% de sa cellule de grille
    width: "100%",
    aspectRatio: "1 / 1",
    fontSize: isMobileLayout ? "clamp(18px, 7vw, 30px)" : `${tileFontPx}px`,
  }}
>
  <span className="tile-letter">
    {letter}
  </span>
  {letterPts > 0 ? <span className="tile-points">{letterPts}</span> : null}
  {bonus && (
    <span
      className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${
        bonus === "M3"
          ? "bg-red-600 text-white"
          : bonus === "M2"
          ? "bg-blue-700 text-white"
          : "bg-amber-600 text-white"
      }`}
    >
      {bonus}
    </span>
  )}
</button>

                );
              })}
            </div>
          </div>

          <div
            className={`${gameBlockClasses} relative overflow-hidden`}
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
              className={`w-full text-center font-bold text-lg flex items-center justify-center ${shake ? "shake" : ""}`}
              style={{ minHeight: `${previewBarMinHeight}px` }}
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
    <div className="flex justify-center items-center gap-1">
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
  ) : (
    <span className="text-gray-700">
      {(currentDisplay || "Prêt à jouer").toUpperCase()}
    </span>
  )}


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
                {specialRound.label} {" "}
                {specialRound.type === "speed"
                  ? `mots fixes  ${specialRound.fixedWordScore} pts`
                 : specialRound.type === "monstrous"
                  ? "grille monstrueuse en vue"
                  : "objectif : 1 seul mot"}
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
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div>
                    <h2 className="text-lg font-bold">Mots</h2>
                  <div className="text-xs text-gray-500">
                    {showAllWords
                      ? `Tous (${allWords.length})`
                      : `Trouvés (${acceptedRef.current.length})`}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="inline-flex rounded-full border border-gray-300 overflow-hidden">
                    <button
                      onClick={() => {
                        captureListPositions(displayList);
                        setShowAllWords(false);
                      }}
                      className={`px-3 py-1 transition ${
                        !showAllWords
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600"
                      }`}
                    >
                      Trouvés
                    </button>
                    <button
                      onClick={() => {
                        captureListPositions(displayList);
                        setShowAllWords(true);
                      }}
                      className={`px-3 py-1 transition ${
                        showAllWords
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600"
                      }`}
                    >
                      Tous
                    </button>
                  </div>
                </div>
              </div>

              {showAllWords && allWords.length === 0 ? (
                <div className="text-sm text-gray-500 shrink-0">
                  Aucun mot (solveur non lanc?)
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ maxHeight: WORDS_SCROLL_MAX_HEIGHT }}>
                  <ul className="relative flex flex-col text-sm">
                    {displayList.map((entry) => {
                      const selected = analysis?.word === entry.word;
                      const isFound = entry.isFound;
                      const bestPts = entry.bestPts;
                      const userPts = entry.userPts;
                      const showOpt = isFound && typeof bestPts === "number" && typeof userPts === "number" && bestPts !== userPts;
                      const visible = showAllWords || isFound;
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
                            color: !isFound && darkMode ? DARK_WORD_INACTIVE : undefined,
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {isFound ? (
                              <span style={foundDotStyle} aria-hidden="true" />
                            ) : (
                              <span
                                style={{ ...foundDotStyle, opacity: 0 }}
                                aria-hidden="true"
                              />
                            )}
                            <span className={isFound ? "font-semibold" : "text-gray-600"}>
                              {entry.word}
                            </span>
                          </span>
                          <span className="text-xs text-gray-600 flex items-center gap-2">
                            {typeof userPts === "number" && isFound && (
                              <span className="font-semibold">+{userPts} pts</span>
                            )}
                            {!isFound && typeof bestPts === "number" && (
                              <span className="text-gray-500">({bestPts} pts)</span>
                            )}
                            {showOpt && (
                              <span className="text-[0.65rem] text-orange-700">
                                opt: {bestPts} pts
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
                   <h2 className="font-bold mb-2 text-center">Chat</h2>

          <div className="chat-messages flex-1 border rounded px-2 py-1 bg-white text-xs space-y-1 flex flex-col justify-end overflow-hidden">
            {visibleMessages.map((msg, idx) => {
              // idx = 0 (en haut) -> plus ancien, idx = dernier -> plus r?cent
              const count = visibleMessages.length;
              const rankFromBottom = count - 1 - idx; // 0 = tout en bas (le plus r?cent)
              let opacity = 1;

              if (rankFromBottom >= FULL_VISIBLE_LINES_FROM_BOTTOM) {
                const extra =
                  rankFromBottom - (FULL_VISIBLE_LINES_FROM_BOTTOM - 1);
                const maxExtra =
                  MAX_CHAT_LINES - FULL_VISIBLE_LINES_FROM_BOTTOM;
                const t = Math.min(extra / maxExtra, 1);
                opacity = 1 - t * (1 - MIN_CHAT_OPACITY);
              }

              const author = (msg.author || msg.nick || "Anonyme").trim();
              const isYou = author === nickname.trim();
              const isSystem = ["systeme", "system", "système"].includes(
                author.toLowerCase()
              );
              const isLast = msg.id === lastMessageId;

              return (
                <div
                  key={msg.id}
                  className={`w-full transition-opacity duration-300 ${
                    isLast ? "slide-fade-in" : ""
                  }`}
                  style={{ opacity }}
                >
                  {isSystem ? (
                    <div className="w-full px-1 py-0.5 text-[0.65rem] italic text-orange-700">
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      className={[
                        "w-full px-1 py-0.5 text-[0.7rem]",
                        isYou ? "bg-blue-50" : "bg-white",
                      ].join(" ")}
                    >
                      <span className="font-semibold mr-1 text-black">
                        {author} :
                      </span>
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
                className="px-2 py-1 text-[0.7rem] rounded-full border bg-gray-100 hover:bg-gray-200"
              >
                {txt}
              </button>
            ))}
          </div>

          <form onSubmit={submitChat} className="mt-3 flex gap-2">
            <input
              ref={chatInputRef}
              type="text"
              className="flex-1 border rounded px-2 py-1 text-xs"
              placeholder="écrire un message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  cycleChatHistory(-1);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  cycleChatHistory(1);
                }
              }}
            />
            <button
              type="submit"
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={!chatInput.trim()}
            >
              Envoyer
            </button>
          </form>
        </div>
      </div>

      {phase === "playing" && praiseFlash && (
        <div
          key={praiseFlash.id}
          className={[
            "praise-pop font-extrabold tracking-tight",
            praiseFlash.kind === "gobble"
              ? "text-amber-300 drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)] text-6xl"
              : praiseFlash.kind === "gold"
              ? "text-amber-200 drop-shadow-[0_18px_28px_rgba(0,0,0,0.3)] text-5xl"
              : praiseFlash.kind === "purple"
              ? "text-fuchsia-200 drop-shadow-[0_18px_28px_rgba(0,0,0,0.3)] text-5xl"
              : "text-sky-200 drop-shadow-[0_18px_28px_rgba(0,0,0,0.3)] text-5xl",
          ].join(" ")}
        >
          {praiseFlash.text}
        </div>
      )}

      <audio id="error-sound" preload="auto" muted={isMuted}>
        <source
          src="https://www.myinstants.com/media/sounds/icq-uh-oh.mp3"
          type="audio/mpeg"
        />
      </audio>
    </div>
  );
}





