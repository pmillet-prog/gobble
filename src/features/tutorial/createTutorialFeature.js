import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialTutorialState() {
  return {
    guidedResultsStep: null,
    open: false,
    pendingLogin: false,
    specialOpen: false,
    specialPlan: null,
    specialStepIndex: 0,
  };
}

export function createTutorialFeature(context) {
  return createStateFeature(context, createInitialTutorialState);
}
