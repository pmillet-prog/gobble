import { useEffect } from "react";
import { clampValue } from "../../utils/numbers.js";
import {
  DAILY_SPECIAL_BONUSES,
  DAILY_SPECIAL_WORD_TARGET,
  createDailyWordSlots,
} from "./dailySpecialModel.js";

export default function useDailySpecialInteraction(
  setDailyWordSlots,
  isLiveSpecial3WordsMode,
  syncLiveSpecial3WordsState,
  dailySpecialPlacements,
  setDailyActiveSlot,
  setDailyInvalidSlot,
  clearSelection,
  tileRefs,
  isSpecial3WordsMode,
  phase,
  requestAudioUnlock,
  dailySpecialDragRef,
  setDailySpecialDrag,
  dailySpecialDrag,
  board,
  playDailySpecialLockValidationSound,
  setDailySpecialPlacements,
  setDailyLockPulseKey,
  dailyWordSlots
) {
function clearDailyWordSlot(slotIndex) {
  const safeIndex = clampValue(
    Number(slotIndex),
    0,
    Math.max(0, DAILY_SPECIAL_WORD_TARGET - 1)
  );
  setDailyWordSlots((prev) => {
    const next = Array.isArray(prev) ? prev.map((slot) => ({ ...slot })) : createDailyWordSlots();
    if (!next[safeIndex]) {
      next[safeIndex] = { id: safeIndex, word: "", display: "", path: [] };
    } else {
      next[safeIndex] = {
        ...next[safeIndex],
        word: "",
        display: "",
        path: [],
      };
    }
    if (isLiveSpecial3WordsMode) {
      syncLiveSpecial3WordsState(next, dailySpecialPlacements);
    }
    return next;
  });
  setDailyActiveSlot(safeIndex);
  setDailyInvalidSlot(null);
  clearSelection();
}

function animateDailySpecialLock(tileIndex) {
  if (!Number.isInteger(tileIndex) || tileIndex < 0) return;
  const tileEl = tileRefs.current?.[tileIndex];
  if (!tileEl) return;
  try {
    if (typeof tileEl.animate === "function") {
      tileEl.animate(
        [
          {
            transform: "scale(1)",
            boxShadow: "0 0 0 0 rgba(16,185,129,0)",
            filter: "brightness(1)",
          },
          {
            transform: "scale(1.11)",
            boxShadow: "0 0 0 10px rgba(16,185,129,0.34)",
            filter: "brightness(1.1)",
          },
          {
            transform: "scale(0.97)",
            boxShadow: "0 0 0 4px rgba(16,185,129,0.2)",
            filter: "brightness(1.03)",
          },
          {
            transform: "scale(1)",
            boxShadow: "0 0 0 0 rgba(16,185,129,0)",
            filter: "brightness(1)",
          },
        ],
        {
          duration: 360,
          easing: "cubic-bezier(0.22,1,0.36,1)",
        }
      );
      return;
    }
    tileEl.classList.remove("daily-special-lock");
    void tileEl.offsetWidth;
    tileEl.classList.add("daily-special-lock");
    setTimeout(() => {
      tileEl.classList.remove("daily-special-lock");
    }, 380);
  } catch (_) {}
}

function findGridIndexFromPoint(clientX, clientY) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const refs = tileRefs.current || [];
  for (let idx = 0; idx < refs.length; idx += 1) {
    const el = refs[idx];
    const rect = el?.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) continue;
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return idx;
    }
  }
  return null;
}

function beginDailySpecialDrag(e, bonusKey) {
  if (!isSpecial3WordsMode || phase !== "playing") return;
  if (!DAILY_SPECIAL_BONUSES.includes(bonusKey)) return;
  requestAudioUnlock(e);
  const pointer = e?.nativeEvent || e;
  const x = Number(pointer?.clientX);
  const y = Number(pointer?.clientY);
  const previousIndex = Number.isInteger(dailySpecialPlacements?.[bonusKey])
    ? dailySpecialPlacements[bonusKey]
    : null;
  const nextDrag = {
    bonusKey,
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null,
    hoverIndex:
      Number.isFinite(x) && Number.isFinite(y) ? findGridIndexFromPoint(x, y) : null,
    previousIndex,
  };
  dailySpecialDragRef.current = nextDrag;
  setDailySpecialDrag(nextDrag);
  setDailySpecialPlacements((prev) => ({
    ...prev,
    [bonusKey]: null,
  }));
  if (e?.preventDefault) e.preventDefault();
  if (e?.stopPropagation) e.stopPropagation();
}

useEffect(() => {
  if (!dailySpecialDrag) return undefined;
  const onPointerMove = (evt) => {
    const drag = dailySpecialDragRef.current;
    if (!drag) return;
    const x = Number(evt?.clientX);
    const y = Number(evt?.clientY);
    const hoverIndex =
      Number.isFinite(x) && Number.isFinite(y) ? findGridIndexFromPoint(x, y) : null;
    const next = {
      ...drag,
      x: Number.isFinite(x) ? x : drag.x,
      y: Number.isFinite(y) ? y : drag.y,
      hoverIndex,
    };
    dailySpecialDragRef.current = next;
    setDailySpecialDrag(next);
  };
  const onPointerUp = (evt) => {
    const drag = dailySpecialDragRef.current;
    dailySpecialDragRef.current = null;
    setDailySpecialDrag(null);
    if (!drag) return;
    const x = Number(evt?.clientX);
    const y = Number(evt?.clientY);
    const targetIndex =
      Number.isFinite(x) && Number.isFinite(y)
        ? findGridIndexFromPoint(x, y)
        : Number.isInteger(drag.hoverIndex)
        ? drag.hoverIndex
        : null;
    setDailySpecialPlacements((prev) => {
      const next = { ...prev };
      const canPlaceOnGrid =
        Number.isInteger(targetIndex) &&
        targetIndex >= 0 &&
        targetIndex < (Array.isArray(board) ? board.length : 0);
      if (canPlaceOnGrid) {
        const overriddenBonus = DAILY_SPECIAL_BONUSES.find(
          (bonus) =>
            bonus !== drag.bonusKey &&
            Number.isInteger(next?.[bonus]) &&
            next[bonus] === targetIndex
        );
        if (overriddenBonus) {
          next[overriddenBonus] = null;
        }
        next[drag.bonusKey] = targetIndex;
        playDailySpecialLockValidationSound();
        animateDailySpecialLock(targetIndex);
        setDailyLockPulseKey((prevPulse) => prevPulse + 1);
        if (isLiveSpecial3WordsMode) {
          syncLiveSpecial3WordsState(dailyWordSlots, next);
        }
        return next;
      }
      if (Number.isInteger(drag.previousIndex)) {
        next[drag.bonusKey] = drag.previousIndex;
      } else {
        next[drag.bonusKey] = null;
      }
      if (isLiveSpecial3WordsMode) {
        syncLiveSpecial3WordsState(dailyWordSlots, next);
      }
      return next;
    });
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };
}, [dailySpecialDrag, board, isSpecial3WordsMode, isLiveSpecial3WordsMode, dailyWordSlots, dailySpecialPlacements]);



  return [clearDailyWordSlot, beginDailySpecialDrag];
}
