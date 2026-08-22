import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialStatsState() {
  return {
    activeIndex: 0,
    error: "",
    loading: false,
    open: false,
    seasonActiveIndex: 0,
    stats: null,
    tab: "weekly",
    trophyHistory: [],
    trophyLoading: false,
    trophyStatus: null,
    vocabCount: null,
    vocabLoading: false,
    vocabOverlayOpen: false,
    vocabOverlayRequest: null,
    vocabResultsReadyKey: null,
    vocabRoundDelta: null,
    vocabUpdatedAt: null,
    vocabWeeklyCount: null,
    vocabWeeklyRoundDelta: null,
    vocabWeeklyUpdatedAt: null,
    weeklyArrowBlink: false,
    weeklyArrowBump: false,
    weeklyArrowVisible: false,
  };
}

export function createStatsFeature(context) {
  return createStateFeature(context, createInitialStatsState);
}
