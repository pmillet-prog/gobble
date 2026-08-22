import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialOcidState() {
  return {
    mobileResultDismissedKey: "",
    proposal: "",
    proposalPath: [],
    proposalSubmitted: "",
    selectedOptionId: "",
    statusMessage: "",
    vote: null,
  };
}

export function createOcidFeature(context) {
  return createStateFeature(context, createInitialOcidState);
}
