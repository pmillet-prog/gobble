import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialDuelState() {
  return {
    consumedValidatedByView: {
      page: { dateId: "", keys: [] },
      popup: { dateId: "", keys: [] },
    },
    objectivesPopupDismissedDateId: "",
    popup: { mode: null, step: 0, team: null, weekId: null },
    rerollBusyBucket: null,
    resultsTeamDelta: { blue: 0, red: 0 },
    status: {
      crowned: false,
      dailyBattle: null,
      dateId: null,
      error: "",
      lastWeekSummary: null,
      loading: false,
      objectives: null,
      team: null,
      tutorialVersion: null,
      weekId: null,
      weekly: null,
    },
    weekRecapOpen: false,
    weekRecapPage: 0,
    weekRecapPreviewMode: false,
  };
}

export function createDuelFeature(context) {
  return createStateFeature(context, createInitialDuelState);
}
