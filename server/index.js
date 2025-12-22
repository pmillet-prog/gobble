// server/index.js
import path from "path";
import { fileURLToPath } from "url";

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { readFileSync, appendFileSync, mkdirSync } from "fs";

import {
  generateGrid,
  scoreWordOnGrid,
  solveGrid,
  normalizeWord,
} from "../shared/gameLogic.js";
import { createBotManager } from "./bots/botManager.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());

// ===== SERVE FRONT VITE (dist) =====
app.use(express.static(path.join(__dirname, "../dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const DEFAULT_ROUND_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_BREAK_DURATION_MS = 30 * 1000; // 30 secondes
const MAX_CHAT_HISTORY = 50;
const NICK_MAX_LEN = 25;
const RESERVATION_MS = 3 * 60 * 1000; // pseudo réservé apres déco
const MIN_BIG_WORD = 50;
const MIN_LONG_WORD = 5;
const MIN_WORDS_BY_SIZE = { 4: 120, 5 : 100 }; 
const MAX_QUALITY_ATTEMPTS = 50;
const SPECIAL_ROUND_EVERY = 5;
const SPEED_MIN_WORDS = { 4: 300, 5: 400 };
const SPEED_WORD_SCORE = 11;
const MONSTROUS_MIN_TOTAL_SCORE = { 4: 2000, 5: 4000 };
const MONSTROUS_MIN_LONG_WORD_LEN = 10;
const MONSTROUS_MIN_LONG_WORD_COUNT = 3;
const SPECIAL_QUALITY_ATTEMPTS = 220;

const TOURNAMENT_TOTAL_ROUNDS = 5;
const TOURNAMENT_SPECIAL_ROUNDS = [2, 4];
const TOURNAMENT_RESULTS_BREAK_MS = 20 * 1000;
const TOURNAMENT_FINAL_BREAK_MS = 35 * 1000;
const TOURNAMENT_END_TOTAL_BREAK_MS = TOURNAMENT_RESULTS_BREAK_MS + TOURNAMENT_FINAL_BREAK_MS;
const MEDALS_TTL_AFTER_DISCONNECT_MS = 5 * 60 * 1000;
const TOURNAMENT_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const TARGET_LONG_MIN_LEN = 8;
const TARGET_SCORE_MIN_PTS = 100;
const TARGET_HINT_FIRST_MS = 15 * 1000;
const TARGET_HINT_STEP_MS = 15 * 1000;

const BONUS_LETTER_SCORE = 20;
const BONUS_LETTER_MIN_WORDS = 30;
const FORCE_BONUS_LETTER_ALL_ROUNDS = false;

const ROOM_CONFIGS = {
  "room-4x4": {
    label: "Grille 4x4",
    gridSize: 4,
    durationMs: DEFAULT_ROUND_DURATION_MS,
    breakMs: DEFAULT_BREAK_DURATION_MS,
    minWords: MIN_WORDS_BY_SIZE[4],
  },
  "room-5x5": {
    label: "Grille 5x5",
    gridSize: 5,
    durationMs: DEFAULT_ROUND_DURATION_MS,
    breakMs: DEFAULT_BREAK_DURATION_MS,
    minWords: MIN_WORDS_BY_SIZE[5],
  },
};



const LOG_DIR = path.join(__dirname, "logs");
const CONNECTIONS_LOG_PATH = path.join(LOG_DIR, "connections.log");

function normalizeIp(raw) {
  const ip = String(raw || "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  return ip;
}

function getClientIpFromSocket(socket) {
  try {
    const xf = socket?.handshake?.headers?.["x-forwarded-for"];
    if (typeof xf === "string" && xf.trim()) {
      return normalizeIp(xf.split(",")[0].trim());
    }
  } catch (_) {}
  return normalizeIp(socket?.handshake?.address || "");
}

function loadIgnoredIps() {
  const list = new Set();
  const env = `${process.env.IGNORE_IPS || ""},${process.env.IGNORE_IP || ""}`;
  env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((ip) => list.add(ip));

  try {
    const raw = readFileSync(path.join(LOG_DIR, "ignore_ips.txt"), "utf8");
    raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((ip) => list.add(ip));
  } catch (_) {}

  list.add("127.0.0.1");
  list.add("::1");
  return list;
}

const IGNORED_IPS = loadIgnoredIps();

function appendConnectionLog({ nick, roomId, ip, userAgent }) {
  const safeNick = String(nick || "").replace(/\r|\n/g, " ").trim();
  const safeRoom = String(roomId || "").replace(/\r|\n/g, " ").trim();
  const safeIp = normalizeIp(ip);
  if (!safeNick || !safeIp) return;
  if (IGNORED_IPS.has(safeIp)) return;

  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}

  const safeUa = String(userAgent || "").replace(/\r|\n/g, " ").trim();
  const ts = Date.now();
  const iso = new Date(ts).toISOString();
  const line = `${iso}\t${ts}\t${safeIp}\t${safeRoom}\t${safeNick}\t${safeUa}\n`;
  try {
    appendFileSync(CONNECTIONS_LOG_PATH, line, "utf8");
  } catch (_) {}
}

// Dictionnaire pour solveur serveur (facultatif)
let dictionary = null;
try {
  const raw = readFileSync(path.join(__dirname, "../public/dico.txt"), "utf8");
  dictionary = new Set(
    raw
      .split(/\r?\n/)
      .map((w) => normalizeWord(w.trim()))
      .filter(Boolean)
  );
  console.log(`Dictionnaire chargé (${dictionary.size} entrées)`);
} catch (err) {
  console.warn(
    "Impossible de charger le dictionnaire pour le solveur serveur:",
    err?.message
  );
  dictionary = null;
}

function getRoundPlan(roundNumber, roomConfig) {
  const size = roomConfig?.gridSize || 4;
  const base = {
    roundNumber,
    gridSize: size,
    isSpecial: false,
    type: "normal",
    label: "Manche classique",
    description: null,
    minWords: roomConfig?.minWords || 0,
  };

  if (roundNumber > 0 && roundNumber % SPECIAL_ROUND_EVERY === 0) {
    const specialIndex = Math.floor(roundNumber / SPECIAL_ROUND_EVERY) - 1;
    const speedTurn = specialIndex % 2 === 0;
    if (speedTurn) {
      return {
        ...base,
        isSpecial: true,
        type: "speed",
        label: "Manche rapidité",
        description: "Tous les mots valent 11 pts, on vise la rafale",
        minWords: SPEED_MIN_WORDS[size] || SPEED_MIN_WORDS[4],
        fixedWordScore: SPEED_WORD_SCORE,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    }
    return {
      ...base,
      isSpecial: true,
      type: "monstrous",
      label: "Grille monstrueuse",
      description: "Grille chargée en mots très longs et gros score potentiel",
      minWords: roomConfig?.minWords || 0,
      minTotalScore: MONSTROUS_MIN_TOTAL_SCORE[size] || MONSTROUS_MIN_TOTAL_SCORE[4],
      minLongWordLen: MONSTROUS_MIN_LONG_WORD_LEN,
      minLongWordCount: MONSTROUS_MIN_LONG_WORD_COUNT,
      qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
    };
  }

  return base;
}

function buildBaseTournamentPlan(tournamentRound, roomConfig) {
  const size = roomConfig?.gridSize || 4;
  return {
    roundNumber: tournamentRound,
    gridSize: size,
    isSpecial: false,
    type: "normal",
    label:
      tournamentRound === TOURNAMENT_TOTAL_ROUNDS
        ? "Manche finale"
        : "Manche classique",
    description: null,
    minWords: roomConfig?.minWords || 0,
  };
}

function buildSpeedTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  const size = base.gridSize || 4;
  return {
    ...base,
    isSpecial: true,
    type: "speed",
    label: "Manche rapidité",
    description: `Tous les mots valent ${SPEED_WORD_SCORE} pts, on vise la rafale`,
    minWords: SPEED_MIN_WORDS[size] || SPEED_MIN_WORDS[4],
    fixedWordScore: SPEED_WORD_SCORE,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildMonstrousTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  const size = base.gridSize || 4;
  return {
    ...base,
    isSpecial: true,
    type: "monstrous",
    label: "Grille monstrueuse",
    description: "Grille chargée en mots très longs et gros score potentiel",
    minWords: roomConfig?.minWords || 0,
    minTotalScore: MONSTROUS_MIN_TOTAL_SCORE[size] || MONSTROUS_MIN_TOTAL_SCORE[4],
    minLongWordLen: MONSTROUS_MIN_LONG_WORD_LEN,
    minLongWordCount: MONSTROUS_MIN_LONG_WORD_COUNT,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildTargetLongTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "target_long",
    label: "Mot le plus long",
    description: `Trouve le mot le plus long (indice apres ${TARGET_HINT_FIRST_MS / 1000}s)`,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildTargetScoreTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "target_score",
    label: "Mot en or",
    description: `Trouve le mot en or (celui qui rapporte le plus de points, indice apres ${TARGET_HINT_FIRST_MS / 1000}s)`,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildBonusLetterTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "bonus_letter",
    label: "Lettre en or",
    description: `Une lettre vaut ${BONUS_LETTER_SCORE} pts`,
    bonusLetterScore: BONUS_LETTER_SCORE,
    bonusLetterMinWords: BONUS_LETTER_MIN_WORDS,
    disableBonuses: true,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildTournamentSpecials(roomConfig) {
  const specials = new Map();
  const factories = [
    (round) => buildSpeedTournamentPlan(round, roomConfig),
    (round) => buildMonstrousTournamentPlan(round, roomConfig),
    (round) => buildTargetLongTournamentPlan(round, roomConfig),
    (round) => buildTargetScoreTournamentPlan(round, roomConfig),
    (round) => buildBonusLetterTournamentPlan(round, roomConfig),
  ];
  for (const round of TOURNAMENT_SPECIAL_ROUNDS) {
    const pick = factories[Math.floor(Math.random() * factories.length)];
    specials.set(round, pick(round));
  }
  return specials;
}

function createTournamentState(roomConfig) {
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    currentRound: 0,
    totalRounds: TOURNAMENT_TOTAL_ROUNDS,
    specials: buildTournamentSpecials(roomConfig),
    totals: new Map(), // nick -> { points, gobbles }
    lastAwarded: new Map(), // nick -> { points, gobbles }
    prevPositions: new Map(), // nick -> position
    records: {
      mostWords: { count: 0, nick: null, round: null },
      bestWord: { pts: 0, nick: null, word: null, round: null },
      longestWord: { len: 0, nick: null, word: null, round: null },
    },
  };
}

function resetTournament(room) {
  room.tournament = createTournamentState(room.config);
}

function getTournamentRoundPlan(room, tournamentRound) {
  if (FORCE_BONUS_LETTER_ALL_ROUNDS) {
    return buildBonusLetterTournamentPlan(tournamentRound, room.config);
  }
  const total = room?.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
  // La manche finale n'est jamais une manche spéciale.
  if (tournamentRound === total) {
    return buildBaseTournamentPlan(tournamentRound, room.config);
  }
  const special = room?.tournament?.specials?.get(tournamentRound);
  if (special) return special;
  return buildBaseTournamentPlan(tournamentRound, room.config);
}

function buildSpecialWarning(plan) {
  if (!plan?.isSpecial) return null;
  const label = plan.label || "manche speciale";
  if (plan.type === "speed") {
    return `ATTENTION, MANCHE SPECIALE À SUIVRE : ${label} (mots fixes à ${SPEED_WORD_SCORE} pts)`;
  }
  if (plan.type === "monstrous") {
    return `ATTENTION, MANCHE SPECIALE À SUIVRE : ${label} (grosse grille à mots longs)`;
  }
  return `ATTENTION, MANCHE SPECIALE À SUIVRE : ${label}`;
}

function createRoomState(roomId, config) {
  return {
    id: roomId,
    config,
    players: new Map(), // socket.id -> { nick, token }
    currentRound: null, // { id, grid, endsAt, status, timers }
    submissions: new Map(), // roundId -> Map(nick -> { words:Set, score:number })
    chatMessages: [],
    tournament: createTournamentState(config),
    lastTournamentSummary: null,
    medals: new Map(), // nick -> { gold, silver, bronze }
    medalExpiry: new Map(), // nick -> expiresAt
    bestScoreRecord: { pts: 0, players: new Set() },
    bestLengthRecord: { len: 0, players: new Set() },
    longestPossibleRecord: { len: 0, players: new Set() },
    bestPossibleScoreRecord: { pts: 0, players: new Set() },
    bestPossibleStats: { maxLen: 0, maxPts: 0 },
    closeFightAnnounced: false,
    finalFightScheduled: null,
    endSoonTimeout: null,
    nextPreparedGrid: null,
    roundCounter: 0,
    specialWarningIssuedFor: null,
    breakState: null, // { nextStartAt, breakKind, tournament, nextSpecial }
  };
}

const rooms = new Map(
  Object.entries(ROOM_CONFIGS).map(([roomId, config]) => [
    roomId,
    createRoomState(roomId, config),
  ])
);
let botManager = null;

function getRoom(roomId) {
  return rooms.get(roomId);
}

function findPlayerByNick(room, nick) {
  for (const [id, player] of room.players.entries()) {
    if (player?.nick === nick) {
      return { id, player };
    }
  }
  return null;
}

function emitPlayers(room) {
  io.to(room.id).emit(
    "playersUpdate",
    Array.from(room.players.values()).map((p) => ({ nick: p.nick, roomId: room.id }))
  );
}

function cleanupExpiredMedals(room) {
  const now = Date.now();
  for (const [nick, expiresAt] of room.medalExpiry.entries()) {
    if (expiresAt > now) continue;
    room.medalExpiry.delete(nick);
    room.medals.delete(nick);
  }
}

function emitMedals(room) {
  cleanupExpiredMedals(room);
  const payload = {};
  for (const [nick, counts] of room.medals.entries()) {
    payload[nick] = counts;
  }
  io.to(room.id).emit("medalsUpdate", payload);
}

function addMedal(room, nick, type) {
  if (!room || !nick) return;
  const current = room.medals.get(nick) || { gold: 0, silver: 0, bronze: 0 };
  room.medals.set(nick, {
    gold: Math.min(9999, current.gold + (type === "gold" ? 1 : 0)),
    silver: Math.min(9999, current.silver + (type === "silver" ? 1 : 0)),
    bronze: Math.min(9999, current.bronze + (type === "bronze" ? 1 : 0)),
  });
  room.medalExpiry.delete(nick);
}

function emitRoomsStats() {
  const payload = Array.from(rooms.values()).map((room) => ({
    roomId: room.id,
    label: room.config.label,
    players: room.players.size,
  }));
  io.emit("roomsStats", payload);
}

function ensurePlayerInRound(room, nick) {
  if (!room.currentRound) return;
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return;
  if (!roundSubs.has(nick)) {
    roundSubs.set(nick, { words: new Set(), score: 0 });
  }
}

function broadcastProvisionalRanking(room) {
  if (!room.currentRound) return;
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return;

  const ranking = Array.from(room.players.values()).map((p) => {
    const data = roundSubs.get(p.nick) || { score: 0 };
    return { nick: p.nick, score: data.score };
  });

  ranking.sort((a, b) => b.score - a.score);

  io.to(room.id).emit("rankingUpdate", {
    roomId: room.id,
    roundId: room.currentRound.id,
    ranking: ranking.map((entry, idx) => ({
      nick: entry.nick,
      rank: idx + 1,
    })),
  });
}

function pushChatMessage(room, message) {
  room.chatMessages.push(message);
  while (room.chatMessages.length > MAX_CHAT_HISTORY) {
    room.chatMessages.shift();
  }
  io.to(room.id).emit("chat:new", message);
}

function pushAnnouncement(room, payload) {
  io.to(room.id).emit("announcement", {
    id: Date.now() + Math.random(),
    ts: Date.now(),
    roomId: room.id,
    ...payload,
  });
}

function getFullRanking(room) {
  if (!room.currentRound) return [];
  const roundSubs = room.submissions.get(room.currentRound.id) || new Map();
  const ranking = [];
  for (const [nick, data] of roundSubs.entries()) {
    ranking.push({ nick, score: data.score || 0 });
  }
  ranking.sort((a, b) => b.score - a.score);
  return ranking;
}

function computeBestPossible(grid, special = null) {
  if (!dictionary) return { maxLen: 0, maxPts: 0 };
  const solved = solveGrid(grid, dictionary, special);
  let maxLen = 0;
  let maxPts = 0;
  for (const [word, data] of solved.entries()) {
    const len = word.length;
    const pts = data?.pts || 0;
    if (len > maxLen) maxLen = len;
    if (pts > maxPts) maxPts = pts;
  }
  return { maxLen, maxPts };
}

function getSpecialScoreConfigFromPlan(plan) {
  if (plan?.type === "bonus_letter" && plan?.bonusLetter) {
    return {
      bonusLetter: plan.bonusLetter,
      bonusLetterScore: plan.bonusLetterScore || BONUS_LETTER_SCORE,
      disableBonuses: true,
    };
  }
  return null;
}

function getSpecialScoreConfig(round) {
  const plan = round?.special;
  if (plan?.type === "bonus_letter" && plan?.bonusLetter) {
    return {
      bonusLetter: plan.bonusLetter,
      bonusLetterScore: plan.bonusLetterScore || BONUS_LETTER_SCORE,
      disableBonuses: true,
    };
  }
  return null;
}

function computeWordScoreForRound(round, norm, path, defaultPts) {
  const plan = round?.special;
  if (plan?.type === "speed" && plan.fixedWordScore) {
    return plan.fixedWordScore;
  }
  if (plan?.type === "target_long" || plan?.type === "target_score") {
    return 0;
  }
  return defaultPts;
}

function submitWordForNick(room, { roundId, word, nick }) {
  if (!room) return { ok: false, error: "invalid_room" };
  if (!room.currentRound || room.currentRound.id !== roundId) {
    return { ok: false, error: "round_invalid" };
  }

  const playerEntry = nick ? findPlayerByNick(room, nick) : null;
  const resolvedNick = playerEntry?.player?.nick || nick;
  if (!resolvedNick) {
    return { ok: false, error: "not_logged_in" };
  }

  if (!word || typeof word !== "string") {
    return { ok: false, error: "empty_word" };
  }

  const normInput = normalizeWord(word);
  if (!normInput || normInput.length < 3) {
    return { ok: false, error: "invalid_word" };
  }

  const roundSpecialType = room.currentRound?.special?.type;
  const isTargetRound = roundSpecialType === "target_long" || roundSpecialType === "target_score";
  if (roundSpecialType === "target_long" || roundSpecialType === "target_score") {
    if (room.currentRound?.targetFoundAt?.has?.(resolvedNick)) {
      return { ok: false, error: "already_found" };
    }
    const target = room.currentRound?.targetWord;
    if (!target || typeof target !== "string") {
      return { ok: false, error: "invalid_word" };
    }
    if (normInput !== target) {
      return { ok: false, error: "not_target" };
    }
  }

  const scored = scoreWordOnGrid(normInput, room.currentRound.grid, getSpecialScoreConfig(room.currentRound));
  if (!scored) {
    return { ok: false, error: "invalid_word" };
  }

  const { norm, pts, path } = scored;
  const len = norm.length;
  const wordPts = computeWordScoreForRound(room.currentRound, norm, path, pts);

  const roundSubs = room.submissions.get(roundId);
  if (!roundSubs) {
    return { ok: false, error: "no_round_subs" };
  }

  let data = roundSubs.get(resolvedNick);
  if (!data) {
    data = { words: new Set(), score: 0 };
    roundSubs.set(resolvedNick, data);
  }

  if (data.words.has(norm)) {
    return { ok: false, error: "already_played" };
  }

  data.words.add(norm);
  data.score += wordPts;

  // Records du mini-tournoi
  const t = room.tournament;
  const tRound = room.currentRound?.tournamentRound || null;
  if (t && tRound) {
    const bestWord = t.records?.bestWord;
    if (bestWord && typeof wordPts === "number" && wordPts > (bestWord.pts || 0)) {
      t.records.bestWord = { pts: wordPts, nick: resolvedNick, word: norm, round: tRound };
    }

    const longestWord = t.records?.longestWord;
    if (longestWord && typeof len === "number" && len > (longestWord.len || 0)) {
      t.records.longestWord = { len, nick: resolvedNick, word: norm, round: tRound };
    }
  }

  function awardGobble(kind) {
    if (!room.currentRound) return;
    if (!resolvedNick) return;
    const specialType = room.currentRound?.special?.type;
    if (specialType === "target_long" || specialType === "target_score") return;
    if (!room.currentRound.gobbles) room.currentRound.gobbles = new Map();
    if (!room.currentRound.gobbleFlags) room.currentRound.gobbleFlags = new Map();

    const flags = room.currentRound.gobbleFlags.get(resolvedNick) || {
      score: false,
      len: false,
    };
    if (flags[kind]) return;

    const currentCount = room.currentRound.gobbles.get(resolvedNick) || 0;
    if (currentCount >= 2) return; // max 2 gobbles par manche

    flags[kind] = true;
    room.currentRound.gobbleFlags.set(resolvedNick, flags);
    room.currentRound.gobbles.set(resolvedNick, currentCount + 1);
  }

  const isSpeedRound = room.currentRound?.special?.type === "speed";
  const maxLenPossible = room.bestPossibleStats.maxLen || 0;
  const maxPtsPossible = room.bestPossibleStats.maxPts || 0;
  const isMaxPossibleLen = maxLenPossible > 0 && len === maxLenPossible;
  const isMaxPossiblePts = maxPtsPossible > 0 && wordPts === maxPtsPossible;

  // Manche "cible" : si on trouve le mot secret, on annonce + voile "bravo" (sans points bonus)
  const specialType = room.currentRound?.special?.type;
  const targetWord = room.currentRound?.targetWord;
  if (
    (specialType === "target_long" || specialType === "target_score") &&
    typeof targetWord === "string" &&
    targetWord &&
    norm === targetWord
  ) {
    if (!room.currentRound.targetFoundAt) room.currentRound.targetFoundAt = new Map();
    if (!room.currentRound.targetFoundAt.has(resolvedNick)) {
      room.currentRound.targetFoundAt.set(resolvedNick, Date.now());
      pushAnnouncement(room, {
        type: "special_target_found",
        nick: resolvedNick,
        text: `${resolvedNick} a trouve !`,
      });
      io.to(room.id).emit("specialSolved", {
        roomId: room.id,
        roundId,
        nick: resolvedNick,
        kind: specialType,
      });
    }
  }

  if (isTargetRound) {
    return { ok: true, score: data.score, wordScore: wordPts };
  }

  if (!isSpeedRound && isMaxPossiblePts) {
    if (!room.bestPossibleScoreRecord.players.has(resolvedNick)) {
      room.bestPossibleScoreRecord.players.add(resolvedNick);
      room.bestPossibleScoreRecord.pts = maxPtsPossible;
      room.bestScoreRecord.pts = Math.max(room.bestScoreRecord.pts, wordPts);
      room.bestScoreRecord.players.add(resolvedNick);
      awardGobble("score");
      pushAnnouncement(room, {
        type: "best_possible_score",
        nick: resolvedNick,
        pts: wordPts,
        word: norm,
        text: `${resolvedNick} a trouve le meilleur mot possible (${wordPts} pts)`,
      });
    }
  } else if (!isSpeedRound && wordPts >= MIN_BIG_WORD) {
    if (wordPts > room.bestScoreRecord.pts) {
      room.bestScoreRecord = { pts: wordPts, players: new Set([resolvedNick]) };
      pushAnnouncement(room, {
        type: "big_word",
        nick: resolvedNick,
        pts: wordPts,
        word: norm,
        text: `${resolvedNick} a battu le record de mot avec (${wordPts} pts)`,
      });
    } else if (
      wordPts === room.bestScoreRecord.pts &&
      !room.bestScoreRecord.players.has(resolvedNick)
    ) {
      room.bestScoreRecord.players.add(resolvedNick);
      // Égalisation seulement si on n'a pas atteint le superlatif possible
      if (!isMaxPossiblePts) {
        pushAnnouncement(room, {
          type: "big_word",
          nick: resolvedNick,
          pts: wordPts,
          word: norm,
          text: `${resolvedNick} egalise le meilleur mot avec (${wordPts} pts)`,
        });
      }
    }
  }

  if (!isSpeedRound && isMaxPossibleLen && !room.longestPossibleRecord.players.has(resolvedNick)) {
    room.longestPossibleRecord.players.add(resolvedNick);
    awardGobble("len");
    pushAnnouncement(room, {
      type: "longest_possible",
      nick: resolvedNick,
      len,
      word: norm,
      text: `${resolvedNick} a trouve le mot le plus long (${len} lettres)`,
    });
  } else if (!isSpeedRound && len >= MIN_LONG_WORD) {
    if (len > room.bestLengthRecord.len) {
      room.bestLengthRecord = { len, players: new Set([resolvedNick]) };
      pushAnnouncement(room, {
        type: "long_word",
        nick: resolvedNick,
        len,
        word: norm,
        text: `${resolvedNick} a battu le record de longueur (${len} lettres)`,
      });
    } else if (
      len === room.bestLengthRecord.len &&
      !room.bestLengthRecord.players.has(resolvedNick)
    ) {
      room.bestLengthRecord.players.add(resolvedNick);
      pushAnnouncement(room, {
        type: "long_word",
        nick: resolvedNick,
        len,
        word: norm,
        text: `${resolvedNick} egalise le mot le plus long (${len} lettres)`,
      });
    }
  }

  const ranking = getFullRanking(room);
  if (ranking.length >= 2) {
    const [a, b] = ranking;
    const diff = Math.abs((a.score || 0) - (b.score || 0));
    if (
      !room.closeFightAnnounced &&
      Number.isFinite(diff) &&
      diff < 10 &&
      (a.score || 0) >= 5 &&
      (b.score || 0) >= 5
    ) {
      room.closeFightAnnounced = true;
      pushAnnouncement(room, {
        type: "duel",
        nickA: a.nick,
        nickB: b.nick,
        diff,
        text: `${a.nick} et ${b.nick} sont au coude a coude (ecart ${diff} pts)`,
      });
    }
  }

  broadcastProvisionalRanking(room);

  return { ok: true, score: data.score, wordScore: wordPts };
}

function analyzeGridQuality(grid, minWords = 0, opts = {}) {
  if (!dictionary) {
    return {
      ok: minWords <= 0,
      words: 0,
      maxLen: 0,
      maxPts: 0,
      totalPts: 0,
      longWords: 0,
    };
  }

  const solved = solveGrid(grid, dictionary);
  let maxLen = 0;
  let maxPts = 0;
  let totalPts = 0;
  let longWords = 0;
  const minLongWordLen = Math.max(0, opts?.minLongWordLen || 0);

  for (const [word, data] of solved.entries()) {
    const len = word.length;
    const pts = data?.pts || 0;
    if (len > maxLen) maxLen = len;
    if (pts > maxPts) maxPts = pts;
    totalPts += pts;
    if (minLongWordLen > 0 && len >= minLongWordLen) {
      longWords++;
    }
  }

  return {
    ok: minWords <= 0 || solved.size >= minWords,
    words: solved.size,
    maxLen,
    maxPts,
    totalPts,
    longWords,
  };
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

function pickBonusLetter(grid, solved, minWords) {
  if (!grid || !solved || solved.size === 0) return null;
  const entries = [];
  const seen = new Set();
  for (const cell of grid) {
    const key = normalizeLetterKey(cell.letter);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, letter: cell.letter });
  }
  if (entries.length === 0) return null;
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  for (const entry of entries) {
    let count = 0;
    for (const word of solved.keys()) {
      if (word.includes(entry.key)) {
        count += 1;
        if (count >= minWords) break;
      }
    }
    if (count >= minWords) return entry.letter;
  }
  return null;
}

function prepareNextGrid(room, plan = null, targetRoundNumber = null) {
  const roundNumber = targetRoundNumber || (room.roundCounter || 0) + 1;
  const roundPlan = plan || getRoundPlan(roundNumber, room.config);
  const minWords = roundPlan?.minWords ?? room.config?.minWords ?? 0;
  const maxAttempts = Math.max(
    1,
    roundPlan?.qualityAttempts || room.config?.qualityAttempts || MAX_QUALITY_ATTEMPTS
  );
  const size = room.config.gridSize;
  const effectiveMinWords = dictionary ? minWords : 0;
  const qualityOpts = { minLongWordLen: roundPlan?.minLongWordLen || 0 };

  if (minWords > 0 && !dictionary) {
    console.warn(`[${room.id}] Impossible de valider un minimum de mots (dico manquant)`);
  }

  const startedAt = Date.now();
  let bestCandidate = null;

  const pickTargetFromSolved = (solved, type) => {
    if (!solved || solved.size === 0) return null;

    if (type === "target_long") {
      let maxLen = 0;
      for (const w of solved.keys()) {
        if (w.length > maxLen) maxLen = w.length;
      }
      if (maxLen < TARGET_LONG_MIN_LEN) return null;
      const maxWords = [];
      for (const w of solved.keys()) {
        if (w.length === maxLen) maxWords.push(w);
        if (maxWords.length > 1) return null;
      }
      return { word: maxWords[0], length: maxLen };
    }

    if (type === "target_score") {
      let maxPts = 0;
      for (const data of solved.values()) {
        const pts = data?.pts || 0;
        if (pts > maxPts) maxPts = pts;
      }
      if (maxPts < TARGET_SCORE_MIN_PTS) return null;
      const maxWords = [];
      for (const [w, data] of solved.entries()) {
        const pts = data?.pts || 0;
        if (pts === maxPts) maxWords.push(w);
        if (maxWords.length > 1) return null;
      }
      return { word: maxWords[0], pts: maxPts };
    }

    return null;
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let grid = generateGrid(size);
    if (roundPlan?.type === "speed" || roundPlan?.type === "target_long" || roundPlan?.type === "bonus_letter") {
      // Manche rapidité et "mot le plus long" : pas de tuiles bonus
      grid = grid.map((cell) => ({ ...cell, bonus: null }));
    }
    const quality = analyzeGridQuality(grid, effectiveMinWords, qualityOpts);
    quality.possibleScore = roundPlan?.fixedWordScore
      ? (quality.words || 0) * roundPlan.fixedWordScore
      : quality.totalPts;

    const minLongWords = roundPlan?.minLongWordCount || 0;
    let ok = quality.ok;
    if (roundPlan?.type === "speed") {
      ok = ok && quality.words >= (roundPlan.minWords || 0);
    } else if (roundPlan?.type === "monstrous") {
      const minTotal = roundPlan?.minTotalScore || 0;
      const minLen = roundPlan?.minLongWordLen || 0;
      ok =
        ok &&
        quality.possibleScore >= minTotal &&
        quality.maxLen >= minLen &&
        quality.longWords >= minLongWords;
    } else if (roundPlan?.type === "target_long" || roundPlan?.type === "target_score" || roundPlan?.type === "bonus_letter") {
      ok = ok && !!dictionary;
    }
    quality.ok = ok;

    let targetWord = null;
    let targetLength = null;
    let bonusLetter = null;
    let solved = null;
    if (
      dictionary &&
      (roundPlan?.type === "target_long" ||
        roundPlan?.type === "target_score" ||
        roundPlan?.type === "bonus_letter")
    ) {
      solved = solveGrid(grid, dictionary);
    }

    if (solved && (roundPlan?.type === "target_long" || roundPlan?.type === "target_score")) {
      const target = pickTargetFromSolved(solved, roundPlan.type);
      if (target?.word) {
        targetWord = target.word;
        targetLength = target.length || target.word.length;
      }
      quality.ok = quality.ok && !!targetWord;
    }

    if (solved && roundPlan?.type === "bonus_letter") {
      const minLetterWords = roundPlan?.bonusLetterMinWords || BONUS_LETTER_MIN_WORDS;
      bonusLetter = pickBonusLetter(grid, solved, minLetterWords);
      quality.ok = quality.ok && !!bonusLetter;
    }

    const planForRound = bonusLetter
      ? {
          ...roundPlan,
          bonusLetter,
          bonusLetterScore: roundPlan?.bonusLetterScore || BONUS_LETTER_SCORE,
          disableBonuses: true,
        }
      : roundPlan;

    const candidate = { grid, quality, plan: planForRound, roundNumber, targetWord, targetLength };

    const currentScore =
      (quality?.words || 0) + (quality?.possibleScore || 0) / 500 + (quality?.longWords || 0);
    const bestScore =
      (bestCandidate?.quality?.words || 0) +
      (bestCandidate?.quality?.possibleScore || 0) / 500 +
      (bestCandidate?.quality?.longWords || 0);

    if (!bestCandidate || currentScore > bestScore) {
      bestCandidate = candidate;
    }

    if (quality.ok) {
      bestCandidate = candidate;
      break;
    }
  }

  room.nextPreparedGrid = { ...bestCandidate, plan: bestCandidate?.plan || roundPlan, roundNumber };

  const wordsInfo =
    dictionary && minWords
      ? `${bestCandidate?.quality?.words ?? 0}/${minWords} mots`
      : bestCandidate?.quality?.words ?? "n/a";
  const planLabel = roundPlan?.label || "manche";
  console.log(
    `[${room.id}] Grille prechargee ${roundPlan?.isSpecial ? "(speciale)" : ""} ${planLabel} #${
      roundNumber
    } (${wordsInfo}) en ${Date.now() - startedAt}ms`
  );

  return bestCandidate;
}

function resetRoomRecords(room) {
  room.bestScoreRecord = { pts: 0, players: new Set() };
  room.bestLengthRecord = { len: 0, players: new Set() };
  room.longestPossibleRecord = { len: 0, players: new Set() };
  room.bestPossibleScoreRecord = { pts: 0, players: new Set() };
  room.bestPossibleStats = { maxLen: 0, maxPts: 0 };
  room.closeFightAnnounced = false;
  room.finalFightScheduled = null;
  room.endSoonTimeout = null;
}

function startRoundForRoom(room) {
  if (!room) return;
  room.breakState = null;

  if (room.currentRound?.timers) {
    room.currentRound.timers.forEach((t) => clearTimeout(t));
  }
  if (room.endSoonTimeout) clearTimeout(room.endSoonTimeout);
  if (room.finalFightScheduled) clearTimeout(room.finalFightScheduled);

  const roundNumber = (room.roundCounter || 0) + 1;

  if (!room.tournament) {
    resetTournament(room);
  }
  let tournamentRound = (room.tournament.currentRound || 0) + 1;
  if (tournamentRound > (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS)) {
    resetTournament(room);
    tournamentRound = 1;
  }

  const tournamentPlan = getTournamentRoundPlan(room, tournamentRound);
  const cached = room.nextPreparedGrid?.roundNumber === roundNumber ? room.nextPreparedGrid : null;
  const prepared = cached || prepareNextGrid(room, tournamentPlan, roundNumber);
  if (room.nextPreparedGrid?.roundNumber === roundNumber) {
    room.nextPreparedGrid = null;
  }
  const grid = prepared?.grid || generateGrid(room.config.gridSize);
  const quality = prepared?.quality;
  const planUsed = prepared?.plan || tournamentPlan;
  const now = Date.now();
  const roundId = now;
  const roundDurationMs =
    planUsed?.type === "target_long" || planUsed?.type === "target_score"
      ? 90 * 1000
      : room.config.durationMs;

  if (botManager?.refreshPresenceForRoom) {
    botManager.refreshPresenceForRoom(room);
  }

  room.currentRound = {
    id: roundId,
    grid,
    endsAt: now + roundDurationMs,
    durationMs: roundDurationMs,
    status: "running",
    timers: [],
    special: planUsed,
    quality,
    roundNumber,
    tournamentId: room.tournament.id,
    tournamentRound,
    targetWord: prepared?.targetWord || null,
    targetLength: prepared?.targetLength || null,
    targetRevealed: new Set(),
    targetSolvedBy: null,
    gobbles: new Map(),
    gobbleFlags: new Map(),
  };

  const roundSubs = new Map();
  for (const p of room.players.values()) {
    roundSubs.set(p.nick, { words: new Set(), score: 0 });
  }
  room.submissions.set(roundId, roundSubs);

  resetRoomRecords(room);
  room.roundCounter = roundNumber;
  room.tournament.currentRound = tournamentRound;
  room.bestPossibleStats =
    quality && dictionary
      ? {
          maxLen: quality.maxLen || 0,
          maxPts: planUsed?.fixedWordScore || quality.maxPts || 0,
        }
      : computeBestPossible(grid);
  if (planUsed?.fixedWordScore) {
    room.bestPossibleStats.maxPts = planUsed.fixedWordScore;
  }

  const nextTournamentRound =
    tournamentRound >= (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS)
      ? 1
      : tournamentRound + 1;
  const nextPlan =
    nextTournamentRound === 1 && tournamentRound >= (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS)
      ? buildBaseTournamentPlan(1, room.config)
      : getTournamentRoundPlan(room, nextTournamentRound);

  console.log(
    `[${room.id}] Nouvelle manche ${planUsed?.isSpecial ? "(speciale)" : ""}`,
    roundId,
    planUsed?.label || ""
  );

  io.to(room.id).emit("roundStarted", {
    roomId: room.id,
    roundId,
    grid,
    gridSize: room.config.gridSize,
    durationMs: room.currentRound.durationMs,
    endsAt: room.currentRound.endsAt,
    special: planUsed?.isSpecial ? planUsed : null,
    gridQuality: quality
      ? {
          words: quality.words ?? 0,
          maxLen: quality.maxLen ?? 0,
          maxPts: planUsed?.fixedWordScore || quality.maxPts || 0,
          totalPts: quality.totalPts ?? 0,
          possibleScore: quality.possibleScore ?? quality.totalPts ?? 0,
          longWords: quality.longWords ?? 0,
        }
      : null,
    roundNumber,
    tournament: {
      id: room.tournament.id,
      round: tournamentRound,
      totalRounds: room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      isFinalRound: tournamentRound === (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS),
      nextRound: nextTournamentRound,
      nextStartsNewTournament:
        tournamentRound === (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS),
    },
    nextSpecial: nextPlan?.isSpecial ? nextPlan : null,
  });

  broadcastProvisionalRanking(room);

  // IMPORTANT: doit venir APRES "roundStarted", car le client purge son flux a la reception.
  if (
    nextPlan?.isSpecial &&
    !planUsed?.isSpecial &&
    room.specialWarningIssuedFor !== `${room.tournament.id}:${nextPlan.roundNumber}`
  ) {
    const warnText = buildSpecialWarning(nextPlan);
    if (warnText) {
      pushAnnouncement(room, { type: "special_warning", text: warnText });
      room.specialWarningIssuedFor = `${room.tournament.id}:${nextPlan.roundNumber}`;
    }
  }

  if (planUsed?.isSpecial) {
    const specialText =
      planUsed.type === "speed"
        ? `MANCHE SPECIALE : ${planUsed.label} - tous les mots valent ${planUsed.fixedWordScore} pts`
        : planUsed.type === "monstrous"
        ? `MANCHE SPECIALE : ${planUsed.label} - gros potentiel de points et de mots longs`
        : planUsed.type === "target_long"
        ? `MANCHE SPECIALE : ${planUsed.label} - objectif: trouver le mot le plus long`
        : planUsed.type === "target_score"
        ? `MANCHE SPECIALE : ${planUsed.label} - objectif: trouver le mot qui rapporte le plus de points`
        : `MANCHE SPECIALE : ${planUsed.label}`;
    pushAnnouncement(room, { type: "special_start", text: specialText });
  }

  // Système d'indices pour les manches "cible"
  if (
    planUsed?.isSpecial &&
    (planUsed.type === "target_long" || planUsed.type === "target_score") &&
    typeof room.currentRound.targetWord === "string" &&
    room.currentRound.targetWord
  ) {
    pushAnnouncement(room, {
      type: "special_hint_soon",
      text: `Indice dans ${TARGET_HINT_FIRST_MS / 1000} secondes...`,
    });

    const emitHint = () => {
      if (!room.currentRound || room.currentRound.id !== roundId) return;
      const word = room.currentRound.targetWord || "";
      const revealed = room.currentRound.targetRevealed || new Set();
      const chars = word.split("");
      const pattern = chars
        .map((ch, idx) => (revealed.has(idx) ? ch.toUpperCase() : "_"))
        .join(" ");
      io.to(room.id).emit("specialHint", {
        roomId: room.id,
        roundId,
        kind: planUsed.type,
        length: chars.length,
        pattern,
      });
    };

    room.currentRound.timers.push(setTimeout(emitHint, TARGET_HINT_FIRST_MS));

    // À partir de 40s : révèle 1 lettre toutes les 20s
    for (
      let tMs = TARGET_HINT_FIRST_MS + TARGET_HINT_STEP_MS;
      tMs < roundDurationMs;
      tMs += TARGET_HINT_STEP_MS
    ) {
      room.currentRound.timers.push(
        setTimeout(() => {
          if (!room.currentRound || room.currentRound.id !== roundId) return;
          const word = room.currentRound.targetWord || "";
          const chars = word.split("");
          const revealed = room.currentRound.targetRevealed || new Set();
          if (revealed.size >= chars.length) return;

          const remaining = [];
          for (let i = 0; i < chars.length; i++) {
            if (!revealed.has(i)) remaining.push(i);
          }
          if (!remaining.length) return;
          const idx = remaining[Math.floor(Math.random() * remaining.length)];
          revealed.add(idx);
          room.currentRound.targetRevealed = revealed;
          emitHint();
        }, tMs)
      );
    }
  }

  if (botManager?.onRoundStart) {
    const botKickoffRoundId = roundId;
    const kickoff = setTimeout(() => {
      if (!room.currentRound || room.currentRound.id !== botKickoffRoundId) return;
      botManager.onRoundStart(room);
    }, 1500);
    room.currentRound.timers.push(kickoff);
  }

  room.endSoonTimeout = setTimeout(() => {
    pushAnnouncement(room, {
      type: "timer",
      text: "Il ne reste plus que 30 secondes !",
    });
  }, Math.max(0, roundDurationMs - 30 * 1000));

  room.finalFightScheduled = setTimeout(() => {
    const ranking = getFullRanking(room);
    if (ranking.length >= 2) {
      const [a, b] = ranking;
      const diff = Math.abs((a.score || 0) - (b.score || 0));
      if (diff <= 50 && (a.score || 0) > 0 && (b.score || 0) > 0) {
        pushAnnouncement(room, {
          type: "duel",
          nickA: a.nick,
          nickB: b.nick,
          diff,
          text: `${a.nick} et ${b.nick} se bataillent pour la victoire !`,
        });
      }
    }
  }, Math.max(0, roundDurationMs - 20 * 1000));

  room.currentRound.timers.push(setTimeout(() => endRoundForRoom(room), roundDurationMs));
}

function endRoundForRoom(room) {
  if (!room || !room.currentRound || room.currentRound.status !== "running") return;
  if (room.currentRound.timers) {
    room.currentRound.timers.forEach((t) => clearTimeout(t));
  }
  if (room.endSoonTimeout) clearTimeout(room.endSoonTimeout);
  if (room.finalFightScheduled) clearTimeout(room.finalFightScheduled);
  if (botManager?.onRoundEnd) {
    botManager.onRoundEnd(room);
  }

  room.currentRound.status = "finished";

  const roundSubs = room.submissions.get(room.currentRound.id) || new Map();
  const results = [];
  const specialType = room.currentRound?.special?.type;
  const isTargetRound = specialType === "target_long" || specialType === "target_score";
  let targetPointsMultiplier = 1;

  for (const player of room.players.values()) {
    if (!roundSubs.has(player.nick)) {
      roundSubs.set(player.nick, { words: new Set(), score: 0 });
    }
  }

  for (const [nick, data] of roundSubs.entries()) {
    results.push({
      nick,
      score: data.score,
      words: Array.from(data.words),
    });
  }

  results.sort((a, b) => b.score - a.score);

  console.log(`[${room.id}] Manche terminée`, room.currentRound.id, "Résultats:", results);

  // --- Mini-tournoi : attribution points & finale ---
  const tournamentRound = room.currentRound.tournamentRound || 1;
  const tournamentId = room.currentRound.tournamentId || room.tournament?.id || null;
  const t = room.tournament;
  const roundAwarded = new Map(); // nick -> { points, gobbles, total }

  if (t && tournamentId && t.id === tournamentId) {
    const isFinalRound = tournamentRound === (t.totalRounds || TOURNAMENT_TOTAL_ROUNDS);
    const pointsMultiplier = isFinalRound ? 2 : 1;
    targetPointsMultiplier = pointsMultiplier;
    for (const entry of results) {
      if (!t.totals.has(entry.nick)) t.totals.set(entry.nick, { points: 0, gobbles: 0 });
    }

    const roundGobbles = room.currentRound.gobbles || new Map();

    if (isTargetRound) {
      const foundAt = room.currentRound.targetFoundAt || new Map();
      const foundOrder = Array.from(foundAt.entries())
        .map(([nick, ts]) => ({ nick, ts }))
        .sort((a, b) => {
          const d = (a.ts || 0) - (b.ts || 0);
          if (d !== 0) return d;
          return (a.nick || "").localeCompare(b.nick || "");
        })
        .map((e) => e.nick);

      for (let pos = 1; pos <= foundOrder.length; pos++) {
        const nick = foundOrder[pos - 1];
        const basePts = (TOURNAMENT_POINTS[pos - 1] ?? 0) * pointsMultiplier;
        const gobbles = 0;
        const totalEarned = basePts;
        roundAwarded.set(nick, { points: basePts, gobbles, total: totalEarned });
        t.lastAwarded.set(nick, { points: basePts, gobbles });
        const prev = t.totals.get(nick) || { points: 0, gobbles: 0 };
        t.totals.set(nick, { points: (prev.points || 0) + basePts, gobbles: prev.gobbles || 0 });
      }
    } else {
      let pos = 1;
      for (let i = 0; i < results.length; ) {
        const scoreVal = results[i]?.score ?? 0;
        const tieGroup = [];
        while (i < results.length && (results[i]?.score ?? 0) === scoreVal) {
          tieGroup.push(results[i]);
          i++;
        }

        const basePts = (TOURNAMENT_POINTS[pos - 1] ?? 0) * pointsMultiplier;
        for (const entry of tieGroup) {
          const gobbles = roundGobbles.get(entry.nick) || 0;
          const totalEarned = basePts + gobbles;

          roundAwarded.set(entry.nick, { points: basePts, gobbles, total: totalEarned });
          t.lastAwarded.set(entry.nick, { points: basePts, gobbles });

          const prev = t.totals.get(entry.nick) || { points: 0, gobbles: 0 };
          t.totals.set(entry.nick, {
            points: (prev.points || 0) + basePts,
            gobbles: (prev.gobbles || 0) + gobbles,
          });
        }

        pos += tieGroup.length;
      }
    }

    for (const entry of results) {
      const count = Array.isArray(entry.words) ? entry.words.length : 0;
      if (count > (t.records?.mostWords?.count || 0)) {
        t.records.mostWords = { count, nick: entry.nick, round: tournamentRound };
      }
    }
  }

  if (isTargetRound) {
    const foundAt = room.currentRound.targetFoundAt || new Map();
    const startedAt =
      (room.currentRound.endsAt || Date.now()) -
      (room.currentRound.durationMs || room.config.durationMs || 0);
    const foundList = Array.from(foundAt.entries())
      .map(([nick, ts]) => ({ nick, ts }))
      .sort((a, b) => {
        const d = (a.ts || 0) - (b.ts || 0);
        if (d !== 0) return d;
        return (a.nick || "").localeCompare(b.nick || "");
      });
    const foundMeta = new Map();
    foundList.forEach((entry, idx) => {
      const points = (TOURNAMENT_POINTS[idx] ?? 0) * targetPointsMultiplier;
      foundMeta.set(entry.nick, {
        points,
        ts: entry.ts,
        elapsedMs: Math.max(0, (entry.ts || 0) - startedAt),
      });
    });

    const targetResults = [];
    for (const player of room.players.values()) {
      const meta = foundMeta.get(player.nick);
      targetResults.push({
        nick: player.nick,
        score: meta ? meta.points : 0,
        words: meta ? [room.currentRound.targetWord || ""] : [],
        targetFoundAt: meta ? meta.ts : null,
        targetFoundMs: meta ? meta.elapsedMs : null,
      });
    }

    targetResults.sort((a, b) => {
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
    });

    results.length = 0;
    results.push(...targetResults);
  }

  let totalRanking = [];
  if (t && tournamentId && t.id === tournamentId) {
    totalRanking = Array.from(t.totals.entries())
      .map(([nick, data]) => {
        const basePoints = data?.points || 0;
        const gobbles = data?.gobbles || 0;
        const points = basePoints + gobbles;
        return { nick, points, basePoints, gobbles };
      })
      .sort((a, b) => {
        const diff = (b.points || 0) - (a.points || 0);
        if (diff !== 0) return diff;
        const gdiff = (b.gobbles || 0) - (a.gobbles || 0);
        if (gdiff !== 0) return gdiff;
        return (a.nick || "").localeCompare(b.nick || "");
      })
      .map((entry, idx) => {
        const posNow = idx + 1;
        const prevPos = t.prevPositions.get(entry.nick);
        const delta = typeof prevPos === "number" ? prevPos - posNow : 0;
        return { ...entry, pos: posNow, delta };
      });

    t.prevPositions = new Map(totalRanking.map((e) => [e.nick, e.pos]));
  }

  let breakMs = room.config.breakMs;
  let breakKind = "between_rounds";
  let tournamentSummary = null;
  let tournamentSummaryAt = null;

  if (t && tournamentRound === (t.totalRounds || TOURNAMENT_TOTAL_ROUNDS)) {
    breakMs = TOURNAMENT_END_TOTAL_BREAK_MS;
    breakKind = "tournament_end";
    tournamentSummaryAt = Date.now() + TOURNAMENT_RESULTS_BREAK_MS;

    const winnerNick = totalRanking[0]?.nick || null;
    tournamentSummary = {
      id: t.id,
      winnerNick,
      ranking: totalRanking,
      records: t.records,
    };

    addMedal(room, totalRanking[0]?.nick, "gold");
    addMedal(room, totalRanking[1]?.nick, "silver");
    addMedal(room, totalRanking[2]?.nick, "bronze");
    emitMedals(room);

    resetTournament(room);
  }

  const nextStartAt = Date.now() + breakMs;
  const nextTournamentRoundForBreak = breakKind === "tournament_end" ? 1 : tournamentRound + 1;
  const nextPlanForBreak =
    breakKind === "tournament_end" ? null : getTournamentRoundPlan(room, nextTournamentRoundForBreak);
  const nextSpecialForBreak = nextPlanForBreak?.isSpecial ? nextPlanForBreak : null;
  io.to(room.id).emit("breakStarted", {
    roomId: room.id,
    nextStartAt,
    breakKind,
    tournament: {
      id: room.tournament?.id || null,
      round: room.tournament?.currentRound || 0,
      totalRounds: room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      nextRound: nextTournamentRoundForBreak,
    },
    nextSpecial: nextSpecialForBreak,
    tournamentSummary,
    tournamentSummaryAt,
  });
  room.breakState = {
    nextStartAt,
    breakKind,
    tournament: {
      id: room.tournament?.id || null,
      round: room.tournament?.currentRound || 0,
      totalRounds: room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      nextRound: nextTournamentRoundForBreak,
    },
    nextSpecial: nextSpecialForBreak,
    tournamentSummary,
    tournamentSummaryAt,
  };

  io.to(room.id).emit("roundEnded", {
    roomId: room.id,
    roundId: room.currentRound.id,
    results,
    tournament: {
      id: tournamentId,
      round: tournamentRound,
      totalRounds: t?.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      nextRound: nextTournamentRoundForBreak,
      roundAwarded: Object.fromEntries(roundAwarded.entries()),
      totals: t
        ? Object.fromEntries(
            Array.from(t.totals.entries()).map(([nick, data]) => [
              nick,
              { points: data?.points || 0, gobbles: data?.gobbles || 0 },
            ])
          )
        : {},
      ranking: totalRanking,
      breakKind,
    },
    nextSpecial: nextSpecialForBreak,
    tournamentSummary,
    tournamentSummaryAt,
  });

  const nextRoundNumber = (room.roundCounter || 0) + 1;
  const nextTournamentRound =
    breakKind === "tournament_end"
      ? 1
      : Math.min(TOURNAMENT_TOTAL_ROUNDS, tournamentRound + 1);
  const nextPlan = getTournamentRoundPlan(room, nextTournamentRound);
  setTimeout(() => {
    const alreadyPrepared =
      room.nextPreparedGrid && room.nextPreparedGrid.roundNumber === nextRoundNumber;
    if (!alreadyPrepared) {
      prepareNextGrid(room, nextPlan, nextRoundNumber);
    }
  }, 0);
  setTimeout(() => startRoundForRoom(room), breakMs);
}

io.on("connection", (socket) => {
  console.log("Client connecté", socket.id);
  emitRoomsStats();

  socket.on("timeSync", (_payload, cb) => {
    cb?.({ ok: true, serverNow: Date.now() });
  });

  socket.on("login", (payload, cb) => {
    const nick = typeof payload === "string" ? payload : payload?.nick;
    const token = typeof payload === "object" ? payload?.clientId : null;
    const requestedRoomId =
      typeof payload === "object" && payload?.roomId
        ? payload.roomId
        : "room-4x4";
    const room = getRoom(requestedRoomId);

    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }

    const trimmed = (nick || "").trim();
    if (!trimmed) {
      cb?.({ ok: false, error: "empty_nick" });
      return;
    }

    if (trimmed.length > NICK_MAX_LEN) {
      cb?.({ ok: false, error: "nick_too_long" });
      return;
    }

    const now = Date.now();
    for (const p of room.players.values()) {
      if (p.nick === trimmed) {
        cb?.({ ok: false, error: "pseudo_taken" });
        return;
      }
    }

    // Réservation de pseudo désactivée (trop gênant sur mobile lors des retours d'appli)
    cleanupExpiredMedals(room);
    room.medalExpiry.delete(trimmed);

    room.players.set(socket.id, { nick: trimmed, token: token || null });
    socket.roomId = room.id;
    socket.join(room.id);
    console.log("Login:", socket.id, trimmed, "->", room.id);
    appendConnectionLog({
      nick: trimmed,
      roomId: room.id,
      ip: getClientIpFromSocket(socket),
      userAgent: socket?.handshake?.headers?.["user-agent"],
    });
    cb?.({ ok: true, roomId: room.id });

    emitPlayers(room);
    emitMedals(room);
    emitRoomsStats();
    socket.emit("chat:history", room.chatMessages);

    if (room.currentRound && room.currentRound.status === "running") {
      ensurePlayerInRound(room, trimmed);
      const currentQuality = room.currentRound.quality;

      const totalRounds = room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
      const currentTournamentRound = room.currentRound.tournamentRound || 1;
      const nextTournamentRound =
        currentTournamentRound >= totalRounds ? 1 : currentTournamentRound + 1;
      const nextPlan = getTournamentRoundPlan(room, nextTournamentRound);

      socket.emit("roundStarted", {
        roomId: room.id,
        roundId: room.currentRound.id,
        grid: room.currentRound.grid,
        gridSize: room.config.gridSize,
        durationMs: room.currentRound.durationMs,
        endsAt: room.currentRound.endsAt,
        special: room.currentRound.special?.isSpecial ? room.currentRound.special : null,
        gridQuality: currentQuality
          ? {
              words: currentQuality.words ?? 0,
              maxLen: currentQuality.maxLen ?? 0,
              maxPts:
                room.currentRound.special?.fixedWordScore ||
                currentQuality.maxPts ||
                0,
              totalPts: currentQuality.totalPts ?? 0,
              possibleScore: currentQuality.possibleScore ?? currentQuality.totalPts ?? 0,
              longWords: currentQuality.longWords ?? 0,
            }
          : null,
        roundNumber: room.currentRound.roundNumber,
        tournament: {
          id: room.tournament?.id || null,
          round: currentTournamentRound,
          totalRounds,
          isFinalRound: currentTournamentRound === totalRounds,
          nextRound: nextTournamentRound,
          nextStartsNewTournament: currentTournamentRound === totalRounds,
        },
        nextSpecial: nextPlan?.isSpecial ? nextPlan : null,
      });

      // Si on rejoint en cours de manche "cible", renvoyer l'etat courant de l'indice
      // (sinon le joueur ne verra le pattern qu'au hint suivant).
      const specialType = room.currentRound?.special?.type;
      const isTargetRound = specialType === "target_long" || specialType === "target_score";
      if (isTargetRound && typeof room.currentRound.targetWord === "string" && room.currentRound.targetWord) {
        const startedAt =
          (room.currentRound.endsAt || Date.now()) -
          (room.currentRound.durationMs || room.config.durationMs || 0);
        const elapsed = Date.now() - startedAt;
        if (elapsed >= TARGET_HINT_FIRST_MS) {
          const word = room.currentRound.targetWord || "";
          const revealed = room.currentRound.targetRevealed || new Set();
          const chars = word.split("");
          const pattern = chars
            .map((ch, idx) => (revealed.has(idx) ? ch.toUpperCase() : "_"))
            .join(" ");
          socket.emit("specialHint", {
            roomId: room.id,
            roundId: room.currentRound.id,
            kind: specialType,
            length: chars.length,
            pattern,
          });
        }
      }
      broadcastProvisionalRanking(room);
    } else if (room.breakState && typeof room.breakState.nextStartAt === "number") {
      socket.emit("breakStarted", {
        roomId: room.id,
        nextStartAt: room.breakState.nextStartAt,
        breakKind: room.breakState.breakKind,
        tournament: room.breakState.tournament,
        nextSpecial: room.breakState.nextSpecial || null,
        tournamentSummary: room.breakState.tournamentSummary || null,
        tournamentSummaryAt: room.breakState.tournamentSummaryAt || null,
      });
    }
  });

  socket.on("chat:send", (text, cb) => {
    const room = getRoom(socket.roomId);
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    if (typeof text !== "string") {
      cb?.({ ok: false });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      cb?.({ ok: false });
      return;
    }
    const player = room.players.get(socket.id);
    if (!player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const message = {
      id: Date.now() + Math.random(),
      author: player.nick,
      text: trimmed,
    };
    pushChatMessage(room, message);
    cb?.({ ok: true });
  });

  socket.on("submitWord", ({ roundId, word }, cb) => {
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    const result = submitWordForNick(room, {
      roundId,
      word,
      nick: player?.nick,
    });
    cb?.(result);
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    room.players.delete(socket.id);
    const now = Date.now();
    if (player?.nick) {
      room.medalExpiry.set(player.nick, now + MEDALS_TTL_AFTER_DISCONNECT_MS);
    }
    console.log("Client déconnecté", socket.id, player?.nick, "from", room.id);
    emitPlayers(room);
    emitMedals(room);
    broadcastProvisionalRanking(room);
    emitRoomsStats();
  });
});

botManager = createBotManager({
  rooms,
  dictionary,
  solveGrid,
  ensurePlayerInRound,
  submitWordForNick,
  emitPlayers,
  emitMedals,
  broadcastProvisionalRanking,
});

const PORT = 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on *:${PORT}`);
});

rooms.forEach((room) => startRoundForRoom(room));


























