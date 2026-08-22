import { createStateFeature } from "../../app/core/createStateFeature.js";

const EMPTY_LIST = Object.freeze([]);

export function createInitialLiveFeedState() {
  return {
    announcements: EMPTY_LIST,
    lastWords: EMPTY_LIST,
  };
}

export function createLiveFeedFeature(context) {
  let feature = null;
  feature = createStateFeature(context, createInitialLiveFeedState, {
    start: ({ scope, store }) => {
      scope.add(() => store.patch(createInitialLiveFeedState()));
    },
  });

  const setAnnouncements = (nextOrUpdater) =>
    feature.set("announcements", nextOrUpdater);
  const setLastWords = (nextOrUpdater) =>
    feature.set("lastWords", nextOrUpdater);
  const reset = () => feature.patch(createInitialLiveFeedState());

  return Object.freeze({
    ...feature,
    reset,
    setAnnouncements,
    setLastWords,
  });
}
