import test from "node:test";
import assert from "node:assert/strict";

import {
  FACEBOOK_INVITE_VERSION,
  PATCH_NOTES_RELEASE_TS,
  PATCH_NOTES_VERSION,
  fetchDefinitionSummaryForWordOfDay,
  resolveLobbyPopupAction,
} from "./useLobbyPopupCoordinator.js";
import {
  ACCOUNT_SEEN_MARKERS,
  buildFacebookInviteSeenMarker,
  buildPatchNotesSeenMarker,
} from "../../utils/accountSeenMarkers.js";

const accountCreatedAt = Date.parse("2026-08-01T00:00:00Z");

function eligibleConfig(overrides = {}) {
  return {
    accountCreatedAt,
    accountSeenMarkers: new Set(),
    accountSeenReady: true,
    appView: "home",
    bootReady: true,
    duelStatus: {
      team: "blue",
      tutorialVersion: "duel-v1",
      weekId: "2026-W36",
    },
    isAccountAuthenticated: true,
    phase: "lobby",
    popupDistinctVisitDays: 7,
    wordVault: { loaded: true, words: [{ word: "TEST" }] },
    ...overrides,
  };
}

test("lobby popup coordinator gives patch notes first priority", () => {
  const action = resolveLobbyPopupAction(eligibleConfig());
  assert.deepEqual(action, {
    marker: buildPatchNotesSeenMarker(PATCH_NOTES_VERSION),
    type: "patch-notes",
  });
});

test("reading the previous release does not hide the new patch notes from home", () => {
  const seen = new Set([buildPatchNotesSeenMarker("2026-09-20"), buildPatchNotesSeenMarker("2026-09-23"), buildPatchNotesSeenMarker("2026-09-27"), buildPatchNotesSeenMarker("2026-10-03"), buildPatchNotesSeenMarker("2026-10-06")]);
  const action = resolveLobbyPopupAction(eligibleConfig({ accountSeenMarkers: seen }));
  assert.deepEqual(action, {
    marker: buildPatchNotesSeenMarker(PATCH_NOTES_VERSION),
    type: "patch-notes",
  });

  seen.add(action.marker);
  assert.notEqual(
    resolveLobbyPopupAction(eligibleConfig({ accountSeenMarkers: seen }))?.type,
    "patch-notes",
    "the new release is only announced once per account",
  );
});

test("the October major release includes existing accounts and excludes new players", () => {
  for (const createdAt of [Date.parse("2026-10-04T12:00:00+02:00"), PATCH_NOTES_RELEASE_TS - 1]) {
    assert.equal(resolveLobbyPopupAction(eligibleConfig({ accountCreatedAt: createdAt }))?.type, "patch-notes");
  }
  for (const createdAt of [PATCH_NOTES_RELEASE_TS, PATCH_NOTES_RELEASE_TS + 1, Date.parse("2026-10-07T12:00:00+02:00")]) {
    assert.notEqual(resolveLobbyPopupAction(eligibleConfig({ accountCreatedAt: createdAt }))?.type, "patch-notes");
  }
  for (const override of [{ isNewPlayerPopupQuiet: true }, { shouldShowTutorial: true }, { accountSeenReady: false }, { isAccountAuthenticated: false }, { phase: "playing" }]) {
    assert.notEqual(resolveLobbyPopupAction(eligibleConfig(override))?.type, "patch-notes");
  }
});

test("lobby popup coordinator never overlaps duel with open patch notes", () => {
  const action = resolveLobbyPopupAction(
    eligibleConfig({
      accountSeenMarkers: new Set([
        buildPatchNotesSeenMarker(PATCH_NOTES_VERSION),
        buildFacebookInviteSeenMarker(FACEBOOK_INVITE_VERSION),
      ]),
      isPatchNotesOpen: true,
    })
  );
  assert.equal(action, null);
});

test("lobby popup coordinator sequences facebook before duel", () => {
  const action = resolveLobbyPopupAction(
    eligibleConfig({
      accountSeenMarkers: new Set([
        buildPatchNotesSeenMarker(PATCH_NOTES_VERSION),
      ]),
    })
  );
  assert.deepEqual(action, {
    marker: buildFacebookInviteSeenMarker(FACEBOOK_INVITE_VERSION),
    type: "facebook-invite",
  });
});

test("lobby popup coordinator preserves legacy duel consumption", () => {
  const action = resolveLobbyPopupAction(
    eligibleConfig({
      accountSeenMarkers: new Set([
        ACCOUNT_SEEN_MARKERS.legacyBaseline,
        buildPatchNotesSeenMarker(PATCH_NOTES_VERSION),
        buildFacebookInviteSeenMarker(FACEBOOK_INVITE_VERSION),
      ]),
    })
  );
  assert.equal(action.type, "consume-legacy-duel");
  assert.equal(
    action.markers.includes(ACCOUNT_SEEN_MARKERS.legacyDuelWeekConsumed),
    true
  );
});

test("lobby popup coordinator reaches the vault only after higher priorities", () => {
  const action = resolveLobbyPopupAction(
    eligibleConfig({
      accountSeenMarkers: new Set([
        buildPatchNotesSeenMarker(PATCH_NOTES_VERSION),
        buildFacebookInviteSeenMarker(FACEBOOK_INVITE_VERSION),
      ]),
      duelStatus: null,
    })
  );
  assert.equal(action.type, "vault-word");
  assert.match(action.dateId, /^\d{4}-\d{2}-\d{2}$/);
});

test("word-of-day definition lookup preserves the previous response contract", async () => {
  const requests = [];
  const result = await fetchDefinitionSummaryForWordOfDay(
    "Test",
    async (url, options) => {
      requests.push({ options, url });
      return {
        ok: true,
        async json() {
          return {
            definition: "Action de tester.",
            displayWord: "test",
            source: "Wiktionnaire",
            url: "https://example.test/test",
          };
        },
      };
    }
  );
  assert.equal(requests[0].url, "/api/define?word=Test");
  assert.equal(requests[0].options.cache, "no-store");
  assert.deepEqual(result, {
    definition: "Action de tester.",
    displayWord: "test",
    source: "Wiktionnaire",
    url: "https://example.test/test",
    word: "Test",
  });
});
