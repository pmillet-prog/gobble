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
    wordInfoModal: {
      foundBy: [],
      open: false,
      word: "",
    },
  };
}

export function createResultsFeature(context) {
  return createStateFeature(context, createInitialResultsState);
}
