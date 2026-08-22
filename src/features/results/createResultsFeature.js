import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialResultsState() {
  return {
    analysis: null,
    definitionBlink: false,
    desktopSummaryExpanded: true,
    dismissedTournamentFinaleKey: null,
    guidedStep: null,
    highlightPlayers: [],
    hoveredNick: "",
    mobileOutroFadeActive: false,
    pathPreview: null,
    rankingMode: "round",
    reorderTick: 0,
    roundStartDelayTick: 0,
    wordInfoModal: {
      foundBy: [],
      open: false,
      word: "",
    },
  };
}

export function createResultsFeature(
  context,
  {
    clearTimeoutFn = clearTimeout,
    setTimeoutFn = setTimeout,
    wallNow = Date.now,
  } = {}
) {
  let feature = null;
  let fadeTimerId = null;
  let preparationTimerId = null;

  function clearTiming() {
    if (fadeTimerId != null) clearTimeoutFn(fadeTimerId);
    if (preparationTimerId != null) clearTimeoutFn(preparationTimerId);
    fadeTimerId = null;
    preparationTimerId = null;
  }

  function configureTiming({
    breakKind,
    fadeDurationMs,
    isMobileLayout,
    nextStartAt,
    nowServerMs,
    phase,
    preparationGraceMs,
  }) {
    clearTiming();
    const isResults = phase === "results" && breakKind !== "tournament_end";
    const hasNextStart = Number.isFinite(nextStartAt);
    if (!isResults || !hasNextStart) {
      feature.set("mobileOutroFadeActive", false);
      return;
    }

    const now = Number(nowServerMs?.());
    const safeNow = Number.isFinite(now) ? now : wallNow();
    const preparationDelayMs = Math.max(
      0,
      Number(nextStartAt) + Math.max(0, Number(preparationGraceMs) || 0) + 10 - safeNow
    );
    preparationTimerId = setTimeoutFn(() => {
      preparationTimerId = null;
      feature.set("roundStartDelayTick", wallNow());
    }, preparationDelayMs);

    if (!isMobileLayout) {
      feature.set("mobileOutroFadeActive", false);
      return;
    }
    const safeFadeDurationMs = Math.max(0, Number(fadeDurationMs) || 0);
    const msUntilStart = Math.max(0, Number(nextStartAt) - safeNow);
    if (msUntilStart <= safeFadeDurationMs + 20) {
      feature.set("mobileOutroFadeActive", true);
      return;
    }
    feature.set("mobileOutroFadeActive", false);
    fadeTimerId = setTimeoutFn(() => {
      fadeTimerId = null;
      feature.set("mobileOutroFadeActive", true);
    }, Math.max(0, msUntilStart - safeFadeDurationMs));
  }

  feature = createStateFeature(context, createInitialResultsState, {
    start: ({ scope, store }) => {
      scope.add(() => {
        clearTiming();
        store.patch(createInitialResultsState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    clearTiming,
    configureTiming,
  });
}
