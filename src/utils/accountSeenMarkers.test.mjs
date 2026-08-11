import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_SEEN_MARKERS,
  buildBroadcastSeenMarker,
  buildDuelTutorialSeenMarker,
  buildDuelWeekRecapSeenMarker,
  buildDuelWeekSeenMarker,
  buildFacebookInviteSeenMarker,
  buildPatchNotesSeenMarker,
  buildSpecialTutorialSeenMarker,
  buildVaultWordOfDaySeenMarker,
  buildVocabOverlaySeenMarker,
} from "./accountSeenMarkers.js";

test("account UI markers are stable and distinct", () => {
  const markers = [
    ...Object.values(ACCOUNT_SEEN_MARKERS),
    buildBroadcastSeenMarker("message-42"),
    buildDuelTutorialSeenMarker("duel-v2"),
    buildDuelWeekRecapSeenMarker("2026-W32"),
    buildDuelWeekSeenMarker("2026-W32"),
    buildFacebookInviteSeenMarker("v2"),
    buildPatchNotesSeenMarker("2026.08"),
    buildSpecialTutorialSeenMarker("target_long"),
    buildVaultWordOfDaySeenMarker("2026-08-11"),
    buildVocabOverlaySeenMarker("room:round:results"),
  ];

  assert.equal(new Set(markers).size, markers.length);
  markers.forEach((marker) => {
    assert.ok(marker.length > 0);
    assert.ok(marker.length <= 180);
  });
});

test("dynamic UI markers reject empty identifiers and cap long identifiers", () => {
  assert.equal(buildPatchNotesSeenMarker("  "), "");
  assert.equal(buildSpecialTutorialSeenMarker(null), "");
  assert.ok(buildBroadcastSeenMarker("é".repeat(500)).length <= 180);
});
