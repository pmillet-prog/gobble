import { normalizeWord } from "../gameLogic.js";
import { clampValue } from "../../utils/numbers.js";

export const DAILY_SPECIAL_BONUSES = ["L2", "L3", "M2", "M3"];
export const DAILY_SPECIAL_WORD_TARGET = 3;

export function normalizeBonusLabel(bonus) {
  if (bonus === "W2") return "M2";
  if (bonus === "W3") return "M3";
  return bonus;
}

export function createDailySpecialPlacements() {
  return { L2: null, L3: null, M2: null, M3: null };
}

export function createDailyWordSlots() {
  return Array.from({ length: DAILY_SPECIAL_WORD_TARGET }, (_, index) => ({
    id: index,
    word: "",
    display: "",
    path: [],
  }));
}

export function getDailyActiveSlotIndex(slots, preferredIndex = 0) {
  const list = Array.isArray(slots) ? slots : [];
  const safePreferred = clampValue(
    Number.isFinite(preferredIndex) ? preferredIndex : 0,
    0,
    Math.max(0, DAILY_SPECIAL_WORD_TARGET - 1)
  );
  if (list[safePreferred] && !list[safePreferred].word) {
    return safePreferred;
  }
  const firstEmpty = list.findIndex((slot) => !String(slot?.word || "").trim());
  return firstEmpty >= 0 ? firstEmpty : safePreferred;
}

export function getDailySpecialWordStartTile(path) {
  const first = Array.isArray(path) ? Number(path[0]) : NaN;
  return Number.isInteger(first) && first >= 0 ? first : null;
}

export function getDailySpecialWordBlockedReason(word, path, slots, targetSlot) {
  const normalized = normalizeWord(String(word || ""));
  if (!normalized || normalized.length < 2) return "";
  const startTile = getDailySpecialWordStartTile(path);
  if (startTile == null) return "";
  const hasSameStartTile = (Array.isArray(slots) ? slots : []).some(
    (slot, index) =>
      index !== targetSlot && getDailySpecialWordStartTile(slot?.path) === startTile
  );
  return hasSameStartTile ? "Première tuile déjà utilisée" : "";
}

export function stripBoardBonuses(board) {
  if (!Array.isArray(board)) return [];
  return board.map((cell) => ({ ...(cell || {}), bonus: null }));
}

export function applyDailySpecialPlacements(board, placements) {
  const nextBoard = stripBoardBonuses(board);
  const occupied = new Set();
  for (const bonus of DAILY_SPECIAL_BONUSES) {
    const index = Number.isInteger(placements?.[bonus]) ? placements[bonus] : null;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= nextBoard.length ||
      occupied.has(index) ||
      !nextBoard[index]
    ) {
      continue;
    }
    occupied.add(index);
    nextBoard[index] = { ...nextBoard[index], bonus };
  }
  return nextBoard;
}

export function getEffectiveDailySpecialPlacements(basePlacements, dragState, boardLength) {
  const placements = {
    ...(basePlacements && typeof basePlacements === "object" ? basePlacements : {}),
  };
  if (!dragState || typeof dragState !== "object") return placements;
  const bonusKey = typeof dragState.bonusKey === "string" ? dragState.bonusKey : "";
  if (!bonusKey) return placements;
  const hoverIndex = Number.isInteger(dragState.hoverIndex) ? dragState.hoverIndex : null;
  placements[bonusKey] = null;
  if (
    !Number.isInteger(hoverIndex) ||
    hoverIndex < 0 ||
    hoverIndex >= (Number.isFinite(boardLength) ? boardLength : 0)
  ) {
    return placements;
  }
  for (const otherBonus of DAILY_SPECIAL_BONUSES) {
    if (otherBonus !== bonusKey && placements[otherBonus] === hoverIndex) {
      placements[otherBonus] = null;
    }
  }
  placements[bonusKey] = hoverIndex;
  return placements;
}
