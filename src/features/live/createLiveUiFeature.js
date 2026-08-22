import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialLiveUiState() {
  return {
    foundTargetThisRound: false,
    foundTargetWord: "",
    gridShake: false,
    mobileRoundIntroCountdown: null,
    mobileRoundIntroHideTiles: false,
    mobileRoundIntroRoundDescription: "",
    mobileRoundIntroRoundLabel: "",
    mobileRoundIntroRoundTypeLabel: "",
    mobileRoundIntroStage: "idle",
    scoreFlights: [],
    specialHint: null,
    specialSolvedOverlay: null,
    targetDefinition: {
      complete: false,
      definition: "",
      definitions: [],
      etymology: "",
      inflectionBase: "",
      inflectionGuess: false,
      inflectionLabel: "",
      lemma: "",
      lemmaGuess: false,
      lemmaLabel: "",
      loading: false,
      lookupWord: "",
      matchedTitle: "",
      ok: false,
      participleBase: "",
      participleGuess: false,
      participleLabel: "",
      phraseGuess: false,
      source: "",
      url: "",
      word: "",
    },
    targetHintScheduleMs: [],
  };
}

export function createLiveUiFeature(context) {
  return createStateFeature(context, createInitialLiveUiState);
}
