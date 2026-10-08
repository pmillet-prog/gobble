import React from "react";
import { createPortal } from "react-dom";
import useOverlayViewport from "../../hooks/useOverlayViewport.js";
import useMobileBackTarget from "../mobile/useMobileBackTarget.js";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { isKeyboardEditableTarget } from "../../utils/domTargets.js";
import WeeklyStatsScreen from "../../components/stats/WeeklyStatsScreen.jsx";
import { createWeeklyStatsRuntimeModel } from "../../components/stats/weeklyStatsModel.js";
import { getWeeklyTop3Entries } from "../../components/stats/weeklyTop3Model.js";
import { WEEKLY_TOP3_ROUND_TYPES } from "./statsConfig.js";
import { changeStatsPeriod, getStatsNavigation } from "./statsNavigation.js";
import "./statsOverlay.css";

function useStableEvent(handler) {
  const ref = React.useRef(handler);
  ref.current = handler;
  return React.useCallback((...args) => ref.current?.(...args), []);
}

export default function StatsApplication({ appearance, blockers, identity, navigation, presentation, requests, statsConfig }) {
  const statsFeature = useFeatureRuntime("stats");
  const state = useFeatureFields(statsFeature, [
    "category", "boardKey", "error", "loading", "stats", "tab",
    "vocabCount", "vocabUpdatedAt", "vocabWeeklyCount", "vocabWeeklyUpdatedAt",
  ]);
  const { stats, loading, error } = state;
  const { installId, selfNick } = identity;
  const { isMobileLayout } = appearance;
  const { seasonTargetLimit, weeklyBoardDisplayLimit } = statsConfig;
  const selected = getStatsNavigation(state);
  const boardKey = selected.board.key;
  const viewportRef = useOverlayViewport();
  const closeStats = useStableEvent(navigation.onClose);
  const fetchWeekly = useStableEvent(requests.fetchWeeklyStats);
  const playSwipe = useStableEvent(presentation.playSwipeSound);
  const [top3RoundType, setTop3RoundType] = React.useState(WEEKLY_TOP3_ROUND_TYPES[0].key);
  const installIdRef = React.useRef(installId);
  const selfNickRef = React.useRef(selfNick);
  installIdRef.current = installId;
  selfNickRef.current = selfNick;
  useMobileBackTarget(closeStats, !blockers.keyboardBlocked);

  const model = React.useMemo(() => createWeeklyStatsRuntimeModel(installIdRef, selfNickRef, stats), [stats]);
  const weeklyVocab = React.useMemo(() => {
    const entries = stats?.boards?.weeklyVocab;
    if (entries?.length) return entries;
    return Number.isFinite(state.vocabWeeklyCount) && state.vocabWeeklyCount > 0 ? [{
      nick: selfNick || "Toi", playerKey: installId ? `install:${installId}` : null,
      weeklyVocabCount: state.vocabWeeklyCount, achievedAt: state.vocabWeeklyUpdatedAt,
    }] : [];
  }, [stats, state.vocabWeeklyCount, state.vocabWeeklyUpdatedAt, selfNick, installId]);

  const entries = React.useMemo(() => {
    if (boardKey === "vocab_personal") return [];
    let source = selected.tab === "weekly" ? stats?.boards?.[boardKey] : stats?.allTimeBoards?.[boardKey];
    if (boardKey === "weeklyVocab") source = weeklyVocab;
    if (boardKey === "vocab") source = stats?.boards?.vocab?.length ? stats.boards.vocab : (
      Number.isFinite(state.vocabCount) ? [{
        nick: selfNick || "Toi", playerKey: installId ? `install:${installId}` : null,
        vocabCount: state.vocabCount, achievedAt: state.vocabUpdatedAt,
      }] : []
    );
    if (boardKey === "top3") return getWeeklyTop3Entries(source?.[top3RoundType], weeklyBoardDisplayLimit);
    return model.dedupeWeeklyEntries(boardKey, source, selected.tab === "weekly" ? weeklyBoardDisplayLimit : seasonTargetLimit);
  }, [boardKey, selected.tab, stats, weeklyVocab, top3RoundType, weeklyBoardDisplayLimit, seasonTargetLimit,
    model, state.vocabCount, state.vocabUpdatedAt, selfNick, installId]);

  const selfRank = React.useMemo(() => model.getSelfWeeklyVocabRankFromStats({ ...stats, boards: { ...stats?.boards, weeklyVocab } }),
    [model, stats, weeklyVocab, installId, selfNick]);
  const changeSelection = (patch) => { statsFeature.patch(patch); playSwipe(); };
  const onPeriodChange = (tab) => changeSelection(changeStatsPeriod({ ...state, boardKey }, tab));
  const onCategoryChange = (category) => {
    const next = getStatsNavigation({ tab: selected.tab, category });
    changeSelection({ category: next.category, boardKey: next.board.key });
  };

  React.useEffect(() => {
    if (!stats && !loading && !error) fetchWeekly(true);
  }, [fetchWeekly, stats, loading, error]);
  React.useEffect(() => {
    if (selected.tab === "season" && stats && !loading && !error && Number(stats.topN || 0) < seasonTargetLimit) {
      fetchWeekly(true, seasonTargetLimit);
    }
  }, [selected.tab, stats, loading, error, seasonTargetLimit, fetchWeekly]);
  React.useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = viewportRef.current;
    dialog?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected && (document.activeElement === document.body || dialog?.contains(document.activeElement))) {
        previousFocus.focus?.({ preventScroll: true });
      }
    };
  }, [viewportRef]);
  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || blockers.keyboardBlocked || isKeyboardEditableTarget(event.target)) return;
      if (event.target.closest?.('[role="combobox"][aria-expanded="true"]')) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeStats(); }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeStats, blockers.keyboardBlocked]);

  return createPortal(
    <div
      ref={viewportRef} role="dialog" aria-modal="true" aria-label="Statistiques" tabIndex={-1}
      className="stats-overlay fixed left-0 top-0 z-[12150] flex w-full items-center justify-center overflow-hidden overscroll-contain bg-black/70 text-white outline-none"
      style={{ height: "100dvh", minHeight: 0, padding: isMobileLayout
        ? "max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))"
        : "clamp(8px, 2vmin, 24px)" }}
    >
      <WeeklyStatsScreen runtime={{
        ...appearance, ...identity, ...presentation,
        navigation: selected, entries, onPeriodChange, onCategoryChange,
        onBoardChange: (key) => changeSelection({ boardKey: key }),
        onPageChange: changeSelection,
        closeWeeklyStatsOverlay: closeStats,
        renderVocabPanel: presentation.renderVocabPanel,
        top3RoundType, setTop3RoundType,
        loading, error, retry: () => fetchWeekly(true, selected.tab === "season" ? seasonTargetLimit : null),
        weekStartTs: stats?.weekStartTs,
        trackingStartTs: boardKey === "top3" ? stats?.top3TrackingStartTs : stats?.trackingStartTs?.[boardKey],
        weeklyVocabSelfRank: selfRank, weeklyVocabSelfCount: state.vocabWeeklyCount,
      }} />
    </div>, document.body
  );
}
