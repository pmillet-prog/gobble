// Fichier UTF-8 : conserver les accents, emojis et règles de normalisation (œ, etc.). Ne pas convertir d'encodage.
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
} from "./components/gameLogic";
import { generateGrid } from "./components/gridGeneration";


const ROOM_OPTIONS = {
  "room-4x4": { label: "Grille 4x4", gridSize: 4, duration: 120, breakSeconds: 45 },
  "room-5x5": { label: "Grille 5x5", gridSize: 5, duration: 120, breakSeconds: 45 },
};

const DEFAULT_DURATION = 120;
const COUNTDOWN = 0;
// Hauteur max de la liste des mots en fin de partie : on remplit davantage l'espace sans étirer toute la colonne
const WORDS_SCROLL_MAX_HEIGHT = "clamp(320px, calc(100vh - 280px), 720px)";
// Hauteur cible du bloc principal : clamp sur la fenêtre pour éviter les colonnes infinies en zoom/dézoom
const MAIN_GRID_HEIGHT = "clamp(520px, 82vh, 880px)";
const COLUMN_HEIGHT_STYLE = {
  height: MAIN_GRID_HEIGHT,
  maxHeight: MAIN_GRID_HEIGHT,
  minHeight: "520px",
};
const GRID_COL_TEMPLATE = "1.05fr 1.6fr 0.85fr 1.05fr";
const MIN_GRID_WIDTH = 260;
const MAX_GRID_WIDTH = 980;
const GRID_PADDING_PX = 32; // p-4 (16px de chaque côté)
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

const BONUS_CLASSES = {
  L2: "bg-[rgba(163,196,243,0.85)] border-[rgba(99,147,230,0.9)] border-2", // bleu clair plus vif
  L3: "bg-[rgba(51,93,227,0.8)] border-[rgba(30,64,175,0.95)] text-white border-2", // bleu profond
  W2: "bg-[rgba(255,191,180,0.9)] border-[rgba(248,113,113,0.95)] border-2", // corail vif
  W3: "bg-[rgba(239,68,68,0.85)] border-[rgba(185,28,28,0.95)] text-white border-2", // rouge intense
};


// Petite CSS pour le slide d'apparition
const slideStyles = `
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
  transform: translateY(-1px) scale(1.03);
  box-shadow: none;
  outline: 4px solid rgba(37, 99, 235, 0.9);
  outline-offset: -2px;
  animation: softPulse 0.6s ease-out;
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

body.theme-dark .tile-btn[data-bonus="W2"] {
  background-color: rgba(255, 183, 197, 0.34) !important;
  border-color: rgba(255, 183, 197, 0.94) !important;
  color: #fff5f7 !important;
}

body.theme-dark .tile-btn[data-bonus="W3"] {
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
  const prevPositionsRef = useRef(new Map());
  const [bigScoreFlash, setBigScoreFlash] = useState(null);
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
  const [players, setPlayers] = useState([]);
  const [provisionalRanking, setProvisionalRanking] = useState([]);
  const [finalResults, setFinalResults] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [serverStatus, setServerStatus] = useState("waiting");
  const [announcements, setAnnouncements] = useState([]);
  const [roundStats, setRoundStats] = useState(null);
  const [specialRound, setSpecialRound] = useState(null);
  const [nextStartAt, setNextStartAt] = useState(null);
  const [breakCountdown, setBreakCountdown] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });
  const [isChatOpenMobile, setIsChatOpenMobile] = useState(false);
  const [roomStats, setRoomStats] = useState({});
  const [medals, setMedals] = useState(() => {
    try {
      const raw = localStorage.getItem("boggle_medals");
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  });
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
  const wordHistoryRef = useRef([]);
  const wordHistoryIndexRef = useRef(-1);
  const chatHistoryRef = useRef([]);
  const chatHistoryIndexRef = useRef(-1);
  const solutionsRef = useRef(new Map());
  const chatLastSentRef = useRef(0);
  const toastTimerRef = useRef(null);
  const prevPlayersRef = useRef(new Set());
  const testBotsRef = useRef(false);
  const liveBotsRef = useRef(new Map());
  const botTimersRef = useRef(new Map());
  const bestGridMaxRef = useRef(0);
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
  }, [darkMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      isTouchDeviceRef.current =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }
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
  if (!isMobileLayout) return;

  // Tant que le mode 5x5 n'est PAS débloqué, on force le 4x4
  if (!bigGridUnlocked && roomId !== "room-4x4") {
    setRoomId("room-4x4");
  }
}, [isMobileLayout, roomId, bigGridUnlocked]);

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
        setInstallMessage("Ajouté à l'écran d'accueil");
      } else {
        setInstallMessage("Ajout annulé");
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

    // Petit "bip" progressif à chaque tuile ajoutée
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
    const semitones = [0, 0, 4, 7, 4, 7];

    // Durée et tempo de la petite phrase
    const noteDur = 0.14;      // durée de chaque note
    const gap = 0.02;          // petit espace entre les notes
    const totalDur = semitones.length * (noteDur + gap) + 0.1;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.4, now + 0.03);
    master.gain.linearRampToValueAtTime(0.0, now + totalDur);
    master.connect(ctx.destination);

    semitones.forEach((semi, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = baseFreq * Math.pow(2, semi / 12);
      const t0 = now + idx * (noteDur + gap);

      osc.type = idx === 0 || idx === 1 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t0);

      // Attack/decay par note
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + noteDur);

      osc.connect(gain);
      gain.connect(master);

      try {
        osc.start(t0);
        osc.stop(t0 + noteDur + 0.05);
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
      master.connect(ctx.destination);

      band.intervals.forEach((semi, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const freq = rootFreq * Math.pow(2, semi / 12);
        osc.frequency.setValueAtTime(freq, now);
        osc.type = idx % 2 === 0 ? "sine" : "triangle";

        // légère dérive pour adoucir
        osc.detune.setValueAtTime(idx * 4, now);

        // enveloppe locale
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + attack * 0.6);
        gain.gain.linearRampToValueAtTime(0.7, now + attack + decay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + totalDur);

        osc.connect(gain);
        gain.connect(master);

        try {
          osc.start(now + idx * 0.01); // très léger décalage pour l'effet arpège
          osc.stop(now + totalDur);
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
    const maxPossible = bestGridMaxRef.current || 0;
    if (pts < maxPossible || maxPossible === 0) return;
    if (bestWordAnnounceRef.current === maxPossible) return;
    bestWordAnnounceRef.current = maxPossible;
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
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const radius = Math.min(rect.width, rect.height) * 0.38; // zone circulaire réduite
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
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

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
      endsAt,
      gridSize: payloadSize,
      special = null,
      gridQuality = null,
      roundNumber = null,
      nextSpecial = null,
    }) {
      if (!grid || !Array.isArray(grid)) return;
      if (incomingRoomId) {
        setCurrentRoomId(incomingRoomId);
        setRoomId(incomingRoomId);
      }
      setFinalResults([]);
      setProvisionalRanking([]);
      setAnnouncements([]);
      setNextStartAt(null);
      startGameFromServer(
        grid,
        incomingRoundId,
        endsAt,
        incomingRoomId,
        payloadSize,
        special,
        gridQuality,
        nextSpecial || null
      );
    }

    function onRoundEnded({ roomId: endedRoomId, roundId: endedId, results = [] }) {
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
      setRoundId(endedId || null);

      if (Array.isArray(results)) {
        const selfScore = results.find((r) => r.nick === nickname.trim())?.score;
        if (typeof selfScore === "number") {
          setScore(selfScore);
        }
      }
    }

    function onBreakStarted({ roomId: incomingRoomId, nextStartAt: nextTs }) {
      if (incomingRoomId && currentRoomId && incomingRoomId !== currentRoomId) return;
      setNextStartAt(nextTs || null);
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
    }

    function onAnnouncement(data) {
      maybePlayAnnouncementSound(data);
      setAnnouncements((prev) => [...prev, data]);
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
      try {
        localStorage.removeItem("boggle_medals");
      } catch (_) {}
      const fresh = generateClientId();
      setClientId(fresh);
      try {
        localStorage.setItem("boggle_client_id", fresh);
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
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
    };
  }, [roundId, nickname, currentRoomId, roomId]);


   useEffect(() => {
    let id = null;

    if (phase === "countdown") {
      setTick(COUNTDOWN);
      id = setInterval(() => {
        setTick((t) => {
          if (t <= 1) {
            clearInterval(id);
            startGame();
          }
          return t - 1;
        });
      }, 1000);
    }

    if (phase === "playing") {
      // Si le serveur fournit une heure de fin, on l'utilise comme source de vérité
      if (serverEndsAt) {
        id = setInterval(() => {
          setTick(() => {
            const now = Date.now();
            const remaining = Math.max(
              0,
              Math.round((serverEndsAt - now) / 1000)
            );

            if (remaining <= 0) {
              clearInterval(id);

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
                console.log("Résultats trouvés :", all);
                setAllWords(all);
              }

              setServerStatus("break");
              setPhase("results");
            }

            return remaining;
          });
        }, 1000);
      } else {
        // Fallback solo local (comportement d'origine)
        const fallbackDuration =
          ROOM_OPTIONS[currentRoomId || roomId]?.duration ?? DEFAULT_DURATION;
        setTick(fallbackDuration);
        id = setInterval(() => {
          setTick((t) => {
            if (t <= 1) {
              clearInterval(id);

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
                console.log("Résultats trouvés :", all);
                setAllWords(all);
              }

              setServerStatus("break");
              setPhase("results");
            }
            return t - 1;
          });
        }, 1000);
      }
    }

    return () => {
      if (id) clearInterval(id);
    };
  }, [phase, board, dictionary, serverEndsAt, roomId, currentRoomId]);

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
  useEffect(() => {
    if (!finalResults || finalResults.length === 0) return;
    const sorted = [...finalResults].sort((a, b) => b.score - a.score);
    const medalsToGive = ["gold", "silver", "bronze"];
    const updates = {};
    medalsToGive.forEach((medal, idx) => {
      const entry = sorted[idx];
      if (!entry) return;
      updates[entry.nick] = updates[entry.nick] || { gold: 0, silver: 0, bronze: 0 };
      updates[entry.nick][medal] = 1;
    });

    setMedals((prev) => {
      const next = { ...prev };
      for (const [nick, counts] of Object.entries(updates)) {
        const current = next[nick] || { gold: 0, silver: 0, bronze: 0 };
        next[nick] = {
          gold: Math.min(9999, current.gold + (counts.gold || 0)),
          silver: Math.min(9999, current.silver + (counts.silver || 0)),
          bronze: Math.min(9999, current.bronze + (counts.bronze || 0)),
        };
      }
      try {
        localStorage.setItem("boggle_medals", JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }, [finalResults]);

  // Countdown entre les manches
  useEffect(() => {
    if (!nextStartAt) {
      setBreakCountdown(null);
      return;
    }
    const update = () =>
      setBreakCountdown(Math.max(0, Math.round((nextStartAt - Date.now()) / 1000)));
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
      attemptLogin();
    } else {
      socket.once("connect", () => {
        socket.off("connect_error", onConnectError);
        attemptLogin();
      });
      socket.connect();
    }
  }

  function startGameFromServer(
    serverGrid,
    newRoundId,
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
    setAccepted([]);
    acceptedScoresRef.current = new Map();
    acceptedRef.current = [];
    setSpecialRound(specialInfo && specialInfo.isSpecial ? specialInfo : null);
    if (specialInfo?.isSpecial) {
      setAnnouncements((prev) => [
        {
          id: Date.now() + Math.random(),
          ts: Date.now(),
          type: "special_start",
          text:
            specialInfo.type === "speed"
              ? `MANCHE SPÉCIALE : ${specialInfo.label} - tous les mots valent ${specialInfo.fixedWordScore} pts`
              : `MANCHE SPÉCIALE : ${specialInfo.label} - gros potentiel de points et de mots longs`,
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
    setScore(0);
    setLastWords([]);
    setStatusMessage("");
    const precomputed =
      dictionary && dictionary.size > 0 ? buildAllWordsLocal(serverGrid) : [];
    setAllWords(precomputed);
    bestWordAnnounceRef.current = -1;
    setFinalResults([]);
    setProvisionalRanking([]);
    liveBotsRef.current.clear();
    botTimersRef.current.forEach((id) => clearTimeout(id));
    botTimersRef.current.clear();
    setLiveBots([]);
    const initialTick = endsAt
      ? Math.max(0, Math.round((endsAt - Date.now()) / 1000))
      : (ROOM_OPTIONS[sourceRoomId || currentRoomId || roomId]?.duration ??
        DEFAULT_DURATION);
    setTick(initialTick);
    setRoundId(newRoundId || null);
    setServerEndsAt(endsAt || null);
    setServerStatus("running");
    setConnectionError("");
    setPhase("playing");
    // plus de bots auto
  }

  function buildAllWordsLocal(sourceBoard = board) {
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
    bestGridMaxRef.current = maxPts;
    return all;
  }

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
    setAccepted([]);
    acceptedScoresRef.current = new Map();
    acceptedRef.current = [];
    setSpecialRound(null);
    setRoundStats(null);
    setScore(0);
    setLastWords([]);
    setStatusMessage("");
    const precomputed =
      dictionary && dictionary.size > 0 ? buildAllWordsLocal(base) : [];
    setAllWords(precomputed);
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
        clearSelection();
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

  function playAlreadyPlayedSound() {
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
      const notes = [180, 120];
      const total = notes.length;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + idx * 0.12;
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        try {
          osc.start(t0);
          osc.stop(t0 + 0.2);
        } catch (_) {}
      });
    };
    ctx.resume().then(start).catch(start);
  }

    // =============== VIBRATIONS (optionnelles, mobile) ===============
  function vibrateLight() {
    if (!canVibrateRef.current) return;
    try {
      navigator.vibrate(15);
    } catch (_) {}
  }

  function vibrateSuccess(wordLength) {
  if (!canVibrateRef.current) return;
  const len = Math.max(3, Math.min(wordLength || 0, 12)); 
  // clamp : entre 3 et 12 lettres

  // base courte + rallonge en fonction de la longueur
  const base = 12;               // vibration mini
  const extra = (len - 3) * 6;   // +6ms par lettre au-dessus de 3
  const finalPulse = base + extra; // max ~ base + 9*6 = 66ms

  // petit pattern : tick court + pause + pulse plus long selon la longueur
  const pattern = [10, 25, finalPulse];

  try {
    navigator.vibrate(pattern);
  } catch (_) {}
}


  function vibrateErrorPattern() {
    if (!canVibrateRef.current) return;
    try {
      navigator.vibrate([40, 60, 40]);
    } catch (_) {}
  }

    function error(msg, opts = {}) {
    const type = opts?.type || "generic";
    setStatusMessage(msg);
    setShake(false);
    // restart the animation even if the state was already true
    requestAnimationFrame(() => setShake(true));
    if (type === "already_played") {
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

          const nx = Math.abs(dx) / halfW;
          const ny = Math.abs(dy) / halfH;

          const CORNER_THRESHOLD = 0.7;

          if (nx > CORNER_THRESHOLD && ny > CORNER_THRESHOLD) {
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

  // on ne passe plus lâevent souris, on laisse juste la logique de chemin faire son job
  handleMouseEnter(idx, null);
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
    
    const display = currentTilesRef.current.join("");
    const raw = normalizeWord(display);

    if (!raw || raw.length < 3) return error("Mot trop court");
    if (!dictionary || !dictionary.has(raw)) return error("Absent du dico");
    if (acceptedRef.current.includes(raw)) return error("Déjà  trouvé");

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
            return error("Mot déjà joué (serveur)");
          }
          return error("Erreur serveur");
        }

        const pts = res.wordScore;

        setScore(res.score);
        acceptedScoresRef.current.set(raw, pts);
        pushWordHistory(raw);

        const wordBonuses = summarizeBonuses(path, board);
        setLastWords((prev) => {
          const displayStr = display || raw.toUpperCase();
          const now = Date.now();
          return [...prev, { id: now, ts: now, display: displayStr, pts, bonuses: wordBonuses }];
        });

        const wordStr = (display || raw || "").replace(/\s+/g, "");
const wordLen = wordStr.length || 3;

maybeAnnounceBestWord(nickname.trim() || "Moi", display || raw, pts);
playScoreSound(pts);
vibrateSuccess(wordLen);
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
    setLastWords((prev) => {
      const displayStr = display || raw.toUpperCase();
      const now = Date.now();
      return [...prev, { id: now, ts: now, display: displayStr, pts, bonuses: wordBonuses }];
    });

    const wordStr = (display || raw || "").replace(/\s+/g, "");
const wordLen = wordStr.length || 3;

playScoreSound(pts);
vibrateSuccess(wordLen);
maybeAnnounceBestWord(nickname.trim() || "Moi", display || raw, pts);
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
    Math.pow(2, currentBonuses.W2 || 0) * Math.pow(3, currentBonuses.W3 || 0);
  const showBonuses =
    highlightPath.length > 0 &&
    (currentBonuses.L2 ||
      currentBonuses.L3 ||
      currentBonuses.W2 ||
      currentBonuses.W3);
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

    return (
      <div
        className={`border rounded-xl shadow-xl p-4 text-sm leading-snug space-y-4 ${themeClasses} ${className}`}
      >
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
  const finalRanking = finalResults.length
    ? [...finalResults]
        .map((entry) => ({
          ...entry,
          wordsCount: Array.isArray(entry.words) ? entry.words.length : null,
        }))
        .sort((a, b) => b.score - a.score)
    : [];
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
    const palette = {
      gold: { fill: "#fbbf24", stroke: "#b45309" },
      silver: { fill: "#e5e7eb", stroke: "#6b7280" },
      bronze: { fill: "#f59e0b", stroke: "#92400e" },
    };

    const renderChip = (type, count) => {
      const colors = palette[type];
      if (!colors) return null;
      return (
        <span
          key={type}
          className="inline-flex items-center gap-0.5 text-[0.7rem] font-semibold"
          style={{ color: darkMode ? "#e5e7eb" : "#111827" }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "9px",
              height: "9px",
              borderRadius: "9999px",
              backgroundColor: colors.fill,
              border: `1px solid ${colors.stroke}`,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
            }}
          />
          <span style={{ minWidth: "1.2rem" }}>x{count}</span>
        </span>
      );
    };

    const chips = [];
    if (m.gold) chips.push(renderChip("gold", m.gold));
    if (m.silver) chips.push(renderChip("silver", m.silver));
    if (m.bronze) chips.push(renderChip("bronze", m.bronze));
    return <div className="flex items-center gap-1">{chips}</div>;
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
  const tileGapPx = tileSizePx * gapRatio;
  const computedGridWidth =
    tileSizePx * gridSize + tileGapPx * (gridSize - 1) + GRID_PADDING_PX;
  const fontScale = gridSize >= 5 ? 0.68 : 1; // 5x5 plus petit sans toucher 4x4
  const tileFontPx = Math.max(14, Math.min(32, tileSizePx * 0.48 * fontScale));

        if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-2xl bg-slate-900/70 border border-white/10 rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
  <div
    className="text-3xl font-black tracking-tight cursor-pointer select-none"
    onClick={handleSecretTitleTap}
  >
    GOBBLE
  </div>
  <p className="text-sm text-slate-300">
    Salon multijoueur sans compte...
  </p>
</div>

            <div className="flex flex-col items-start gap-1 text-xs">
              <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">
                {isConnecting ? "Connexion..." : "Serveur en écoute"}
              </span>
              {connectionError && (
                <span className="text-red-300">{connectionError}</span>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 text-sm text-slate-200">
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="font-semibold">Pseudo unique</div>
              <div className="text-slate-300 text-xs">
                Pas de compte, juste un pseudo non utilisé par un autre joueur.
              </div>
            </div>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="font-semibold">Chat en direct</div>
              <div className="text-slate-300 text-xs">
                Messages partagés dès que tu es connecté.
              </div>
            </div>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="font-semibold">Classement live</div>
              <div className="text-slate-300 text-xs">
                Ta position se met à jour, les scores détaillés arrivent en fin de manche.
              </div>
            </div>
          </div>

          <form
            onSubmit={handleLogin}
            className="bg-slate-800/70 border border-white/10 rounded-xl p-5 flex flex-col gap-3"
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
                          : "bg-white/10 border-white/20 text-slate-100 hover:bg-white/20"
                      }`}
                    >
                      <div className="font-semibold leading-tight">
                        {opt?.label || rid}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/15 border border-white/20">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                        <span>{count} joueur{count > 1 ? "s" : ""}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {isMobileLayout && (
                <div className="text-[11px] text-slate-300">
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
            {installPrompt && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="px-4 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold text-white transition"
              >
                Ajouter à l'écran d'accueil
              </button>
            )}
            {installMessage && (
              <div className="text-xs text-emerald-200">{installMessage}</div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ========================================================================
  // *** NOUVELLE MISE EN PAGE MOBILE PENDANT LA MANCHE ***
  // ========================================================================

  // === Mise en page mobile dédiée pendant la manche ===
  // Écran unique : classement + prévisualisation du mot + grille en bas + bouton de chat
  if (isMobileLayout && (phase === "playing" || phase === "results")) {
    const isResults = phase === "results";
    const fullRanking = isResults ? finalRanking || [] : rankingSource || [];
    const mobileAnnouncements = mixedFeed;

    if (isResults) {
      return (
        <div
          className={`flex flex-col ${
            darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
          }`}
          style={{
            minHeight: "100vh",
            height: "100dvh",
            maxHeight: "100dvh",
            overflow: "hidden",
          }}
        >
          <style>{slideStyles}</style>

          <div className="px-3 pt-2 pb-1 border-b border-slate-200/70 dark:border-slate-700/70">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <div className="text-lg font-extrabold tracking-tight leading-none">GOBBLE</div>
                <div className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-tight">
                  {activeRoom?.label || "Salon"} â¢ {gridSize}x{gridSize}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right leading-tight text-xs font-bold">
                  Prochaine manche : {breakCountdown ?? 0}s
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
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                    </svg>
                  ) : (
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
                  )}
                  <span className="sr-only">{darkMode ? "Mode sombre" : "Mode clair"}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-2 px-3 pt-2 pb-3 overflow-hidden">
            <div
              className={`rounded-xl px-3 py-2 flex flex-col gap-2 overflow-hidden flex-1 min-h-0 ${
                darkMode
                  ? "bg-slate-900/90"
                  : "bg-white/90"
              }`}
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
                  <RankingWidgetMobile
                    fullRanking={fullRanking}
                    selfNick={selfNick}
                    darkMode={darkMode}
                    expanded={true}
                    animateRank={false}
                    showWheel={false}
                    flatStyle={true}
                  />
                )}
              </div>
            </div>

            {endStats && (
              <div className="mt-2">
                {renderEndStatsCard("w-full")}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsChatOpenMobile(true)}
            className="fixed bottom-4 right-4 z-30 px-3 py-2 rounded-full shadow-lg text-xs font-semibold bg-blue-600 text-white"
          >
            Chat
          </button>

          {isChatOpenMobile && (
            <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50">
              <div
                className={`w-full max-h-[70vh] rounded-t-2xl border-t ${
                  darkMode
                    ? "bg-slate-900 text-slate-100 border-slate-700"
                    : "bg-white text-slate-900 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                  <div className="font-semibold text-sm">Chat</div>
                  <button
                    type="button"
                    onClick={() => setIsChatOpenMobile(false)}
                    className="text-[11px] px-2 py-1 rounded-full border border-slate-300 dark:border-slate-600"
                  >
                    Fermer
                  </button>
                </div>
                <div className="flex flex-col h-[50vh] px-3 py-2 gap-2">
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 text-xs">
                  {visibleMessages.length === 0 ? (
                    <div className="text-[11px] text-slate-400 text-center mt-4">
                      Aucun message pour l'instant.
                    </div>
                  ) : (
                    [...visibleMessages].reverse().map((msg) => {
                      const author = msg.author || msg.nick || "Anonyme";
                      const isYou = author === selfNick;
                      return (
                        <div
                          key={msg.id}
                          className={`px-2 py-1 rounded-lg ${
                            isYou
                              ? "bg-blue-600 text-white self-end"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 self-start"
                            }`}
                        >
                          <span className="font-semibold mr-1">{author}:</span>
                          <span>{msg.text}</span>
                        </div>
                      );
                    })
                  )}
                  </div>
                  <form onSubmit={submitChat} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-xs"
                      placeholder="écrire un message..."
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
          )}
        </div>
      );
    }

   return (
  <div
    className={`flex flex-col ${
      darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
    }`}
    style={{
      minHeight: "100vh",
      height: "100dvh",
      maxHeight: "100dvh",
      overflow: "hidden",
    }}
  >
   

        <style>{slideStyles}</style>

        {/* En-tête compact : titre, salon, score et boutons rapides */}
        <div className="px-3 pt-2 pb-1 border-b border-slate-200/70 dark:border-slate-700/70">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <div className="text-lg font-extrabold tracking-tight leading-none">GOBBLE</div>
              <div className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-tight">
                {activeRoom?.label || "Salon"} Â· {gridSize}x{gridSize}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right leading-tight text-xs font-bold">
                {phase === "playing"
                  ? `Temps restant : ${tick}s`
                  : `Prochaine manche : ${breakCountdown ?? 0}s`}
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
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                    </svg>
                  ) : (
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
                  )}
                  <span className="sr-only">{darkMode ? "Mode sombre" : "Mode clair"}</span>
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
          <div className="mx-3 mt-2 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-[11px] text-gray-700 dark:text-slate-200">
            <div className="font-bold mb-1 text-xs">Aide rapide</div>
            <ul className="list-disc list-inside space-y-1">
              <li>Saisie clavier ou glisser doigt/souris sur la grille pour former un mot.</li>
              <li>Entrée valide le mot, Backspace efface.</li>
              <li>Tab alterne entre saisie et chat (focus automatique).</li>
              <li>Score = lettres (bonus L2/L3) x multiplicateurs de mot (W2/W3) + bonus de longueur.</li>
            </ul>
          </div>
        )}

                       {/* Contenu principal mobile : classement + aperçu mot + grille */}
<div className="flex-1 flex flex-col gap-2 px-3 pt-2 pb-3 overflow-hidden">
  {/* Classement centré sur le joueur â version bague + fenêtre */}
  <RankingWidgetMobile
  fullRanking={fullRanking}
  selfNick={selfNick}
  darkMode={darkMode}
  expanded={false}
  highlightedPlayers={highlightPlayers}
/>



          

          {/* Aperçu du mot en cours / dernier message de statut */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-2 shadow-sm min-h-[48px] flex items-center justify-center">
  <div className={`w-full text-center font-bold text-base flex items-center justify-center ${shake ? "shake" : ""}`}>
              {phase !== "playing" ? (
                <span className="text-slate-700 dark:text-white">
                  Manche suivante : {breakCountdown ?? 0}s
                </span>
              ) : liveWord ? (
                <div className="flex justify-center items-center gap-1">
                  {liveWord.split("").map((ch, idx) => {
                    const angle = ((idx * 17 + liveWord.length * 13) % 11) - 5;
                    return (
                      <div
                        key={idx}
                        className="preview-tile"
                        style={{ transform: `rotate(${angle}deg)` }}
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

                    {/* Grille sous l'aperçu du mot, poussée vers le bas mais remontée visuellement */}
<div className="flex-1 flex justify-center">
  <div
    ref={gridRef}
    className={`mt-auto grid p-4 bg-white border rounded-xl ${
      isMobileLayout ? "w-full" : "w-fit mx-auto"
    }`}
    style={{
      gridTemplateColumns: isMobileLayout
        ? `repeat(${gridSize}, minmax(0, 1fr))`
        : `repeat(${gridSize}, ${tileSizePx}px)`,
    gap: isMobileLayout ? "10px" : `${tileGapPx}px`,
    touchAction: "none",
    width: isMobileLayout ? "100%" : computedGridWidth || undefined,
    minWidth: isMobileLayout ? undefined : computedGridWidth || undefined,
    maxWidth: isMobileLayout ? "100%" : computedGridWidth || undefined,
    ...lightGridSurfaceStyle,
  }}
  onMouseUp={handleMouseUp}
  onTouchMove={handleTouchMove}

            >

              {board.map((cell, i) => {
                const { letter, bonus } = cell;
                const isUsed = usedSet.has(i);
                const bonusClass = bonus
                  ? BONUS_CLASSES[bonus]
                  : "bg-orange-200 border-orange-500 border-2";
                const highlightClass = isUsed
                  ? "ring-[5px] ring-blue-500 ring-offset-2 ring-offset-white"
                  : "";

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
    "relative rounded-lg flex items-center justify-center font-extrabold select-none",
    // mobile : tuile = 100% de la cellule, carrée
    // desktop : tailles fixes comme avant
    isMobileLayout
      ? "w-full text-xl"
      : "w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] text-xl",
    bonusClass,
    highlightClass,
  ]
    .filter(Boolean)
    .join(" ")}
  style={isMobileLayout ? { aspectRatio: "1 / 1" } : undefined}
>
  <span className="text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]">
    {letter}
  </span>
  {bonus && (
    <span
      className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${
        bonus === "W3"
          ? "bg-red-600 text-white"
          : bonus === "W2"
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
        </div>

{/* Bandeau d'annonces mobile, sous la grille */}
<div className="mt-2 px-1">
  <LiveFeed items={mobileAnnouncements} darkMode={darkMode} maxHeight="200px" />
</div>

        {/* Bouton de chat flottant + volet de chat */}
        <button
          type="button"
          onClick={() => setIsChatOpenMobile(true)}
          className="fixed bottom-4 right-4 z-30 px-3 py-2 rounded-full shadow-lg text-xs font-semibold bg-blue-600 text-white"
        >
          Chat
        </button>

        {isChatOpenMobile && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50">
            <div
              className={`w-full max-h-[70vh] rounded-t-2xl border-t ${
                darkMode
                  ? "bg-slate-900 text-slate-100 border-slate-700"
                  : "bg-white text-slate-900 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <div className="font-semibold text-sm">Chat</div>
                <button
                  type="button"
                  onClick={() => setIsChatOpenMobile(false)}
                  className="text-[11px] px-2 py-1 rounded-full border border-slate-300 dark:border-slate-600"
                >
                  Fermer
                </button>
              </div>
              <div className="flex flex-col h-[50vh] px-3 py-2 gap-2">
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 text-xs">
                  {visibleMessages.length === 0 ? (
                    <div className="text-[11px] text-slate-400 text-center mt-4">
                      Aucun message pour l'instant.
                    </div>
                  ) : (
                    [...visibleMessages].reverse().map((msg) => {
                      const author = msg.author || msg.nick || "Anonyme";
                      const isYou = author === selfNick;
                      return (
                        <div
                          key={msg.id}
                          className={`px-2 py-1 rounded-lg ${
                            isYou
                              ? "bg-blue-600 text-white self-end"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 self-start"
                          }`}
                        >
                          <span className="font-semibold mr-1">{author}:</span>
                          <span>{msg.text}</span>
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
            <div className="text-[0.7rem] sm:text-xs text-gray-500 leading-none">Beta 1.0</div>
          </div>

          <div className="flex items-center gap-1 text-[11px] sm:text-xs text-gray-700">
            <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">
              {activeRoom?.label || "Salon"} Â· {gridSize}x{gridSize}
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm sm:text-base font-extrabold text-center">
              {phase === "playing"
                ? `Temps restant : ${tick}s`
                : `Prochaine manche : ${breakCountdown ?? 0}s`}
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
            <li>Score = lettres (bonus L2/L3) x multiplicateurs de mot (W2/W3) + bonus de longueur.</li>
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
      />
    </div>
  </div>
)}



  {phase === "results" && finalRanking.length > 0 && (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="text-sm font-semibold">Classement final</div>
      <div className="flex-1 min-h-0">
        <RankingWidgetMobile
          fullRanking={finalRanking}
          selfNick={selfNick}
          darkMode={darkMode}
          expanded={true}
          animateRank={false}
          showWheel={false}
          showBadge={!isMobileLayout}
          flatStyle={isMobileLayout}
          highlightedPlayers={highlightPlayers}
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
            <div
            
              ref={gridRef}
              className={
                isMobileLayout
                  ? "grid bg-white border rounded-xl px-2 py-2 w-full"
                  : "grid p-4 bg-white border rounded-xl w-fit mx-auto"
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
                const bonusClass = bonus
                  ? BONUS_CLASSES[bonus]
                  : "bg-orange-200 border-orange-500 border-2";
                const highlightClass = isUsed
                  ? "ring-[5px] ring-blue-500 ring-offset-2 ring-offset-white"
                  : "";

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
    "relative rounded-lg flex items-center justify-center text-xl font-extrabold select-none",
    bonusClass,
    highlightClass,
  ]
    .filter(Boolean)
    .join(" ")}
  style={{
    // sur ce layout mobile, chaque tuile prend 100% de sa cellule de grille
    width: "100%",
    aspectRatio: "1 / 1",
  }}
>
  <span className="text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]">
    {letter}
  </span>
  {bonus && (
    <span
      className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${
        bonus === "W3"
          ? "bg-red-600 text-white"
          : bonus === "W2"
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
              style={{ minHeight: "56px" }}
            >
                  {phase !== "playing" ? (
    <span className="text-gray-800 dark:text-white">
      Manche suivante : {breakCountdown ?? 0}s
    </span>
  ) : liveWord ? (
    <div className="flex justify-center items-center gap-1">
      {liveWord.split("").map((ch, idx) => {
        // rotation déterministe légère, entre -5Â° et +5Â°
        const angle = ((idx * 17 + liveWord.length * 13) % 11) - 5;
        return (
          <div
            key={idx}
            className="preview-tile"
            style={{ transform: `rotate(${angle}deg)` }}
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
                {specialRound.label} ·{" "}
                {specialRound.type === "speed"
                  ? `mots fixes à ${specialRound.fixedWordScore} pts`
                  : "score monstrueux en vue"}
              </div>
            )}
            <div className="text-center text-sm text-gray-600">
              {roundStats ? (
                <span>
                  {roundStats.words ?? "?"} mots possibles ·{" "}
                  {formatNumber(roundStats.totalPts ?? roundStats.maxPts ?? 0) || "?"} pts
                </span>
              ) : (
                <span>Stats de grille indisponibles</span>
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
              // idx = 0 (en haut) -> plus ancien, idx = dernier -> plus récent
              const count = visibleMessages.length;
              const rankFromBottom = count - 1 - idx; // 0 = tout en bas (le plus récent)
              let opacity = 1;

              if (rankFromBottom >= FULL_VISIBLE_LINES_FROM_BOTTOM) {
                const extra =
                  rankFromBottom - (FULL_VISIBLE_LINES_FROM_BOTTOM - 1);
                const maxExtra =
                  MAX_CHAT_LINES - FULL_VISIBLE_LINES_FROM_BOTTOM;
                const t = Math.min(extra / maxExtra, 1);
                opacity = 1 - t * (1 - MIN_CHAT_OPACITY);
              }

              const isYou = msg.author === nickname.trim();
              const isLast = msg.id === lastMessageId;

              return (
                <div
                  key={msg.id}
                  className={`w-full transition-opacity duration-300 ${
                    isLast ? "slide-fade-in" : ""
                  }`}
                  style={{ opacity }}
                >
                  <div
                    className={[
                      "w-full px-1 py-0.5 text-[0.7rem]",
                      isYou ? "bg-blue-50" : "bg-white",
                    ].join(" ")}
                  >
                    <span className="font-semibold mr-1 text-black">
                      {msg.author} :
                    </span>
                    <span className="text-black">{msg.text}</span>
                  </div>
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

      <audio id="error-sound" preload="auto" muted={isMuted}>
        <source
          src="https://www.myinstants.com/media/sounds/icq-uh-oh.mp3"
          type="audio/mpeg"
        />
      </audio>
    </div>
  );
}

