import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialTutorialState() {
  return {
    guidedResultsStep: null,
    open: false,
    pendingLogin: false,
    specialOpen: false,
    specialPlan: null,
  };
}

export function createTutorialFeature(context) {
  return createStateFeature(context, createInitialTutorialState);
}
