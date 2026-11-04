// This release exposes the Gotus adjustment and the voluntary wheel test only.
// Keep unfinished integrations in source, but require an explicit code review
// to ship them. An old server environment variable cannot enable them.
export const RELEASE_SCOPE = Object.freeze({
  infortuneTournament: false,
  avatarRenderAssets: false,
  roundResultsReadiness: false,
  roundBonusAnnouncements: false,
  targetQuizBranding: false,
});

export const avatarAssetMigrationEnabled = name =>
  name !== "2026-11-03-avatar-render-assets.sql" || RELEASE_SCOPE.avatarRenderAssets;

export const infortuneTournamentEnabled = environment =>
  RELEASE_SCOPE.infortuneTournament && environment.GOBBLE_INFORTUNE_ENABLED === "1";
