// Fichier UTF-8 : conserver les accents, emojis et règles de normalisation (??, etc.). Ne pas convertir d'encodage.
// 
import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import socket from "./socket";
import LiveFeed, { buildMixedFeed } from "./components/LiveFeed.jsx";
import RankingWidgetMobile from "./components/RankingWidgetMobile.jsx";
import MobileChatWidget from "./components/MobileChatWidget.jsx";
import MobileGrid from "./components/MobileGrid.jsx";
import MobileHeader from "./components/MobileHeader.jsx";
import MobileWordPreview from "./components/MobileWordPreview.jsx";
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
const TOURNAMENT_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const FINAL_ROUND_RESULTS_SECONDS = 30;
// Hauteur max de la liste des mots en fin de partie : on remplit davantage l'espace sans ?tirer toute la colonne
const WORDS_SCROLL_MAX_HEIGHT = "clamp(320px, calc(100vh - 280px), 720px)";
// Hauteur cible du bloc principal : clamp sur la fenêtre pour éviter les colonnes infinies en zoom/d?zoom
const MAIN_GRID_HEIGHT = "clamp(520px, 82vh, 880px)";
const FULLSCREEN_HEADER_TOP_OFFSET_PX = 20;
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
const DARK_ROW_TEXT = "#e5e7eb";
const DARK_DIVIDER_COLOR = "#1f2937";
const DARK_WORD_INACTIVE = "#e2e8f0";

function getGridSizeForRoom(roomKey) {
  return ROOM_OPTIONS[roomKey]?.gridSize || 4;
}

function getViewportSize() {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  const vv = window.visualViewport;
  const width = Math.round(vv?.width || window.innerWidth || 0);
  const height = Math.round(vv?.height || window.innerHeight || 0);
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
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes chatSheetOut {
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
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

@keyframes praisePop {
  0% { transform: translate(-50%, -50%) scale(0.78); opacity: 0; }
  18% { transform: translate(-50%, -58%) scale(1.06); opacity: 1; }
  70% { transform: translate(-50%, -76%) scale(1.18); opacity: 0.92; }
  100% { transform: translate(-50%, -92%) scale(1.28); opacity: 0; }
}

@keyframes gobbleShine {
  0% { background-position: 0% 50%; filter: drop-shadow(0 8px 18px rgba(120, 53, 15, 0.45)); }
  50% { background-position: 100% 50%; filter: drop-shadow(0 10px 22px rgba(245, 158, 11, 0.5)); }
  100% { background-position: 0% 50%; filter: drop-shadow(0 8px 18px rgba(120, 53, 15, 0.45)); }
}

@keyframes sparkleTwinkle {
  0% { transform: scale(0.6) rotate(0deg); opacity: 0; }
  40% { opacity: 1; }
  100% { transform: scale(1.2) rotate(35deg); opacity: 0; }
}

.praise-pop {
  position: fixed;
  left: 50%;
  top: 44%;
  z-index: 80;
  transform: translate(-50%, -50%);
  animation: praisePop 0.75s ease-out forwards;
  pointer-events: none;
  letter-spacing: -0.02em;
  text-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
  will-change: transform, opacity;
  isolation: isolate;
}
.praise-outline {
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.55),
    1px 0 0 rgba(0, 0, 0, 0.55),
    -1px 0 0 rgba(0, 0, 0, 0.55),
    0 -1px 0 rgba(0, 0, 0, 0.55),
    2px 2px 8px rgba(0, 0, 0, 0.35);
}
.praise-gold {
  background:
    linear-gradient(145deg, #ffe9a8 0%, #f7c969 28%, #e09a2f 62%, #b8741b 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter:
    drop-shadow(0 8px 14px rgba(120, 53, 15, 0.45))
    drop-shadow(0 2px 4px rgba(255, 214, 112, 0.45));
}
.praise-gobble {
  position: relative;
  background:
    linear-gradient(120deg, #fff2b2 0%, #ffd166 30%, #f59e0b 60%, #fff6cc 100%);
  background-size: 220% 220%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: gobbleShine 1.15s ease-in-out infinite;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.55),
    0 10px 26px rgba(0, 0, 0, 0.4);
}
.praise-gobble::before,
.praise-gobble::after {
  content: "";
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 214, 112, 0.2));
  box-shadow: 0 0 10px rgba(255, 214, 112, 0.85);
  opacity: 0;
  animation: sparkleTwinkle 0.9s ease-in-out infinite;
  pointer-events: none;
}
.praise-gobble::before {
  top: -18px;
  right: -14px;
  animation-delay: 0.05s;
}
.praise-gobble::after {
  bottom: -14px;
  left: -10px;
  animation-delay: 0.25s;
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
const CHAT_DRAWER_ANIM_MS = 750;
const QUICK_REPLIES = ["GG !", "Bien joué", "On continue ?", "Belle grille !"];
const SHOW_ALL_LABELS = { found: "Trouvés", all: "Tous les mots" };
const INSTALL_ID_STORAGE_KEY = "gobble_install_id";
const CHAT_RULES_STORAGE_KEY = "gobble_chat_rules_accepted";
const BLOCKED_INSTALL_IDS_STORAGE_KEY = "gobble_blocked_install_ids";
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
  const gobbleVoiceRef = useRef({ audio: null, buffer: null, loading: false, last: 0 });
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
  const mobileRankingRef = useRef(null);
  const mobileHelpRef = useRef(null);
  const safeAreaProbeRef = useRef(null);
  const prevPositionsRef = useRef(new Map());
  const [bigScoreFlash, setBigScoreFlash] = useState(null);
  const [praiseFlash, setPraiseFlash] = useState(null);
  const [confettiBurst, setConfettiBurst] = useState(null); // { id, kind }
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
  const [roomStats, setRoomStats] = useState({});
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
  });
  const [definitionBlink, setDefinitionBlink] = useState(false);
  const [chatVisibleLimit, setChatVisibleLimit] = useState(
    DEFAULT_CHAT_VISIBLE_LINES
  );
  const [chatFullVisibleLines, setChatFullVisibleLines] = useState(
    DEFAULT_CHAT_FULL_VISIBLE_LINES
  );

  const currentTilesRef = useRef([]);
  const acceptedRef = useRef([]);
  const acceptedScoresRef = useRef(new Map());
  const chatInputRef = useRef(null);
  const chatBodyLockHeightRef = useRef(0);
  const chatDesktopListRef = useRef(null);
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
  const confettiBurstTimerRef = useRef(null);
  const lastTargetConfettiRef = useRef(null);
  const targetDefinitionRequestRef = useRef(0);
  const chatScrollLockRef = useRef(0);
  const definitionRequestIdRef = useRef(0);
  const definitionBlinkTimerRef = useRef(null);
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
  const lastCountdownTickRef = useRef(0);
  const countdownTickToggleRef = useRef(false);
  const tournamentCelebrationPlayedRef = useRef(false);
  const [liveBots, setLiveBots] = useState([]);

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

  function ensureGobbleBuffer(ctx) {
    if (!ctx || gobbleVoiceRef.current.buffer || gobbleVoiceRef.current.loading) {
      return;
    }
    gobbleVoiceRef.current.loading = true;
    fetch("/gobble.mp3")
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        const onSuccess = (decoded) => {
          gobbleVoiceRef.current.buffer = decoded;
          gobbleVoiceRef.current.loading = false;
        };
        const onError = () => {
          gobbleVoiceRef.current.loading = false;
        };
        try {
          const decodeResult = ctx.decodeAudioData(buf, onSuccess, onError);
          if (decodeResult && typeof decodeResult.then === "function") {
            decodeResult.then(onSuccess).catch(onError);
          }
        } catch (_) {
          onError();
        }
      })
      .catch(() => {
        gobbleVoiceRef.current.loading = false;
      });
  }

  function primeGobbleAudio() {
    if (gobbleVoiceRef.current.audio) return;
    const audio = new Audio("/gobble.mp3");
    audio.preload = "auto";
    gobbleVoiceRef.current.audio = audio;

    const previousVolume = audio.volume;
    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = previousVolume;
        })
        .catch(() => {
          audio.volume = previousVolume;
        });
    } else {
      audio.volume = previousVolume;
    }
  }
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
      primeGobbleAudio();
      ensureGobbleBuffer(audioCtxRef.current);
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

    const delay = Math.max(0, CHAT_DRAWER_ANIM_MS - 60);
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
    const updateInset = () => {
      const heightCandidates = [
        vv?.height,
        window.innerHeight,
        document.documentElement?.clientHeight,
      ].filter((v) => Number.isFinite(v) && v > 0);
      if (!heightCandidates.length) return;
      const minHeight = Math.min(...heightCandidates);
      const maxHeight = Math.max(...heightCandidates);
      const candidateDelta = Math.max(0, Math.round(maxHeight - minHeight));
      const keyboardLikely = candidateDelta > KEYBOARD_INSET_THRESHOLD_PX;
      const previousBaseline = chatBodyLockHeightRef.current || 0;
      let nextBaseline = previousBaseline;
      if (!keyboardLikely) {
        nextBaseline = maxHeight;
      } else if (maxHeight > previousBaseline || previousBaseline === 0) {
        nextBaseline = maxHeight;
      }
      const rawInset = Math.max(0, Math.round(nextBaseline - minHeight));
      const nextInset = keyboardLikely ? rawInset : 0;
      if (nextBaseline > 0 && nextBaseline !== chatBodyLockHeightRef.current) {
        chatBodyLockHeightRef.current = nextBaseline;
      }
      if (nextBaseline > 0) {
        setChatViewportHeight((prev) =>
          prev === nextBaseline ? prev : nextBaseline
        );
      }
      setChatKeyboardInsetPx((prev) => (prev === nextInset ? prev : nextInset));
    };
    updateInset();
    vv?.addEventListener("resize", updateInset);
    vv?.addEventListener("scroll", updateInset);
    window.addEventListener("resize", updateInset);
    document.addEventListener("fullscreenchange", updateInset);
    return () => {
      vv?.removeEventListener("resize", updateInset);
      vv?.removeEventListener("scroll", updateInset);
      window.removeEventListener("resize", updateInset);
      document.removeEventListener("fullscreenchange", updateInset);
    };
  }, [isChatOpenMobile]);

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
    if (phase === "lobby") closeDefinition();
  }, [definitionModal.open, phase, roundId]);

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
      if (isChatOpenMobileRef.current) return;
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

      const headerHeightPx = Math.round(mobileHeaderRef.current?.offsetHeight || 0);
      const headerOffsetPx =
        headerHeightPx +
        (isFullscreen ? FULLSCREEN_HEADER_TOP_OFFSET_PX : 0);
      setMobileHeaderOffsetPx((prev) =>
        prev === headerOffsetPx ? prev : headerOffsetPx
      );
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
      if (safeAreaProbeRef.current && safeAreaProbeRef.current.parentNode) {
        safeAreaProbeRef.current.parentNode.removeChild(safeAreaProbeRef.current);
        safeAreaProbeRef.current = null;
      }
    };
  }, [isMobileLayout, phase, gridSize, showHelp, isFullscreen]);

  useEffect(() => {
    if (!isMobileLayout) return;
    if (typeof ResizeObserver === "undefined") return;
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return;

    const updateHeight = () => {
      const nextOffset =
        Math.round(headerEl.offsetHeight || 0) +
        (isFullscreen ? FULLSCREEN_HEADER_TOP_OFFSET_PX : 0);
      setMobileHeaderOffsetPx((prev) =>
        prev === nextOffset ? prev : nextOffset
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(headerEl);
    return () => observer.disconnect();
  }, [isMobileLayout, isFullscreen]);

  useLayoutEffect(() => {
    if (!isMobileLayout) return;
    const headerEl = mobileHeaderRef.current;
    if (!headerEl) return;
    const nextOffset =
      Math.round(headerEl.offsetHeight || 0) +
      (isFullscreen ? FULLSCREEN_HEADER_TOP_OFFSET_PX : 0);
    setMobileHeaderOffsetPx((prev) => (prev === nextOffset ? prev : nextOffset));
  }, [isMobileLayout, isFullscreen]);

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
      const vv = window.visualViewport;
      const useVisualViewport = !(isChatOpenMobile || isChatClosing);
      const lockedChatHeight = chatBodyLockHeightRef.current || null;
      const candidates = useVisualViewport
        ? [vv?.height, window.innerHeight, document.documentElement?.clientHeight]
        : lockedChatHeight
        ? [lockedChatHeight]
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

  // Son "GOBBLE" (MP3 placé dans /public/GOBBLE.mp3)
  function playGobbleVoice() {
    if (isMuted) return;
    const nowTs = Date.now();
    if (nowTs - gobbleVoiceRef.current.last < 1200) return; // throttle
    gobbleVoiceRef.current.last = nowTs;
    const ctx = audioCtxRef.current;
    const buffer = gobbleVoiceRef.current.buffer;
    if (ctx && ctx.state === "running" && buffer) {
      try {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        return;
      } catch (_) {}
    }
    if (ctx && ctx.state === "running" && !buffer) {
      ensureGobbleBuffer(ctx);
    }

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

  // "Tic tac" avant le début de manche (compte à rebours)
  function playCountdownTickSound() {
    if (isMuted) return;
    const nowTs = Date.now();
    if (nowTs - lastCountdownTickRef.current < 850) return;
    lastCountdownTickRef.current = nowTs;
    countdownTickToggleRef.current = !countdownTickToggleRef.current;
    const baseFreq = 520;
    const freq = countdownTickToggleRef.current ? baseFreq * 1.08 : baseFreq * 0.92;
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
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      try {
        osc.start(now);
        osc.stop(now + 0.2);
      } catch (_) {}
    };
    ctx.resume().then(start).catch(start);
  }

  // Celebration fin de mini-tournoi
  function playTournamentCelebrationSound() {
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
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(0.3, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      master.connect(ctx.destination);

      const chord = [0, 4, 7, 12];
      const base = 440;
      chord.forEach((semi, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + idx * 0.04;
        osc.type = idx % 2 === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(base * Math.pow(2, semi / 12), t0);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.6, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
        osc.connect(gain);
        gain.connect(master);
        try {
          osc.start(t0);
          osc.stop(t0 + 1.05);
        } catch (_) {}
      });
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

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  async function toggleFullscreen() {
    if (typeof document === "undefined") return;
    try {
      if (!document.fullscreenElement) {
        const headerHeight = Math.round(mobileHeaderRef.current?.offsetHeight || 0);
        const nextOffset = headerHeight + FULLSCREEN_HEADER_TOP_OFFSET_PX;
        if (nextOffset > 0) {
          setMobileHeaderOffsetPx((prev) =>
            prev === nextOffset ? prev : nextOffset
          );
        }
        setIsFullscreen(true);
        await document.documentElement.requestFullscreen();
      } else {
        const headerHeight = Math.round(mobileHeaderRef.current?.offsetHeight || 0);
        if (headerHeight > 0) {
          setMobileHeaderOffsetPx((prev) =>
            prev === headerHeight ? prev : headerHeight
          );
        }
        setIsFullscreen(false);
        await document.exitFullscreen();
      }
    } catch (_) {
      setIsFullscreen(Boolean(document.fullscreenElement));
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

  function playSpecialFoundSound() {
    if (isMuted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    const start = () => {
      if (ctx.state !== "running") return;
      const now = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      try {
        osc.start(now);
        osc.stop(now + 0.2);
      } catch (_) {}
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

  function triggerConfettiBurst(kind = "target") {
    const durationMs = kind === "gobble" ? 1200 : 2600;
    if (confettiBurstTimerRef.current) {
      clearTimeout(confettiBurstTimerRef.current);
      confettiBurstTimerRef.current = null;
    }
    const id = Date.now() + Math.random();
    setConfettiBurst({ id, kind });
    confettiBurstTimerRef.current = setTimeout(() => {
      setConfettiBurst(null);
      confettiBurstTimerRef.current = null;
    }, durationMs);
  }

  useEffect(() => {
    if (phase !== "playing") {
      setHighlightPath([]);
    }
  }, [phase]);

  useEffect(() => {
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    if (!isTargetRoundNow || !targetSummary?.word) {
      setTargetDefinition((prev) =>
        prev.word ? { word: "", loading: false, ok: false, definition: "", source: "", url: "" } : prev
      );
      return;
    }
    const clean = String(targetSummary.word || "").trim();
    if (!clean) return;
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
    fetch(`/api/define?word=${encodeURIComponent(clean)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (requestId !== targetDefinitionRequestRef.current) return;
        if (!data) {
          setTargetDefinition((prev) => ({ ...prev, loading: false, ok: false }));
          return;
        }
        setTargetDefinition({
          word: data.displayWord || data.word || clean,
          loading: false,
          ok: !!data.definition || !!data.extract,
          definition: data.definition || data.extract || "",
          source: data.source || "",
          url: data.url || "",
        });
      })
      .catch(() => {
        if (requestId !== targetDefinitionRequestRef.current) return;
        setTargetDefinition((prev) => ({ ...prev, loading: false, ok: false }));
      });
  }, [specialRound?.type, targetSummary, targetDefinition.word, targetDefinition.ok]);

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
    if (
      typeof breakCountdown === "number" &&
      breakCountdown > 0 &&
      breakCountdown <= 10 &&
      phase !== "playing" &&
      breakKind !== "tournament_end"
    ) {
      playCountdownTickSound();
    }
  }, [breakCountdown, phase, breakKind]);

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
    if (typeof document === "undefined") return;

    const requestState = () => {
      if (!isLoggedIn) return;
      syncServerTime(() => {
        if (phase !== "playing" && socket?.connected) {
          socket.emit("state:request");
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        requestState();
      }
    };

    const onFocus = () => {
      requestState();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [isLoggedIn, phase]);

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
      setTournamentSummaryAt(null);
      setTournamentFinaleHoldUntil(null);
      setTargetSummary(null);
      setTournament(tournamentPayload || null);
      setSpecialHint(null);
      setSpecialSolvedOverlay(null);
      setFoundTargetThisRound(false);
      setFoundTargetWord("");
      setConfettiBurst(null);
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
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
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
      if (tournamentPayload?.breakKind === "tournament_end") {
        setTournamentFinaleHoldUntil(
          getNowServerMs() + FINAL_ROUND_RESULTS_SECONDS * 1000
        );
      } else {
        setTournamentFinaleHoldUntil(null);
      }
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
      setTournamentSummaryAt(summaryAt || null);
      setTargetSummary(targetSummaryPayload || null);
      setResultsRankingMode("round");

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
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
    }) {
      if (incomingRoomId && currentRoomId && incomingRoomId !== currentRoomId) return;
      syncServerTime();
      setNextStartAt(nextTs || null);
      setBreakKind(bk);
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
          [...prevMsgs, ...sysMessages].slice(-CHAT_BUFFER_MAX)
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
      setChatMessages(history.slice(-CHAT_BUFFER_MAX));
    }

    function onChatNew(msg) {
      if (!msg || typeof msg !== "object") return;
      setChatMessages((prev) => [...prev, msg].slice(-CHAT_BUFFER_MAX));

      const authorInstallId =
        typeof msg.installId === "string" ? msg.installId : "";
      if (authorInstallId && authorInstallId === installId) return;
      const author = (msg.author || msg.nick || "").trim();
      const me = nickname.trim();
      if (author && me && author === me) return;
      if (!isChatOpenMobileRef.current) {
        setMobileChatUnreadCount((prev) => prev + 1);
      }
    }

    function appendAnnouncements(entries) {
      if (!entries || entries.length === 0) return;
      setAnnouncements((prev) => [...prev, ...entries].slice(-40));
    }

    function onAnnouncement(data) {
      if (!data) return;
      maybePlayAnnouncementSound(data);
      appendAnnouncements([data]);
    }

    function onAnnouncements(batch) {
      if (!Array.isArray(batch) || batch.length === 0) return;
      batch.forEach((entry) => {
        if (entry) maybePlayAnnouncementSound(entry);
      });
      appendAnnouncements(batch);
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
      setTargetSummary(null);
      setBreakKind(null);
      setTournamentFinaleHoldUntil(null);
      setSpecialHint(null);
      setSpecialSolvedOverlay(null);
      setFoundTargetThisRound(false);
      setFoundTargetWord("");
      setConfettiBurst(null);
    }

    function onMedalsUpdate(payload) {
      setMedals(payload && typeof payload === "object" ? payload : {});
    }

    function onSpecialHint(payload) {
      if (!payload || typeof payload !== "object") return;
      if (roundId && payload.roundId && payload.roundId !== roundId) return;
      const hintKind = payload.kind || null;
      const allowCells = hintKind === "target_long" || hintKind === "target_score";
      setSpecialHint({
        kind: hintKind,
        pattern: payload.pattern || "",
        length: payload.length || null,
        cells:
          allowCells && Array.isArray(payload.revealCells)
            ? payload.revealCells.filter((idx) => Number.isInteger(idx))
            : [],
      });
    }

    function onSpecialSolved(payload) {
      if (!payload || typeof payload !== "object") return;
      if (roundId && payload.roundId && payload.roundId !== roundId) return;
      const me = nickname.trim();
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

    socket.on("roundStarted", onRoundStarted);
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
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("roundStarted", onRoundStarted);
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
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
    };
  }, [roundId, nickname, currentRoomId, roomId]);


  useEffect(() => {
    let id = null;

    const finalizeRound = () => {
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
  }, [phase, serverEndsAt, serverRoundDurationMs, board, dictionary, currentRoomId, roomId, specialScoreConfig]);

  useEffect(() => {
    if (phase !== "results") return;
    if (!dictionary) return;
    if (allWords.length > 0) return;
    if (specialRound?.type === "monstrous" && !showAllWords) return;
    if (upcomingSpecial?.type === "monstrous" && !showAllWords) return;

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
      socket.emit("login", { nick, roomId, installId }, (res) => {
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

  function scheduleAllWordsCompute(
    sourceBoard,
    { updateBestRefs = true, jobKey, delayMs } = {}
  ) {
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
    // Laisse le temps au joueur de saisir les premiers mots sans jank.
    allWordsComputeRef.current.kickoff = setTimeout(kickoff, kickoffDelay);
  }

  function buildAllWordsLocal(sourceBoard = board, opts = {}) {
    const updateBestRefs = opts.updateBestRefs !== false;
    if (!dictionary) return [];
    if (!sourceBoard || sourceBoard.length === 0) return [];
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

  useEffect(() => {
    if (phase !== "playing") return;
    if (specialRound?.type === "speed") return;
    if (specialRound?.type === "monstrous") return;
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
    setTargetSummary(null);
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
    const path = findBestPathForWord(board, wordNorm, specialScoreConfig);
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
    const vv = window.visualViewport;
    const heightCandidates = [
      window.innerHeight,
      document.documentElement?.clientHeight,
      vv?.height,
    ].filter((v) => Number.isFinite(v) && v > 0);
    const baseHeight = heightCandidates.length
      ? Math.max(...heightCandidates)
      : 0;
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
    setIsChatClosing(false);
    setMobileChatUnreadCount(0);
    captureChatViewportBaseline();
    setIsChatOpenMobile(true);
  }

  function closeChatPanel() {
    if (!isChatOpenMobile) return;
    if (chatCloseTimerRef.current) {
      clearTimeout(chatCloseTimerRef.current);
    }
    setIsChatClosing(true);
    if (chatInputRef.current) {
      try {
        chatInputRef.current.blur();
      } catch (_) {}
    }
    chatBodyLockHeightRef.current = 0;
    chatCloseTimerRef.current = window.setTimeout(() => {
      setIsChatOpenMobile(false);
      setIsChatClosing(false);
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

  function openDefinition(term) {
    const clean = String(term || "").trim();
    if (!clean) return;
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
    });

    fetch(`/api/define?word=${encodeURIComponent(clean)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (requestId !== definitionRequestIdRef.current) return;
        if (!data) {
          setDefinitionModal((prev) => ({ ...prev, loading: false, ok: false }));
          return;
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
          definition: data.definition || data.extract || "",
          source: data.source || "",
          url: data.url || "",
          ok: !!data.ok,
        });
      })
      .catch(() => {
        if (requestId !== definitionRequestIdRef.current) return;
        setDefinitionModal((prev) => ({ ...prev, loading: false, ok: false }));
      });
  }

  function closeDefinition() {
    setDefinitionModal((prev) => ({ ...prev, open: false }));
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

      const path = findBestPathForWord(board, raw, specialScoreConfig);
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

  function playDefeatTone(freqs = [280, 220]) {
    if (isMuted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime + 0.01;
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = now + idx * 0.1;
      osc.type = "triangle";
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

  function playErrorSound() {
    playDefeatTone([290, 230]);
  }

  function playDuplicateErrorTone() {
    playDefeatTone([320, 260]);
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
          const safeRadius = Math.min(rect.width, rect.height) * 0.8; // si plus petit, moins permissif
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
          const CORNER_THRESHOLD = 0.4; //si plus petit, moins permissif
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
      path = findBestPathForWord(board, raw, specialScoreConfig);
      if (!path) return error("Mot absent de la grille");
      setHighlightPath(path);
    }

    // Mode en ligne : on délègue la validation / le score au serveur
    if (roundId && socket.connected && isLoggedIn) {
      socket.emit("submitWord", { roundId, word: raw, path }, (res) => {
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
        if (isTargetRoundNow) {
          setFoundTargetThisRound(true);
          setFoundTargetWord(raw);
          triggerConfettiBurst("target");
        }

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
  const isBonusLetterRound = specialRound?.type === "bonus_letter";
 const maxPossiblePts = bestGridMaxRef.current || 0;
 const maxPossibleLen = bestGridMaxLenRef.current || 0;
 const allowScoreGobble = !isSpeedRound;
 const allowLenGobble = true;
 const isGobbleNow =
   (allowScoreGobble && maxPossiblePts > 0 && pts === maxPossiblePts) ||
   (allowLenGobble && maxPossibleLen > 0 && wordLen === maxPossibleLen);

 if (!isTargetRoundNow) {
   if (isGobbleNow) {
     playGobbleVoice();
     triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
     triggerConfettiBurst("gobble");
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
   showToast("Trouvé !");
 } else {
   showToast(`+${pts} pts`);
 }


        setAccepted((prev) => {
          const updated = [...prev, raw];
          acceptedRef.current = updated;
          return updated;
        });

        setStatusMessage(isTargetRoundNow ? "Trouvé !" : `+${pts} pts`);
        clearSelection();
      });

      return;
    }

    if (roundId && (!socket.connected || !isLoggedIn)) {
      return error("Reconnecte-toi au serveur pour valider");
    }

    // Mode solo local : on garde le scoring existant
    const pts = computeScore(raw, path, board, specialScoreConfig);

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
 const isBonusLetterRound = specialRound?.type === "bonus_letter";
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
  const specialHintDisplay = solvedTargetWord
    ? buildCompletedTargetPattern(specialHint?.pattern || "", solvedTargetWord)
    : specialHint?.pattern || "";
  const showSolvedTargetLoupe = Boolean(solvedTargetWord);
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
    if (allWords.length > 0) return map;
    if (!accepted || accepted.length === 0) return map;
    for (const word of accepted) {
      const norm = normalizeWord(word);
      const path = findBestPathForWord(board, norm, specialScoreConfig);
      if (path) {
        map.set(word, computeScore(norm, path, board, specialScoreConfig));
      }
    }
    return map;
  }, [allWords.length, accepted, board, specialScoreConfig]);

  const allWordsMap = new Map(allWords.map((w) => [w.word, w]));
  const foundList = acceptedRef.current.map((word) => ({
    word,
    isFound: true,
    userPts: acceptedScoresRef.current.get(word),
    bestPts: allWordsMap.get(word)?.pts ?? bestPtsByFoundWord.get(word),
  }));
  const scoreForSort = (entry) =>
    typeof entry.bestPts === "number" ? entry.bestPts : entry.userPts || 0;
  foundList.sort((a, b) => scoreForSort(b) - scoreForSort(a));
  const baseList = allWords.length > 0 ? allWords : foundList;
  const displayList = baseList.map((entry) => ({
    word: entry.word,
    isFound: entry.isFound ?? acceptedRef.current.includes(entry.word),
    userPts: acceptedScoresRef.current.get(entry.word),
    bestPts: typeof entry.pts === "number" ? entry.pts : entry.bestPts,
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
    const minHeightStyle = inResults
      ? { minHeight: "clamp(240px, 40vh, 380px)" }
      : undefined;

    const specialTypeLabel = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (upcomingSpecial.type === "speed") return "JEU RAPIDE";
      if (upcomingSpecial.type === "monstrous") return "GRILLE MONSTRUEUSE";
      if (upcomingSpecial.type === "target_long") return "MOT LE PLUS LONG";
      if (upcomingSpecial.type === "target_score") return "MOT EN OR";
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
                      } ${definitionBlink ? "animate-pulse" : ""}`}
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
                <span className="flex items-center gap-2 text-right flex-wrap justify-end">
                  <span className="font-bold break-all text-sm sm:text-base">
                    {endStats.longestWord.word}
                  </span>
                  {endStats.longestWord.word && (
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                        darkMode
                          ? "bg-slate-800 border-slate-600 text-slate-100"
                          : "bg-white border-gray-300 text-gray-700"
                      } ${definitionBlink ? "animate-pulse" : ""}`}
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
      if (upcomingSpecial.type === "target_score") return "MOT EN OR";
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
                } ${definitionBlink ? "animate-pulse" : ""}`}
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
    specialRound?.type === "target_long" ||
    specialRound?.type === "target_score" ||
    (phase === "results" && !!targetSummary);
  const isSpeedRound = specialRound?.type === "speed";
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

  const tournamentFinaleSummary = React.useMemo(() => {
    if (
      tournamentSummary &&
      Array.isArray(tournamentSummary.ranking) &&
      tournamentSummary.ranking.length > 0
    ) {
      return tournamentSummary;
    }
    if (Array.isArray(tournamentRanking) && tournamentRanking.length > 0) {
      const ranking = [...tournamentRanking]
        .sort((a, b) => (b.score ?? b.points ?? 0) - (a.score ?? a.points ?? 0))
        .map((entry) => ({
          nick: entry.nick,
          points: typeof entry.score === "number" ? entry.score : entry.points || 0,
          gobbles: entry.gobbles ?? null,
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

  function renderMedals(nick, fallbackMedals) {
    const m = medals?.[nick] || fallbackMedals?.[nick];
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

    const path =
      solutionsRef.current.get(word) || findBestPathForWord(board, word, specialScoreConfig);
    const pts = path ? computeScore(word, path, board, specialScoreConfig) : 0;

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
    "p-4 bg-white rounded-xl space-y-3 w-full max-w-md flex-shrink-0 " +
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
  const useVisualViewportForChat = visualViewportHeight > 0;
  const chatViewportStyle = useVisualViewportForChat
    ? {
        top: `${visualViewportOffsetTop}px`,
        height: `${visualViewportHeight}px`,
        bottom: "auto",
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
      (gridSize === 5 ? 640 : 560)
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
    (gridSize === 5 ? Math.min(MAX_GRID_WIDTH, 420) : Math.min(MAX_GRID_WIDTH, 360));
  const effectiveGridWidth = maxGridSideByHeight
    ? Math.min(widthCandidate, maxGridSideByHeight)
    : widthCandidate;
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

  useEffect(() => {
    if (showTournamentFinale && !tournamentCelebrationPlayedRef.current) {
      playTournamentCelebrationSound();
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

  const chatRulesModal = isChatRulesOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
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
            onClick={cancelChatRules}
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
    <div className="fixed inset-0 z-[9998]" onClick={closeUserMenu}>
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
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

  const definitionPreview = definitionModal.definition
    ? (() => {
        const text = String(definitionModal.definition).trim();
        if (text.length <= 140) return text;
        return `${text.slice(0, 140).trim()}...`;
      })()
    : "";

  const definitionModalView =
    definitionModal.open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
            style={{ zIndex: 2147483647 }}
            onClick={closeDefinition}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${
                darkMode
                  ? "bg-slate-900/95 text-slate-100 border-slate-600"
                  : "bg-white/95 text-slate-900 border-slate-200"
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
              {(definitionModal.phraseGuess && definitionModal.matchedTitle) ||
              (definitionModal.lemmaGuess && definitionModal.lemma) ||
              (definitionModal.participleGuess &&
                definitionModal.participleLabel &&
                definitionModal.participleBase) ||
              (definitionModal.inflectionGuess &&
                definitionModal.inflectionLabel &&
                definitionModal.inflectionBase) ? (
                <div className="mt-1 text-[11px] font-semibold opacity-80">
                  {definitionModal.phraseGuess && definitionModal.matchedTitle
                    ? `Définition trouvée pour ${definitionModal.matchedTitle} (lié à '${definitionModal.word}')`
                    : definitionModal.lemmaGuess && definitionModal.lemma
                    ? definitionModal.lemmaLabel
                      ? `${definitionModal.lemmaLabel} ${definitionModal.lemma}`
                      : `Forme conjuguée probable — définition de ${definitionModal.lemma}`
                    : definitionModal.participleGuess &&
                      definitionModal.participleLabel &&
                      definitionModal.participleBase
                    ? `${definitionModal.participleLabel} ${definitionModal.participleBase}`
                    : `${definitionModal.inflectionLabel} ${definitionModal.inflectionBase}`}
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
                  onClick={closeDefinition}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const chatOverlays = (
    <>
      {userMenuView}
      {reportModal}
      {chatRulesModal}
      {definitionModalView}
    </>
  );

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
        className={`w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-3 ${
          darkMode
            ? "bg-slate-900/70 border border-white/10"
            : "bg-white/90 border border-slate-200"
        }`}
      >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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

          <form
            onSubmit={handleLogin}
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
          {chatOverlays}
      </div>
      </div>
    );
  }

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
  const confettiBurstOverlay =
    confettiBurst && typeof document !== "undefined"
      ? createPortal(
          <div className="pointer-events-none fixed inset-0 z-[9990] overflow-hidden">
            {confettiPieces
              .slice(0, confettiBurst.kind === "gobble" ? 36 : confettiPieces.length)
              .map((p) => {
                const speed = confettiBurst.kind === "gobble" ? 0.55 : 1;
                return (
                  <span
                    key={`${confettiBurst.id}-${p.id}`}
                    className="confetti-piece"
                    style={{
                      left: `${p.left}%`,
                      backgroundColor: p.color,
                      width: `${p.sizeW}px`,
                      height: `${p.sizeH}px`,
                      transform: `rotate(${p.rot}deg)`,
                      animationDelay: `${p.delay}s`,
                      ["--confetti-duration"]: `${(p.duration * speed).toFixed(2)}s`,
                    }}
                  />
                );
              })}
          </div>,
          document.body
        )
      : null;
  const praiseRect = !isMobileLayout
    ? gridRef.current?.getBoundingClientRect?.()
    : null;
  const praisePositionStyle =
    praiseRect && Number.isFinite(praiseRect.left) && Number.isFinite(praiseRect.top)
      ? {
          left: `${Math.round(praiseRect.left + praiseRect.width / 2)}px`,
          top: `${Math.round(praiseRect.top + praiseRect.height * 0.45)}px`,
        }
      : undefined;
  const gobbleSizeClass = isMobileLayout ? "text-5xl" : "text-6xl";
  const praiseSizeClass = isMobileLayout ? "text-4xl" : "text-5xl";
  const praiseOverlay =
    phase === "playing" && praiseFlash && typeof document !== "undefined"
      ? createPortal(
          <div
            key={praiseFlash.id}
            className={[
              "praise-pop praise-outline font-extrabold tracking-tight",
              praiseFlash.kind === "gobble"
                ? `praise-gobble ${gobbleSizeClass}`
                : `praise-gold ${praiseSizeClass}`,
            ].join(" ")}
            style={praisePositionStyle}
          >
            {praiseFlash.text}
          </div>,
          document.body
        )
      : null;

  if (showTournamentFinale) {
    const finaleRanking = tournamentFinaleSummary.ranking.map((e) => ({
      nick: e.nick,
      score: typeof e.points === "number" ? e.points : e.score || 0,
    }));
    const records = tournamentFinaleSummary.records || {};
    const winnerNick = tournamentFinaleSummary.winnerNick || "Joueur";
    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    const finaleBaselineHeight =
      chatBodyLockHeightRef.current ||
      chatViewportHeight ||
      (typeof window !== "undefined" ? window.innerHeight : 0);
    const finaleVisibleHeight = useVisualViewportForChat
      ? visualViewportHeight
      : Math.max(0, Math.round(finaleBaselineHeight - chatKeyboardInsetPx));
    const finaleSheetHeight =
      finaleVisibleHeight > 0
        ? clampValue(
            Math.round(finaleBaselineHeight * CHAT_SHEET_HEIGHT_RATIO),
            260,
            finaleVisibleHeight
          )
        : 0;
    const finaleChatOverlayStyle =
      !useVisualViewportForChat && chatKeyboardInsetPx
        ? { paddingBottom: `${chatKeyboardInsetPx}px` }
        : undefined;
    const finaleChatSheetStyle = finaleSheetHeight
      ? { height: `${finaleSheetHeight}px`, maxHeight: `${finaleSheetHeight}px` }
      : undefined;

    return (
      <div
        className={`min-h-screen relative overflow-hidden ${
          darkMode
            ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white"
            : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
        }`}
      >
        <style>{slideStyles}</style>
        {confettiBurstOverlay}

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
                renderNickSuffix={(nick) => renderMedals(nick, tournamentFinaleMedals)}
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
                      <strong>{records.bestWord.word}</strong>
                      {records.bestWord.word && (
                        <button
                          type="button"
                          className={`ml-1 inline-flex items-center justify-center rounded-full border px-2 py-0.5 align-middle ${darkMode
                              ? "bg-slate-800 border-slate-600 text-slate-100"
                              : "bg-white border-gray-300 text-gray-700"} ${definitionBlink ? "animate-pulse" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDefinition(records.bestWord.word);
                          }}
                          aria-label="Voir la définition"
                          title="Voir la définition"
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
                            <circle cx="11" cy="11" r="7" />
                            <line x1="16.65" y1="16.65" x2="21" y2="21" />
                          </svg>
                        </button>
                      )}{" "}
                      ({records.bestWord.pts} pts) · manche{" "}
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
                      <strong>{records.longestWord.word}</strong>
                      {records.longestWord.word && (
                        <button
                          type="button"
                          className={`ml-1 inline-flex items-center justify-center rounded-full border px-2 py-0.5 align-middle ${darkMode
                              ? "bg-slate-800 border-slate-600 text-slate-100"
                              : "bg-white border-gray-300 text-gray-700"} ${definitionBlink ? "animate-pulse" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDefinition(records.longestWord.word);
                          }}
                          aria-label="Voir la définition"
                          title="Voir la définition"
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
                            <circle cx="11" cy="11" r="7" />
                            <line x1="16.65" y1="16.65" x2="21" y2="21" />
                          </svg>
                        </button>
                      )}{" "}
                      ({records.longestWord.len}) · manche{" "}
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
                  className="px-2 py-1 text-[0.7rem] rounded-full border bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="flex-1 border rounded px-2 py-1 text-xs ios-input"
                placeholder={chatInputPlaceholder}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatInputKeyDown}
              />
              <button
                type="button"
                className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
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
        {isMobileLayout && (
          <MobileChatWidget
            chatInput={chatInput}
            chatInputRef={chatInputRef}
            chatInputType={chatInputType}
            chatInputDisabled={chatInputDisabled}
            chatInputPlaceholder={chatInputPlaceholder}
            onChatInputFocus={handleChatInputFocus}
            chatOverlayStyle={finaleChatOverlayStyle}
            chatViewportStyle={chatViewportStyle}
            chatSheetStyle={finaleChatSheetStyle}
            chatAnimationMs={CHAT_DRAWER_ANIM_MS}
            cycleChatHistory={cycleChatHistory}
            darkMode={darkMode}
            hasKeyboardInset={chatKeyboardInsetPx > 0}
            isChatOpenMobile={isChatOpenMobile}
            isChatClosing={isChatClosing}
            mobileChatUnreadCount={mobileChatUnreadCount}
            blockedCount={blockedCount}
            blockedEntries={blockedEntries}
            onToggleBlockedList={() => setShowBlockedList((prev) => !prev)}
            onUnblockInstallId={unblockInstallId}
            onOpenChat={requestOpenChat}
            onOpenRules={() => setIsChatRulesOpen(true)}
            onOpenUserMenu={openUserMenu}
            showBlockedList={showBlockedList}
            selfNick={selfNick}
            selfInstallId={installId}
            setChatInput={setChatInput}
            setIsChatOpenMobile={closeChatPanel}
            submitChat={submitChat}
            visibleMessages={visibleMessages}
          />
        )}
        {chatOverlays}
      </div>
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
    const fullscreenTopPadding = isFullscreen
      ? `${Math.round(mobileHeaderOffsetPx || 0)}px`
      : "env(safe-area-inset-top)";
    const useVisualViewport = !(isChatOpenMobile || isChatClosing);
    const lockedChatHeight = chatBodyLockHeightRef.current || null;
    const mobileViewportHeightCandidates =
      typeof window !== "undefined"
        ? (useVisualViewport
            ? [
                mobileLayoutSizing.viewportHeight,
                window.visualViewport?.height,
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

    const compactCountdownValue =
      countdownLines.find((line) => /^\d+$/.test(line)) ||
      (countdownLines
        .map((line) => String(line).match(/\d+/))
        .find((m) => m)?.[0] ??
        "");

    return (
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
              onClick={() => setIsMuted((v) => !v)}
              className="px-1 py-0.5 rounded-md border text-[9px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
            >
              {isMuted ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <line x1="14" y1="9" x2="20" y2="15" />
                  <line x1="20" y1="9" x2="14" y2="15" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )}
              <span className="sr-only">{isMuted ? "Son coupé" : "Son actif"}</span>
            </button>
            <button
              onClick={() => setDarkMode((v) => !v)}
              className="px-1 py-0.5 rounded-md border text-[9px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
            >
              {darkMode ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
              <span className="sr-only">{darkMode ? "Mode clair" : "Mode sombre"}</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="px-1 py-0.5 rounded-md border text-[9px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
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
                window.visualViewport?.height,
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

    const chatVisibleHeight = useVisualViewportForChat
      ? visualViewportHeight
      : Math.max(0, Math.round(chatViewportHeightEffective - chatKeyboardInsetPx));
    const chatOverlayStyle =
      !useVisualViewportForChat && chatKeyboardInsetPx
        ? { paddingBottom: `${chatKeyboardInsetPx}px` }
        : undefined;
    const chatSheetHeightPx =
      chatVisibleHeight > 0
        ? clampValue(
            Math.round(chatViewportHeightEffective * CHAT_SHEET_HEIGHT_RATIO),
            260,
            chatVisibleHeight
          )
        : 0;
    const chatSheetStyle = chatSheetHeightPx
      ? {
          height: `${chatSheetHeightPx}px`,
          maxHeight: `${chatSheetHeightPx}px`,
        }
      : undefined;
    if (isResults) {
      const resultsTab =
        isTargetRound && mobileResultsTab === "mots" ? "classement" : mobileResultsTab;
      const isTargetResults = isTargetRound;
      const resultsCardClassName = `relative rounded-xl px-3 py-2 flex flex-col gap-2 overflow-hidden ${
        isTargetResults ? "flex-none" : "flex-1 min-h-0"
      } ${darkMode ? "bg-slate-900/90" : "bg-white/90"} box-border`;
      const resultsCardStyle = isTargetResults
        ? { height: "46vh", minHeight: "38vh", maxHeight: "52vh" }
        : { minHeight: "320px" };
      const summaryWrapperClass = isTargetResults
        ? "-mt-1 flex-none"
        : "mt-2";
      return (
        <div
          className={`flex flex-col ${
            darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
          }`}
          style={mobileViewportContainerStyle}
        >
          <style>{slideStyles}</style>
          {confettiBurstOverlay}

          <MobileHeader
            activeRoom={activeRoom}
            countdownLines={countdownLines}
            darkMode={darkMode}
            gridSize={gridSize}
            headerRef={mobileHeaderRef}
            fullscreenTopOffsetPx={FULLSCREEN_HEADER_TOP_OFFSET_PX}
            isFullscreen={isFullscreen}
            isMuted={isMuted}
            isTargetRound={isTargetRound}
            phase={phase}
            roomLabelSeparator=" - "
            setDarkMode={setDarkMode}
            setIsMuted={setIsMuted}
            showHelpButton={false}
            tournament={tournament}
            toggleFullscreen={toggleFullscreen}
          />
          <div
            className="flex-1 flex flex-col gap-1 px-3 pt-1 pb-2 overflow-hidden box-border"
            style={{
              ...mobileBodyHeightStyle,
              paddingTop: mobileBodyPaddingTop,
            }}
          >
            <div className={resultsCardClassName} style={resultsCardStyle}>
              <div className="text-xs">
              <div className="flex w-full border-b border-slate-200 dark:border-slate-700">
                  {(isTargetRound ? ["classement"] : ["classement", "mots"]).map((tab) => {
                    const active = resultsTab === tab;
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
                {resultsTab === "mots" && !isTargetRound ? (
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
                        showRoundAward={true}
                        renderNickSuffix={renderMedals}
                        renderAfterRank={resultsRankingMode === "total" ? renderRankDelta : null}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(isTargetRound ? targetSummary : endStats) && (
              <div className={summaryWrapperClass}>
                {isTargetRound
                  ? renderTargetSummaryCard("w-full")
                  : renderEndStatsCard("w-full")}
              </div>
            )}
          </div>

          <MobileChatWidget
            chatInput={chatInput}
            chatInputRef={chatInputRef}
            chatInputType={chatInputType}
            chatInputDisabled={chatInputDisabled}
            chatInputPlaceholder={chatInputPlaceholder}
            onChatInputFocus={handleChatInputFocus}
            chatOverlayStyle={chatOverlayStyle}
            chatViewportStyle={chatViewportStyle}
            chatSheetStyle={chatSheetStyle}
            chatAnimationMs={CHAT_DRAWER_ANIM_MS}
            cycleChatHistory={cycleChatHistory}
            darkMode={darkMode}
            hasKeyboardInset={chatKeyboardInsetPx > 0}
            isChatOpenMobile={isChatOpenMobile}
            isChatClosing={isChatClosing}
            mobileChatUnreadCount={mobileChatUnreadCount}
            blockedCount={blockedCount}
            blockedEntries={blockedEntries}
            onToggleBlockedList={() => setShowBlockedList((prev) => !prev)}
            onUnblockInstallId={unblockInstallId}
            onOpenChat={requestOpenChat}
            onOpenRules={() => setIsChatRulesOpen(true)}
            onOpenUserMenu={openUserMenu}
            showBlockedList={showBlockedList}
            selfNick={selfNick}
            selfInstallId={installId}
            setChatInput={setChatInput}
            setIsChatOpenMobile={closeChatPanel}
            submitChat={submitChat}
            visibleMessages={visibleMessages}
          />
          {chatOverlays}
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
          <MobileHeader
            activeRoom={activeRoom}
            countdownLines={countdownLines}
            darkMode={darkMode}
            gridSize={gridSize}
            headerRef={mobileHeaderRef}
            fullscreenTopOffsetPx={FULLSCREEN_HEADER_TOP_OFFSET_PX}
            isFullscreen={isFullscreen}
            isMuted={isMuted}
            isTargetRound={isTargetRound}
          phase={phase}
          roomLabelSeparator=" - "
          roundStatsText={
            phase === "playing" && roundStats && !isTargetRound
              ? `${roundStats.words ?? "?"} mots - ${
                  formatNumber(roundStats.totalPts ?? roundStats.maxPts ?? 0) || "?"
                } pts`
              : null
          }
          setDarkMode={setDarkMode}
          setIsMuted={setIsMuted}
          setShowHelp={setShowHelp}
          showHelpButton={true}
          showRoundStats={true}
          tournament={tournament}
          toggleFullscreen={toggleFullscreen}
        />
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
          className="flex-1 flex flex-col gap-1 px-3 pt-1 pb-2 overflow-hidden box-border"
          style={{
            ...mobileBodyHeightStyle,
            paddingTop: mobileBodyPaddingTop,
          }}
        >
          {phase === "playing" && isTargetRound ? (
            <div
              ref={mobileRankingRef}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border"
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
                  ? "TROUVE LE MOT EN OR"
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
                        } ${definitionBlink ? "animate-pulse" : ""}`}
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
              {specialHint?.pattern && specialHint?.length ? (
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
                {specialHint?.pattern ? "Indice mis a jour..." : "Indice dans 15 secondes..."}
              </div>
            </div>
          ) : (
            <div
              ref={mobileRankingRef}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border"
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
              <RankingWidgetMobile
                fullRanking={fullRanking}
                selfNick={selfNick}
                darkMode={darkMode}
                expanded={false}
                flatStyle={true}
                highlightedPlayers={highlightPlayers}
                fitHeight={true}
                className="h-full"
              />
            </div>
          )}

                    <MobileWordPreview
            countdownLines={countdownLines}
            currentDisplay={currentDisplay}
            darkMode={darkMode}
            liveWord={liveWord}
            phase={phase}
            previewBlockHeight={previewBlockHeight}
            previewGapPx={previewGapPx}
            previewTileBaseStyle={previewTileBaseStyle}
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
        {/* Bouton de chat flottant + volet de chat */}
          <MobileChatWidget
            chatInput={chatInput}
            chatInputRef={chatInputRef}
            chatInputType={chatInputType}
            chatInputDisabled={chatInputDisabled}
            chatInputPlaceholder={chatInputPlaceholder}
            onChatInputFocus={handleChatInputFocus}
            chatOverlayStyle={chatOverlayStyle}
            chatViewportStyle={chatViewportStyle}
            chatSheetStyle={chatSheetStyle}
            chatAnimationMs={CHAT_DRAWER_ANIM_MS}
            cycleChatHistory={cycleChatHistory}
            darkMode={darkMode}
            hasKeyboardInset={chatKeyboardInsetPx > 0}
            isChatOpenMobile={isChatOpenMobile}
            isChatClosing={isChatClosing}
            mobileChatUnreadCount={mobileChatUnreadCount}
            blockedCount={blockedCount}
          blockedEntries={blockedEntries}
          onToggleBlockedList={() => setShowBlockedList((prev) => !prev)}
          onUnblockInstallId={unblockInstallId}
          onOpenChat={requestOpenChat}
          onOpenRules={() => setIsChatRulesOpen(true)}
          onOpenUserMenu={openUserMenu}
          showBlockedList={showBlockedList}
          selfNick={selfNick}
          selfInstallId={installId}
          setChatInput={setChatInput}
          setIsChatOpenMobile={closeChatPanel}
          submitChat={submitChat}
          visibleMessages={visibleMessages}
        />
          {chatOverlays}
        {praiseOverlay}

      </div>
    );
  }

  
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <style>{slideStyles}</style>
      {confettiBurstOverlay}

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
          <div className="text-[11px] font-extrabold tracking-widest text-center text-amber-500 dark:text-amber-300">
            {specialRound?.type === "target_long"
              ? "TROUVE LE PLUS LONG MOT"
              : specialRound?.type === "target_score"
              ? "TROUVE LE MOT EN OR"
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
                    } ${definitionBlink ? "animate-pulse" : ""}`}
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
          showRoundAward={true}
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
                      {p.nick ? renderMedals(p.nick) : null}
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



              {board.map((cell, i) => {
                const { letter, bonus } = cell;
                const displayBonus = normalizeBonusLabel(bonus);
                const isUsed = usedSet.has(i);
                const isBonusLetterTile =
                  bonusLetterKey && normalizeLetterKey(letter) === bonusLetterKey;
                const isHint = hintCellSet.has(i);
                const isHintOutline = hintOutlineCellSet.has(i);
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
  key={i}
  ref={(el) => (tileRefs.current[i] = el)}
  onMouseDown={() => handleMouseDown(i)}
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
    hintClass,
    hintOutlineClass,
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
              className={`w-full text-center font-bold text-lg leading-none flex items-center justify-center ${shake ? "shake" : ""}`}
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
            className="chat-messages flex-1 border rounded px-2 py-1 bg-white text-xs space-y-1 flex flex-col justify-end overflow-hidden"
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
                className="px-2 py-1 text-[0.7rem] rounded-full border bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="flex-1 border rounded px-2 py-1 text-xs ios-input"
              placeholder={chatInputPlaceholder}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatInputKeyDown}
            />
            <button
              type="button"
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={!chatInput.trim() || chatInputDisabled}
              onClick={() => submitChat(null)}
            >
              Envoyer
            </button>
          </div>
        </div>
      </div>

      {praiseOverlay}
          {chatOverlays}

    </div>
  );
}























