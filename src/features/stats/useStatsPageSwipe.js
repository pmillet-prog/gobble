import { useMemo, useRef } from "react";
import { getStatsNavigation } from "./statsNavigation.js";

const INTERACTIVE_TARGETS = "a, button, input, select, textarea, label, [role='button'], [role='listbox'], [contenteditable='true']";

/** Change only the visible sheet; no hidden pages or animation state are mounted. */
export default function useStatsPageSwipe({ navigation, enabled, onPageChange }) {
  const gestureRef = useRef(null);
  const { tab, category, board, categories } = navigation;
  const pages = useMemo(() => categories.flatMap(({ key }) =>
    getStatsNavigation({ tab, category: key }).boards.map(({ key: boardKey }) => ({ category: key, boardKey }))), [tab, categories]);
  const pageIndex = pages.findIndex((page) => page.category === category && page.boardKey === board.key);
  const pageKey = `${tab}:${category}:${board.key}`;

  const cancel = () => { gestureRef.current = null; };
  const handlers = {
    onTouchStart(event) {
      cancel();
      if (!enabled || event.touches.length !== 1 || event.target.closest?.(INTERACTIVE_TARGETS)) return;
      const touch = event.touches[0];
      gestureRef.current = {
        identifier: touch.identifier, x: touch.clientX, y: touch.clientY,
        startedAt: event.timeStamp, width: event.currentTarget.clientWidth, pageKey,
      };
    },
    onTouchMove(event) {
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - gesture.x);
      const dy = Math.abs(touch.clientY - gesture.y);
      if (touch.identifier !== gesture.identifier || (dy > 10 && dy >= dx)) cancel();
    },
    onTouchEnd(event) {
      const gesture = gestureRef.current;
      cancel();
      if (!enabled || !gesture || gesture.pageKey !== pageKey || event.timeStamp - gesture.startedAt > 1200) return;
      const touch = Array.from(event.changedTouches).find(({ identifier }) => identifier === gesture.identifier);
      if (!touch) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      const threshold = Math.max(48, Math.min(90, gesture.width * 0.14));
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const nextPage = pages[pageIndex + (dx < 0 ? 1 : -1)];
      if (!nextPage) return;
      onPageChange(nextPage);
      event.currentTarget.scrollTop = 0;
    },
    onTouchCancel: cancel,
  };

  return { handlers, pageNumber: pageIndex + 1, pageCount: pages.length };
}
