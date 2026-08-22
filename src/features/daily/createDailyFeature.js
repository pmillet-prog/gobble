import { createStateFeature } from "../../app/core/createStateFeature.js";
import { DAILY_SPECIAL_MODE } from "../../components/daily/dailyModes.js";
import {
  createDailySpecialPlacements,
  createDailyWordSlots,
} from "../../components/daily/dailySpecialModel.js";

export function createInitialDailyState() {
  return {
    activeSlot: 0,
    board: {
      battle: null,
      dateId: null,
      entries: [],
      error: "",
      loading: false,
      ready: false,
    },
    history: { crownTotals: [], days: [] },
    historyError: "",
    historyIndex: 0,
    historyLoading: false,
    invalidPulseKey: 0,
    invalidSlot: null,
    launchDialog: null,
    lockPulseKey: 0,
    playMode: DAILY_SPECIAL_MODE,
    rankingView: "today",
    result: null,
    section: "overview",
    specialDrag: null,
    specialPlacements: createDailySpecialPlacements(),
    startError: "",
    status: {
      champion: null,
      dateId: null,
      error: "",
      hasPlayed: false,
      hasPlayedFakeTwins: false,
      hasPlayedMonstrous: false,
      hasPlayedSpecial: false,
      loading: false,
      maintenanceMode: false,
      maintenanceMessage: "",
      myFakeTwinsResult: null,
      myMonstrousResult: null,
      myResult: null,
      mySpecialResult: null,
      ready: false,
    },
    submitError: "",
    wordSlots: createDailyWordSlots(),
  };
}

export function createDailyFeature(context) {
  return createStateFeature(context, createInitialDailyState);
}
