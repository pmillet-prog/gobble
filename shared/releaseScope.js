// Major release: tournament wheel and saved avatar render packs are published.
// The server wheel still requires its explicit production environment opt-in.
export const RELEASE_SCOPE = Object.freeze({
  infortuneTournament: true,
  // Paul approved publishing the current bank while retaining editorial statuses.
  infortuneFinaleDrafts: true,
  avatarRenderAssets: true,
  roundResultsReadiness: false,
  roundBonusAnnouncements: false,
  targetQuizBranding: false,
});

export const avatarAssetMigrationEnabled = name =>
  name !== "2026-11-03-avatar-render-assets.sql" || RELEASE_SCOPE.avatarRenderAssets;

export const infortuneTournamentEnabled = (environment = {}) =>
  RELEASE_SCOPE.infortuneTournament && environment.GOBBLE_INFORTUNE_ENABLED === "1"
  || (environment.NODE_ENV === undefined || environment.NODE_ENV === "development")
    && environment.GOBBLE_LOCAL_INFORTUNE_ENABLED === "1";
