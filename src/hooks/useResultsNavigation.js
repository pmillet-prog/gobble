import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function clampValue(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

export function getResultsPagesForRound({ isOcidResult = false, isTargetRound = false } = {}) {
  if (isOcidResult) return ["round", "total"];
  return isTargetRound ? ["round", "total"] : ["round", "total", "found", "all", "vocab"];
}

export function useResultsNavigation({
  isOcidResult = false,
  isTargetRound = false,
  onRankingReorder,
  onSwipeSound,
  slideInMs = 250,
  slideOutMs = 250,
  swipeThreshold = 52,
} = {}) {
  const [mobileResultsPage, setMobileResultsPage] = useState(0);
  const [resultsSlidePhase, setResultsSlidePhase] = useState("idle");
  const resultsTouchRef = useRef({ startX: null, startY: null });
  const resultsSlideWidthRef = useRef(0);
  const resultsDraggingRef = useRef(false);
  const resultsSlideOutTimerRef = useRef(null);
  const resultsSlideInTimerRef = useRef(null);

  const resultsPages = useMemo(
    () => getResultsPagesForRound({ isOcidResult, isTargetRound }),
    [isOcidResult, isTargetRound]
  );

  const clearResultsSlideTimers = useCallback(() => {
    if (resultsSlideOutTimerRef.current) {
      clearTimeout(resultsSlideOutTimerRef.current);
      resultsSlideOutTimerRef.current = null;
    }
    if (resultsSlideInTimerRef.current) {
      clearTimeout(resultsSlideInTimerRef.current);
      resultsSlideInTimerRef.current = null;
    }
  }, []);

  const setResultsPageInstant = useCallback(
    (nextPage) => {
      clearResultsSlideTimers();
      setResultsSlidePhase("idle");
      resultsDraggingRef.current = false;
      setMobileResultsPage(nextPage);
    },
    [clearResultsSlideTimers]
  );

  const startResultsSlide = useCallback(
    (nextPage) => {
      clearResultsSlideTimers();
      setResultsSlidePhase("out");
      resultsDraggingRef.current = false;
      resultsSlideOutTimerRef.current = setTimeout(() => {
        setMobileResultsPage(nextPage);
        setResultsSlidePhase("in");
        resultsSlideInTimerRef.current = setTimeout(() => {
          setResultsSlidePhase("idle");
        }, slideInMs);
      }, slideOutMs);
    },
    [clearResultsSlideTimers, slideInMs, slideOutMs]
  );

  const goToResultsPage = useCallback(
    (nextIndex) => {
      const totalPages = resultsPages.length;
      if (totalPages <= 1) return;
      const current = clampValue(mobileResultsPage, 0, totalPages - 1);
      const next = clampValue(nextIndex, 0, totalPages - 1);
      if (next === current) return;
      const currentKey = resultsPages[current];
      const nextKey = resultsPages[next];
      const isWordsJump =
        (currentKey === "found" || currentKey === "all") &&
        (nextKey === "found" || nextKey === "all");
      const isRankingJump =
        (currentKey === "round" || currentKey === "total") &&
        (nextKey === "round" || nextKey === "total");
      if (isWordsJump) {
        setResultsPageInstant(next);
      } else if (isRankingJump) {
        if (typeof onRankingReorder === "function") onRankingReorder();
        setResultsPageInstant(next);
      } else {
        startResultsSlide(next);
      }
      if (typeof onSwipeSound === "function") onSwipeSound();
    },
    [
      mobileResultsPage,
      onRankingReorder,
      onSwipeSound,
      resultsPages,
      setResultsPageInstant,
      startResultsSlide,
    ]
  );

  const shiftResultsPage = useCallback(
    (delta) => {
      if (!Number.isInteger(delta)) return;
      goToResultsPage(mobileResultsPage + delta);
    },
    [goToResultsPage, mobileResultsPage]
  );

  const handleResultsTouchStart = useCallback(
    (e) => {
      const touch = e?.touches?.[0];
      if (!touch) return;
      clearResultsSlideTimers();
      setResultsSlidePhase("idle");
      resultsTouchRef.current.startX = touch.clientX;
      resultsTouchRef.current.startY = touch.clientY;
      resultsSlideWidthRef.current =
        (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
      resultsDraggingRef.current = false;
    },
    [clearResultsSlideTimers]
  );

  const handleResultsTouchMove = useCallback((e) => {
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
  }, []);

  const handleResultsTouchEnd = useCallback(
    (e) => {
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
      const threshold = Math.max(swipeThreshold, width * 0.12);
      if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        shiftResultsPage(deltaX < 0 ? 1 : -1);
      }
    },
    [shiftResultsPage, swipeThreshold]
  );

  useEffect(() => clearResultsSlideTimers, [clearResultsSlideTimers]);

  return {
    clearResultsSlideTimers,
    goToResultsPage,
    handleResultsTouchEnd,
    handleResultsTouchMove,
    handleResultsTouchStart,
    mobileResultsPage,
    resultsDraggingRef,
    resultsPages,
    resultsSlidePhase,
    setMobileResultsPage,
    setResultsSlidePhase,
    shiftResultsPage,
  };
}

export function useFinaleNavigation({
  onSwipeSound,
  pagesCount = 1,
  swipeThreshold = 52,
} = {}) {
  const [finalePage, setFinalePage] = useState(0);
  const finaleTouchRef = useRef({ startX: null, startY: null });
  const finaleDraggingRef = useRef(false);
  const finaleSlideWidthRef = useRef(0);
  const finalePagesCount = Math.max(1, Number(pagesCount) || 1);

  const goToFinalePage = useCallback(
    (nextIndex) => {
      if (finalePagesCount <= 1) return;
      const current = clampValue(finalePage, 0, finalePagesCount - 1);
      const next = clampValue(nextIndex, 0, finalePagesCount - 1);
      if (next === current) return;
      setFinalePage(next);
      if (typeof onSwipeSound === "function") onSwipeSound();
    },
    [finalePage, finalePagesCount, onSwipeSound]
  );

  const shiftFinalePage = useCallback(
    (delta) => {
      if (!Number.isInteger(delta)) return;
      goToFinalePage(finalePage + delta);
    },
    [finalePage, goToFinalePage]
  );

  const handleFinaleTouchStart = useCallback((e) => {
    const touch = e?.touches?.[0];
    if (!touch) return;
    finaleTouchRef.current.startX = touch.clientX;
    finaleTouchRef.current.startY = touch.clientY;
    finaleSlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    finaleDraggingRef.current = false;
  }, []);

  const handleFinaleTouchMove = useCallback((e) => {
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
  }, []);

  const handleFinaleTouchEnd = useCallback(
    (e) => {
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
      const threshold = Math.max(swipeThreshold, width * 0.12);
      if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        shiftFinalePage(deltaX < 0 ? 1 : -1);
      }
    },
    [shiftFinalePage, swipeThreshold]
  );

  useEffect(() => {
    setFinalePage((prev) => clampValue(prev, 0, finalePagesCount - 1));
  }, [finalePagesCount]);

  return {
    finalePage,
    finalePagesCount,
    goToFinalePage,
    handleFinaleTouchEnd,
    handleFinaleTouchMove,
    handleFinaleTouchStart,
    setFinalePage,
    shiftFinalePage,
  };
}
