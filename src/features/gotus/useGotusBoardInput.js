import { useCallback, useEffect } from "react";
import { normalizeGotusWord, GOTUS_WORD_LENGTH } from "../../../shared/gotusRules.js";

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

export default function useGotusBoardInput({ state, controller, boardRef, introPlaying, chat }) {
  const focusBoard = useCallback(() => boardRef.current?.focus({ preventScroll: true }), [boardRef]);
  useEffect(() => {
    if (state.canAnswer && !introPlaying && !chat?.isChatOpenMobile && !chat?.isChatClosing &&
      !document.activeElement?.closest("[data-chat-panel]") && window.matchMedia("(pointer: fine)").matches) focusBoard();
  }, [state.canAnswer, introPlaying, chat?.isChatOpenMobile, chat?.isChatClosing, focusBoard]);

  const applyKey = useCallback(key => {
    if (!state.canAnswer || introPlaying) return false;
    if (/^\p{L}$/u.test(key)) controller.typeLetters(key);
    else if (key === "Backspace") controller.backspace();
    else if (key === "Delete") controller.deleteLetter();
    else if (key === "Enter") controller.submit();
    else if (NAVIGATION_KEYS.has(key)) controller.moveCursor(key);
    else return false;
    return true;
  }, [controller, state.canAnswer, introPlaying]);

  return {
    selectCell(column) {
      if (!state.canAnswer || introPlaying) return;
      controller.selectCell(column);
      focusBoard();
    },
    onKeyDown(event) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      if (applyKey(event.key)) { event.preventDefault(); event.stopPropagation(); }
    },
    onVirtualKey(key) {
      if (applyKey(key)) focusBoard();
    },
    onPaste(event) {
      if (!state.canAnswer || introPlaying) return;
      const letters = normalizeGotusWord(event.clipboardData.getData("text")).replace(/[^A-Z]/g, "");
      event.preventDefault(); event.stopPropagation();
      if (letters.length === GOTUS_WORD_LENGTH) controller.edit(letters);
      else if (letters) controller.typeLetters(letters);
    },
  };
}
