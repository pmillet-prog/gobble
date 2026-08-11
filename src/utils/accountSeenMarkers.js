function markerPart(value) {
  return encodeURIComponent(String(value || "").trim()).slice(0, 120);
}

export const ACCOUNT_SEEN_MARKERS = Object.freeze({
  chatRules: "chat-rules:v1",
  legacyBaseline: "migration:account-ui-seen-baseline:v1",
  legacyDuelRecapConsumed: "migration:account-ui-seen-baseline:duel-recap:v1",
  legacyDuelWeekConsumed: "migration:account-ui-seen-baseline:duel-week:v1",
  mainTutorial: "tutorial:main:v1",
  guidedResultsTutorial: "tutorial:guided-results:v3",
});

export function buildSpecialTutorialSeenMarker(type) {
  const part = markerPart(type);
  return part ? `tutorial:special:v2:${part}` : "";
}

export function buildPatchNotesSeenMarker(version) {
  const part = markerPart(version);
  return part ? `patch-notes:${part}` : "";
}

export function buildFacebookInviteSeenMarker(version) {
  const part = markerPart(version);
  return part ? `facebook-invite:${part}` : "";
}

export function buildDuelWeekSeenMarker(weekId) {
  const part = markerPart(weekId);
  return part ? `duel-week:${part}` : "";
}

export function buildDuelTutorialSeenMarker(version) {
  const part = markerPart(version);
  return part ? `duel-tutorial:${part}` : "";
}

export function buildDuelWeekRecapSeenMarker(weekId) {
  const part = markerPart(weekId);
  return part ? `duel-recap:${part}` : "";
}

export function buildBroadcastSeenMarker(messageKey) {
  const part = markerPart(messageKey);
  return part ? `broadcast:${part}` : "";
}

export function buildVaultWordOfDaySeenMarker(dateId) {
  const part = markerPart(dateId);
  return part ? `vault-word-day:${part}` : "";
}

export function buildVocabOverlaySeenMarker(overlayKey) {
  const part = markerPart(overlayKey);
  return part ? `vocab-overlay:${part}` : "";
}
