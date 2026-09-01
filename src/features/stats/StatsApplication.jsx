import React from "react";

import {
  useFeatureFields,
  useFeatureRuntime,
} from "../../app/react/useFeatureRuntime.js";
import useSwipeTrackController from "../../hooks/useSwipeTrackController.js";
import { isKeyboardEditableTarget } from "../../utils/domTargets.js";
import { clampValue } from "../../utils/numbers.js";
import WeeklyStatsScreen from "../../components/stats/WeeklyStatsScreen.jsx";
import { createWeeklyStatsRuntimeModel } from "../../components/stats/weeklyStatsModel.js";

const RESULTS_SWIPE_THRESHOLD = 52;
const SEASON_PAGES = Object.freeze(["vocab_rank", "vocab_personal"]);

function getISOWeekNumber(date) {
  const value = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil(((value - yearStart) / 86400000 + 1) / 7);
}

function isStatsScrollTouchTarget(target) {
  if (typeof Element === "undefined") return false;
  const touchElement = target instanceof Element ? target : null;
  const scrollElement = touchElement?.closest?.(
    '[data-stats-scroll="true"]'
  );
  return !!(
    scrollElement &&
    scrollElement.scrollHeight > scrollElement.clientHeight + 1
  );
}

function isStatsProfileTouchTarget(target) {
  if (typeof Element === "undefined") return false;
  const touchElement = target instanceof Element ? target : null;
  return !!touchElement?.closest?.('[data-stats-profile-button="true"]');
}

function resolveGestureAxis(touchRef, deltaX, deltaY) {
  const currentAxis = touchRef.current.gestureAxis || "none";
  if (currentAxis === "horizontal" || currentAxis === "vertical") {
    return currentAxis;
  }
  const fromScrollable = !!touchRef.current.fromScrollable;
  const fromProfileButton = !!touchRef.current.fromProfileButton;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const deadZone = fromProfileButton ? 5 : fromScrollable ? 9 : 7;
  if (absX < deadZone && absY < deadZone) return "pending";
  if (!fromScrollable) {
    touchRef.current.gestureAxis = "horizontal";
    return "horizontal";
  }
  const horizontalStrong = fromProfileButton
    ? absX >= 7 && absX >= absY * 0.7
    : absX >= 12 && absX >= absY * 0.85;
  const verticalStrong = absY >= 12 && absY > absX * 1.2;
  if (horizontalStrong) {
    touchRef.current.gestureAxis = "horizontal";
    return "horizontal";
  }
  if (verticalStrong) {
    touchRef.current.gestureAxis = "vertical";
    return "vertical";
  }
  if (absX > absY) {
    touchRef.current.gestureAxis = "horizontal";
    return "horizontal";
  }
  if (absY > absX) {
    touchRef.current.gestureAxis = "vertical";
    return "vertical";
  }
  return "pending";
}

function createTouchState() {
  return {
    dragging: false,
    fromProfileButton: false,
    fromScrollable: false,
    gestureAxis: "none",
    startX: null,
    startY: null,
  };
}

function useStableEvent(handler) {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;
  return React.useCallback((...args) => handlerRef.current?.(...args), []);
}

export default function StatsApplication({
  appearance,
  blockers,
  identity,
  navigation,
  overlays,
  presentation,
  requests,
  statsConfig,
}) {
  const {
    backgroundDesktop,
    backgroundMobile,
    darkMode,
    isMobileLayout,
    menuDarkMode,
    mode,
    overlayStyle,
  } = appearance;
  const { keyboardBlocked } = blockers;
  const { installId, selfNick } = identity;
  const { onClose } = navigation;
  const {
    getImageUrl,
    getUserIdFromPlayerProfileTarget,
    isCrownedEntry,
    openDefinition,
    openPlayerProfile,
    playCloseSound,
    playSwipeSound,
    renderCrownIcon,
    renderVocabPanel,
  } = presentation;
  const { fetchWeeklyStats, requestTrophyStatus } = requests;
  const {
    seasonTargetLimit,
    weeklyBoardDisplayLimit,
    weeklyBoards,
  } = statsConfig;
  const statsFeature = useFeatureRuntime("stats");
  const statsState = useFeatureFields(statsFeature, [
    "activeIndex",
    "error",
    "loading",
    "seasonActiveIndex",
    "stats",
    "tab",
    "trophyStatus",
    "vocabCount",
    "vocabUpdatedAt",
    "vocabWeeklyCount",
    "vocabWeeklyUpdatedAt",
  ]);
  const {
    activeIndex: weeklyActiveIndex,
    error: weeklyStatsError,
    loading: weeklyStatsLoading,
    seasonActiveIndex,
    stats: weeklyStats,
    tab: statsTab,
    trophyStatus,
    vocabCount,
    vocabUpdatedAt,
    vocabWeeklyCount,
    vocabWeeklyUpdatedAt,
  } = statsState;
  const weeklySwipeTrack = useSwipeTrackController(weeklyActiveIndex);
  const seasonSwipeTrack = useSwipeTrackController(seasonActiveIndex);
  const weeklyTouchRef = React.useRef(createTouchState());
  const seasonTouchRef = React.useRef(createTouchState());
  const weeklySlideWidthRef = React.useRef(0);
  const seasonSlideWidthRef = React.useRef(0);
  const weeklySwipeBlockRef = React.useRef(0);
  const seasonSwipeBlockRef = React.useRef(0);
  const seasonSwipeTrackRef = React.useRef(seasonSwipeTrack);
  const installIdRef = React.useRef(installId);
  const selfNickRef = React.useRef(selfNick);
  seasonSwipeTrackRef.current = seasonSwipeTrack;
  installIdRef.current = installId;
  selfNickRef.current = selfNick;
  const closeStats = useStableEvent(onClose);
  const loadWeeklyStats = useStableEvent(fetchWeeklyStats);
  const loadTrophyStatus = useStableEvent(requestTrophyStatus);
  const playSwipe = useStableEvent(playSwipeSound);

  const {
    dedupeWeeklyEntries,
    getSelfWeeklyVocabRankFromStats,
  } = React.useMemo(
    () => createWeeklyStatsRuntimeModel(installIdRef, selfNickRef, weeklyStats),
    [weeklyStats]
  );

  const setWeeklyActiveIndex = React.useCallback(
    (nextOrUpdater) => statsFeature.set("activeIndex", nextOrUpdater),
    [statsFeature]
  );
  const setSeasonActiveIndex = React.useCallback(
    (nextOrUpdater) => statsFeature.set("seasonActiveIndex", nextOrUpdater),
    [statsFeature]
  );
  const setStatsTab = React.useCallback(
    (nextTab) => statsFeature.set("tab", nextTab),
    [statsFeature]
  );

  const shiftWeeklyBoard = React.useCallback(
    (delta) => {
      const total = weeklyBoards.length;
      if (!Number.isInteger(delta) || total <= 1) return;
      setWeeklyActiveIndex((previous) => {
        const next = (previous + delta + total) % total;
        weeklySwipeTrack.settle(next);
        return next;
      });
      playSwipe();
    },
    [playSwipe, setWeeklyActiveIndex, weeklyBoards.length, weeklySwipeTrack]
  );

  const goToWeeklyBoard = React.useCallback(
    (nextIndex) => {
      const total = weeklyBoards.length;
      if (!Number.isFinite(nextIndex) || total <= 1) return;
      const current = clampValue(weeklyActiveIndex, 0, total - 1);
      const next = clampValue(nextIndex, 0, total - 1);
      if (next === current) return;
      weeklySwipeTrack.settle(next);
      setWeeklyActiveIndex(next);
      playSwipe();
    },
    [
      playSwipe,
      setWeeklyActiveIndex,
      weeklyActiveIndex,
      weeklyBoards.length,
      weeklySwipeTrack,
    ]
  );

  const shiftSeasonPage = React.useCallback(
    (delta) => {
      const total = SEASON_PAGES.length;
      if (!Number.isInteger(delta) || total <= 1) return;
      setSeasonActiveIndex((previous) => {
        const next = (previous + delta + total) % total;
        seasonSwipeTrack.settle(next);
        return next;
      });
      playSwipe();
    },
    [playSwipe, seasonSwipeTrack, setSeasonActiveIndex]
  );

  const goToSeasonPage = React.useCallback(
    (nextIndex) => {
      if (SEASON_PAGES.length <= 1) return;
      const next = clampValue(nextIndex, 0, SEASON_PAGES.length - 1);
      seasonSwipeTrack.settle(next);
      setSeasonActiveIndex(next);
    },
    [seasonSwipeTrack, setSeasonActiveIndex]
  );

  const handleWeeklyTouchStart = (event) => {
    if (statsTab !== "weekly") return;
    const state = weeklyTouchRef.current;
    state.fromScrollable = isStatsScrollTouchTarget(event?.target);
    state.fromProfileButton = isStatsProfileTouchTarget(event?.target);
    state.gestureAxis = "none";
    state.dragging = false;
    state.startX = event?.touches?.[0]?.clientX ?? null;
    state.startY = event?.touches?.[0]?.clientY ?? null;
    weeklySlideWidthRef.current =
      (event?.currentTarget?.getBoundingClientRect?.().width ??
        window.innerWidth ??
        1) || 1;
    weeklySwipeTrack.begin(weeklyActiveIndex);
  };

  const handleWeeklyTouchMove = (event) => {
    if (statsTab !== "weekly") return;
    const state = weeklyTouchRef.current;
    if (state.startX == null || state.startY == null) return;
    const currentX = event?.touches?.[0]?.clientX ?? null;
    const currentY = event?.touches?.[0]?.clientY ?? null;
    if (currentX == null || currentY == null) return;
    const deltaX = currentX - state.startX;
    const deltaY = currentY - state.startY;
    const axis = resolveGestureAxis(weeklyTouchRef, deltaX, deltaY);
    if (axis === "vertical") {
      state.dragging = false;
      weeklySwipeTrack.settle(weeklyActiveIndex);
      return;
    }
    if (axis !== "horizontal") return;
    if (!state.dragging) {
      if (Math.abs(deltaX) < 6) return;
      state.dragging = true;
    }
    if (event?.cancelable) event.preventDefault();
    const width = weeklySlideWidthRef.current || window.innerWidth || 1;
    weeklySwipeTrack.move(
      clampValue(deltaX, -width * 0.35, width * 0.35),
      weeklyActiveIndex
    );
  };

  const handleWeeklyTouchEnd = (event) => {
    if (statsTab !== "weekly") return;
    const state = weeklyTouchRef.current;
    const axis = state.gestureAxis;
    const fromProfileButton = state.fromProfileButton;
    const startX = state.startX;
    const startY = state.startY;
    Object.assign(state, createTouchState());
    const width = weeklySlideWidthRef.current || window.innerWidth || 1;
    const touch = event?.changedTouches?.[0];
    if (axis === "vertical" || startX == null || startY == null || !touch) {
      weeklySwipeTrack.settle(weeklyActiveIndex);
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (fromProfileButton && Math.hypot(deltaX, deltaY) >= 8) {
      weeklySwipeBlockRef.current = Date.now();
    }
    const threshold = fromProfileButton
      ? Math.max(32, width * 0.07)
      : Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.1);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      weeklySwipeBlockRef.current = Date.now();
      shiftWeeklyBoard(deltaX < 0 ? 1 : -1);
      return;
    }
    weeklySwipeTrack.settle(weeklyActiveIndex);
  };

  const handleSeasonTouchStart = (event) => {
    if (statsTab !== "season") return;
    const state = seasonTouchRef.current;
    state.fromScrollable = isStatsScrollTouchTarget(event?.target);
    state.fromProfileButton = isStatsProfileTouchTarget(event?.target);
    state.gestureAxis = "none";
    state.dragging = false;
    state.startX = event?.touches?.[0]?.clientX ?? null;
    state.startY = event?.touches?.[0]?.clientY ?? null;
    seasonSlideWidthRef.current =
      (event?.currentTarget?.getBoundingClientRect?.().width ??
        window.innerWidth ??
        1) || 1;
    seasonSwipeTrack.begin(seasonActiveIndex);
  };

  const handleSeasonTouchMove = (event) => {
    if (statsTab !== "season") return;
    const state = seasonTouchRef.current;
    if (state.startX == null || state.startY == null) return;
    const currentX = event?.touches?.[0]?.clientX ?? null;
    const currentY = event?.touches?.[0]?.clientY ?? null;
    if (currentX == null || currentY == null) return;
    const deltaX = currentX - state.startX;
    const deltaY = currentY - state.startY;
    const axis = resolveGestureAxis(seasonTouchRef, deltaX, deltaY);
    if (axis === "vertical") {
      state.dragging = false;
      seasonSwipeTrack.settle(seasonActiveIndex);
      return;
    }
    if (axis !== "horizontal") return;
    if (!state.dragging) {
      if (Math.abs(deltaX) < 6) return;
      state.dragging = true;
    }
    if (event?.cancelable) event.preventDefault();
    const width = seasonSlideWidthRef.current || window.innerWidth || 1;
    seasonSwipeTrack.move(
      clampValue(deltaX, -width * 0.35, width * 0.35),
      seasonActiveIndex
    );
  };

  const handleSeasonTouchEnd = (event) => {
    if (statsTab !== "season") return;
    const state = seasonTouchRef.current;
    const axis = state.gestureAxis;
    const fromProfileButton = state.fromProfileButton;
    const startX = state.startX;
    const startY = state.startY;
    Object.assign(state, createTouchState());
    const width = seasonSlideWidthRef.current || window.innerWidth || 1;
    const touch = event?.changedTouches?.[0];
    if (axis === "vertical" || startX == null || startY == null || !touch) {
      seasonSwipeTrack.settle(seasonActiveIndex);
      return;
    }
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (fromProfileButton && Math.hypot(deltaX, deltaY) >= 8) {
      seasonSwipeBlockRef.current = Date.now();
    }
    const threshold = fromProfileButton
      ? Math.max(32, width * 0.07)
      : Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.1);
    if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      seasonSwipeBlockRef.current = Date.now();
      shiftSeasonPage(deltaX < 0 ? 1 : -1);
      return;
    }
    seasonSwipeTrack.settle(seasonActiveIndex);
  };

  const handleStatsTouchStart = (event) =>
    statsTab === "season"
      ? handleSeasonTouchStart(event)
      : handleWeeklyTouchStart(event);
  const handleStatsTouchMove = (event) =>
    statsTab === "season"
      ? handleSeasonTouchMove(event)
      : handleWeeklyTouchMove(event);
  const handleStatsTouchEnd = (event) =>
    statsTab === "season"
      ? handleSeasonTouchEnd(event)
      : handleWeeklyTouchEnd(event);
  const shouldIgnoreSwipeClick = (ref, delayMs = 450) =>
    Date.now() - (ref?.current || 0) < delayMs;

  React.useEffect(() => {
    statsFeature.set("open", true);
    return () => statsFeature.set("open", false);
  }, [statsFeature]);

  React.useEffect(() => {
    if (!weeklyStats && !weeklyStatsLoading) loadWeeklyStats(true);
  }, [loadWeeklyStats, weeklyStats, weeklyStatsLoading]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isKeyboardEditableTarget(event.target) ||
        keyboardBlocked
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeStats();
        return;
      }
      if (isMobileLayout) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (statsTab === "season") shiftSeasonPage(-1);
        else shiftWeeklyBoard(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (statsTab === "season") shiftSeasonPage(1);
        else shiftWeeklyBoard(1);
      } else if (event.key === "Home") {
        event.preventDefault();
        if (statsTab === "season") goToSeasonPage(0);
        else goToWeeklyBoard(0);
      } else if (event.key === "End") {
        event.preventDefault();
        if (statsTab === "season") goToSeasonPage(SEASON_PAGES.length - 1);
        else goToWeeklyBoard(weeklyBoards.length - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    goToSeasonPage,
    goToWeeklyBoard,
    isMobileLayout,
    keyboardBlocked,
    closeStats,
    shiftSeasonPage,
    shiftWeeklyBoard,
    statsTab,
    weeklyBoards.length,
  ]);

  React.useEffect(() => {
    if (statsTab !== "season") return;
    void loadTrophyStatus();
    const currentTopN = Number.isFinite(weeklyStats?.topN)
      ? weeklyStats.topN
      : 0;
    if (currentTopN < seasonTargetLimit) {
      loadWeeklyStats(true, seasonTargetLimit);
    }
  }, [
    loadTrophyStatus,
    loadWeeklyStats,
    seasonTargetLimit,
    statsTab,
    weeklyStats?.topN,
  ]);

  React.useEffect(() => {
    if (statsTab !== "season") return;
    seasonSwipeTrackRef.current.settle(0);
    setSeasonActiveIndex(0);
    Object.assign(seasonTouchRef.current, createTouchState());
  }, [setSeasonActiveIndex, statsTab]);

  const safeWeeklyIndex =
    weeklyActiveIndex >= 0 && weeklyActiveIndex < weeklyBoards.length
      ? weeklyActiveIndex
      : 0;
  const activeWeeklyBoard =
    weeklyBoards[safeWeeklyIndex] || weeklyBoards[0];
  const vocabBoardEntries = Number.isFinite(vocabCount)
    ? [
        {
          achievedAt: Number.isFinite(vocabUpdatedAt) ? vocabUpdatedAt : null,
          nick: selfNick || "Toi",
          playerKey: installId ? `install:${installId}` : null,
          vocabCount,
        },
      ]
    : [];
  const weeklyVocabBoardEntries =
    Number.isFinite(vocabWeeklyCount) && vocabWeeklyCount > 0
      ? [
          {
            achievedAt: Number.isFinite(vocabWeeklyUpdatedAt)
              ? vocabWeeklyUpdatedAt
              : null,
            nick: selfNick || "Toi",
            playerKey: installId ? `install:${installId}` : null,
            weeklyVocabCount: vocabWeeklyCount,
          },
        ]
      : [];
  const weeklyBoardData = { ...(weeklyStats?.boards || {}) };
  if (!Array.isArray(weeklyBoardData.vocab) || !weeklyBoardData.vocab.length) {
    weeklyBoardData.vocab = vocabBoardEntries;
  }
  if (
    !Array.isArray(weeklyBoardData.weeklyVocab) ||
    !weeklyBoardData.weeklyVocab.length
  ) {
    weeklyBoardData.weeklyVocab = weeklyVocabBoardEntries;
  }
  const weeklyVocabLookup = new Map();
  (weeklyBoardData.vocab || []).forEach((entry) => {
    if (!entry) return;
    const count = Number(entry.vocabCount) || 0;
    if (entry.playerKey) weeklyVocabLookup.set(entry.playerKey, count);
    const nickKey = String(entry.nick || "").trim().toLowerCase();
    if (nickKey) weeklyVocabLookup.set(nickKey, count);
  });
  const weeklyLimit =
    weeklyStats?.topN || weeklyStats?.limits?.topN || 50;
  const seasonBoardDisplayLimit = Math.min(
    seasonTargetLimit,
    Math.max(weeklyBoardDisplayLimit, weeklyLimit)
  );
  const seasonVocabEntries = dedupeWeeklyEntries(
    "vocab",
    weeklyBoardData.vocab,
    seasonBoardDisplayLimit
  );
  const weeklyEntriesByBoard = Object.fromEntries(
    weeklyBoards.map((board) => [
      board.key,
      dedupeWeeklyEntries(
        board.key,
        weeklyBoardData[board.key],
        weeklyBoardDisplayLimit
      ),
    ])
  );
  const weeklyWeekNumber = weeklyStats?.weekStartTs
    ? getISOWeekNumber(new Date(weeklyStats.weekStartTs))
    : getISOWeekNumber(new Date());
  const weeklyVocabSelfRank =
    getSelfWeeklyVocabRankFromStats(weeklyStats);
  const weeklyVocabSelfCount = Number.isFinite(vocabWeeklyCount)
    ? Math.max(0, vocabWeeklyCount)
    : null;

  return (
    <>
      {overlays}
      <div
        className={
          mode === "overlay"
            ? "fixed inset-0 z-[12150] flex items-stretch justify-center overflow-hidden bg-black/70 px-2 py-2 sm:px-4 text-white"
            : "relative w-full flex items-stretch justify-center overflow-hidden px-2 text-white sm:px-4"
        }
        style={overlayStyle}
      >
        {mode !== "overlay" ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url('${
                  isMobileLayout ? backgroundMobile : backgroundDesktop
                }')`,
              }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
              aria-hidden="true"
            />
          </>
        ) : null}
        <WeeklyStatsScreen
          runtime={{
            activeWeeklyBoard,
            closeWeeklyStatsOverlay: closeStats,
            darkMode,
            getImageUrl,
            getSeasonPages: () => SEASON_PAGES,
            getUserIdFromPlayerProfileTarget,
            goToSeasonPage,
            goToWeeklyBoard,
            handleStatsTouchEnd,
            handleStatsTouchMove,
            handleStatsTouchStart,
            installId,
            isCrownedEntry,
            menuDarkMode,
            openDefinition,
            openPlayerProfile,
            playCloseSound,
            renderCrownIcon,
            renderVocabPanel,
            safeWeeklyIndex,
            seasonActiveIndex,
            seasonSwipeBlockRef,
            seasonSwipeTrack,
            seasonVocabEntries,
            selfNick,
            setStatsTab,
            shiftSeasonPage,
            shiftWeeklyBoard,
            shouldIgnoreSwipeClick,
            statsTab,
            trophyStatus,
            weeklyBoardsMeta: weeklyBoards,
            weeklyEntriesByBoard,
            weeklyStatsError,
            weeklyStatsLoading,
            weeklySwipeBlockRef,
            weeklySwipeTrack,
            weeklyVocabLookup,
            weeklyVocabSelfCount,
            weeklyVocabSelfRank,
            weeklyWeekNumber,
          }}
        />
      </div>
    </>
  );
}
