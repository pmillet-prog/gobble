export const APP_VIEWS = Object.freeze([
  "home",
  "live",
  "training",
  "daily",
  "daily_play",
  "daily_results",
  "stats",
  "duel",
  "vault",
]);

const APP_VIEW_SET = new Set(APP_VIEWS);

export function normalizeAppView(value, fallback = "home") {
  const candidate = String(value || "").trim();
  if (APP_VIEW_SET.has(candidate)) return candidate;
  return APP_VIEW_SET.has(fallback) ? fallback : "home";
}

export function createInitialApplicationState({ ambientTracks = [] } = {}) {
  return Object.freeze({
    boot: Object.freeze({
      ambientTracks: Array.isArray(ambientTracks) ? ambientTracks : [],
      overlayVisible: true,
      ready: false,
    }),
    navigation: Object.freeze({
      previousView: null,
      view: "home",
    }),
  });
}
