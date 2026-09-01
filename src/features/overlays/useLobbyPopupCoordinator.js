import React from "react";

import { getParisDateIdClient } from "../../components/daily/dailyHistoryModel.js";
import { normalizeWord } from "../../components/gameLogic.js";
import { pickVaultWordOfDayCandidates } from "../../components/home/vaultWordCandidates.js";
import {
  buildDefinitionFallbacks,
  pickDefinitionText,
} from "../../utils/definitionPayload.js";
import {
  ACCOUNT_SEEN_MARKERS,
  buildBroadcastSeenMarker,
  buildDuelTutorialSeenMarker,
  buildDuelWeekSeenMarker,
  buildFacebookInviteSeenMarker,
  buildPatchNotesSeenMarker,
  buildVaultWordOfDaySeenMarker,
} from "../../utils/accountSeenMarkers.js";
import {
  FACEBOOK_INVITE_MIN_DISTINCT_VISIT_DAYS,
  isAudienceEligibleForPatchNotes,
  recordDistinctVisitDay,
} from "../../utils/popupAudience.js";
import { VIEWPORT_EVENTS } from "../layout/createViewportEventHub.js";
import { getBroadcastMessageKey } from "../home/homeViewModel.js";

export const PATCH_NOTES_VERSION = "2026-08-20";
export const PATCH_NOTES_RELEASE_TS = Date.parse("2026-08-20T00:00:00+02:00");
export const FACEBOOK_INVITE_VERSION = "facebook-group-v1";

const LOBBY_POPUP_EXCLUDED_VIEWS = new Set([
  "daily",
  "daily_play",
  "daily_results",
  "stats",
  "duel",
  "vault",
]);

function getPopupAudienceKey(userId) {
  const safeUserId = Number(userId);
  return Number.isInteger(safeUserId) && safeUserId > 0
    ? `user:${safeUserId}`
    : "";
}

function duelObjectivesAreCompleted(duelStatus) {
  const objectives = Array.isArray(duelStatus?.objectives?.objectives)
    ? duelStatus.objectives.objectives
    : [];
  return objectives.length > 0 && objectives.every((objective) => !!objective?.validated);
}

function canShowDuelObjectivesPopup(duelStatus, dismissedDateId) {
  const dateId = duelStatus?.objectives?.dateId || duelStatus?.dateId || "";
  return !!dateId && !duelObjectivesAreCompleted(duelStatus) && dismissedDateId !== dateId;
}

export function isLobbyPopupView(phase, appView) {
  return phase === "lobby" && !LOBBY_POPUP_EXCLUDED_VIEWS.has(appView);
}

export function resolveLobbyPopupAction({
  accountCreatedAt,
  accountSeenMarkers = new Set(),
  accountSeenReady = false,
  appView = "home",
  bootOverlayVisible = false,
  bootReady = false,
  broadcastLoading = false,
  broadcastMessage = null,
  definitionModalOpen = false,
  duelObjectivesPopupDismissedDateId = "",
  duelPopupMode = null,
  duelStatus = null,
  facebookAttemptedMarker = "",
  isAboutOpen = false,
  isAccountAuthenticated = false,
  isAccountMenuOpen = false,
  isFacebookInviteOpen = false,
  isHomeChatOpen = false,
  isLegacyConverted = false,
  isLoggedIn = false,
  isNewPlayerPopupQuiet = false,
  isPatchNotesOpen = false,
  isPlayersOverlayOpen = false,
  isSettingsOpen = false,
  isSupportOpen = false,
  phase = "lobby",
  popupDistinctVisitDays = 0,
  shouldShowTutorial = false,
  vaultAttemptedMarkers = new Set(),
  vaultPopupOpen = false,
  wordVault = null,
} = {}) {
  const lobbyView = isLobbyPopupView(phase, appView);
  if (!lobbyView) {
    return duelPopupMode ? { type: "close-duel" } : null;
  }
  if (duelPopupMode === "objectives" && duelObjectivesAreCompleted(duelStatus)) {
    return { type: "close-duel" };
  }

  if (
    isAccountAuthenticated &&
    accountSeenReady &&
    !shouldShowTutorial &&
    !isNewPlayerPopupQuiet &&
    isAudienceEligibleForPatchNotes({
      accountCreatedAt,
      isAuthenticated: isAccountAuthenticated,
      isLegacyConverted,
      releaseTimestamp: PATCH_NOTES_RELEASE_TS,
    })
  ) {
    const marker = buildPatchNotesSeenMarker(PATCH_NOTES_VERSION);
    if (!accountSeenMarkers.has(marker)) return { marker, type: "patch-notes" };
  }

  if (
    bootReady &&
    !bootOverlayVisible &&
    isAccountAuthenticated &&
    accountSeenReady &&
    popupDistinctVisitDays >= FACEBOOK_INVITE_MIN_DISTINCT_VISIT_DAYS &&
    !shouldShowTutorial &&
    !isNewPlayerPopupQuiet &&
    !isPatchNotesOpen &&
    !isFacebookInviteOpen &&
    !duelPopupMode &&
    !isSettingsOpen &&
    !isAboutOpen &&
    !isSupportOpen
  ) {
    const marker = buildFacebookInviteSeenMarker(FACEBOOK_INVITE_VERSION);
    if (facebookAttemptedMarker !== marker && !accountSeenMarkers.has(marker)) {
      return { marker, type: "facebook-invite" };
    }
  }

  if (
    isAccountAuthenticated &&
    accountSeenReady &&
    duelStatus?.weekId &&
    duelStatus?.team &&
    !shouldShowTutorial &&
    !isNewPlayerPopupQuiet &&
    !isPatchNotesOpen &&
    !isFacebookInviteOpen &&
    !duelPopupMode
  ) {
    const weekMarker = buildDuelWeekSeenMarker(duelStatus.weekId);
    const tutorialMarker = buildDuelTutorialSeenMarker(
      duelStatus?.tutorialVersion || "duel-v1"
    );
    if (
      accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.legacyBaseline) &&
      !accountSeenMarkers.has(ACCOUNT_SEEN_MARKERS.legacyDuelWeekConsumed)
    ) {
      return {
        markers: [weekMarker, ACCOUNT_SEEN_MARKERS.legacyDuelWeekConsumed],
        type: "consume-legacy-duel",
      };
    }
    if (!accountSeenMarkers.has(weekMarker)) {
      return { mode: "team", type: "duel" };
    }
    if (!accountSeenMarkers.has(tutorialMarker)) {
      return { mode: "tutorial", type: "duel" };
    }
    if (
      canShowDuelObjectivesPopup(
        duelStatus,
        duelObjectivesPopupDismissedDateId
      )
    ) {
      return { mode: "objectives", type: "duel" };
    }
  }

  const isHomeLobby = !isLoggedIn && phase === "lobby" && appView === "home";
  if (
    !isHomeLobby ||
    !isAccountAuthenticated ||
    !accountSeenReady ||
    !wordVault?.loaded ||
    wordVault?.loading ||
    wordVault?.error ||
    !Array.isArray(wordVault?.words) ||
    wordVault.words.length === 0 ||
    vaultPopupOpen ||
    shouldShowTutorial ||
    isNewPlayerPopupQuiet ||
    isPatchNotesOpen ||
    isFacebookInviteOpen ||
    duelPopupMode ||
    definitionModalOpen ||
    isAccountMenuOpen ||
    isSettingsOpen ||
    isAboutOpen ||
    isSupportOpen ||
    isHomeChatOpen ||
    isPlayersOverlayOpen ||
    broadcastLoading ||
    !bootReady ||
    bootOverlayVisible
  ) {
    return null;
  }

  const broadcastKey = getBroadcastMessageKey(broadcastMessage);
  if (
    broadcastKey &&
    !accountSeenMarkers.has(buildBroadcastSeenMarker(broadcastKey))
  ) {
    return null;
  }
  const dateId = getParisDateIdClient();
  const marker = buildVaultWordOfDaySeenMarker(dateId);
  if (accountSeenMarkers.has(marker) || vaultAttemptedMarkers.has(marker)) return null;
  return { dateId, marker, type: "vault-word" };
}

export async function fetchDefinitionSummaryForWordOfDay(
  term,
  fetchImpl = globalThis.fetch
) {
  const clean = String(term || "").trim();
  if (!clean || typeof fetchImpl !== "function") return null;
  const tried = new Set();
  const baseKey = normalizeWord(clean);
  if (baseKey) tried.add(baseKey);

  async function fetchDefinition(word) {
    const params = new URLSearchParams();
    params.set("word", word);
    const response = await fetchImpl(`/api/define?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data) return null;
    const definitionText = pickDefinitionText(data);
    if (definitionText) {
      return {
        definition: definitionText,
        displayWord: data.displayWord || data.word || data.title || clean,
        source: data.source || "",
        url: data.url || "",
        word: clean,
      };
    }
    const fallbacks = buildDefinitionFallbacks(clean, data, tried);
    for (const fallback of fallbacks) {
      const next = await fetchDefinition(fallback);
      if (next?.definition) return next;
    }
    return null;
  }

  return fetchDefinition(clean);
}

export default function useLobbyPopupCoordinator({
  account,
  connection,
  duel,
  environment,
  overlays,
  vault,
}) {
  const [popupDistinctVisitDays, setPopupDistinctVisitDays] = React.useState(0);
  const facebookAttemptedMarkerRef = React.useRef("");
  const vaultAttemptedMarkersRef = React.useRef(new Set());

  React.useEffect(() => {
    const audienceKey = getPopupAudienceKey(account?.userId);
    if (!audienceKey) {
      setPopupDistinctVisitDays(0);
      return undefined;
    }
    const recordVisit = () => {
      const visit = recordDistinctVisitDay(
        audienceKey,
        typeof localStorage !== "undefined" ? localStorage : null
      );
      setPopupDistinctVisitDays(visit.count);
    };
    recordVisit();
    connection?.socket?.on?.("connect", recordVisit);
    const unsubscribeViewport = connection?.layout?.subscribeViewport?.(
      recordVisit,
      [VIEWPORT_EVENTS.PAGE_SHOW]
    );
    return () => {
      connection?.socket?.off?.("connect", recordVisit);
      unsubscribeViewport?.();
    };
  }, [account?.userId, connection?.layout, connection?.socket]);

  React.useEffect(() => {
    if (!account?.installId || !isLobbyPopupView(environment?.phase, environment?.appView)) {
      return;
    }
    duel?.fetchStatus?.();
  }, [
    account?.installId,
    account?.isAuthenticated,
    duel?.fetchStatus,
    environment?.appView,
    environment?.phase,
  ]);

  React.useEffect(() => {
    const action = resolveLobbyPopupAction({
      accountCreatedAt: account?.createdAt,
      accountSeenMarkers: account?.seenMarkers,
      accountSeenReady: account?.seenReady,
      appView: environment?.appView,
      bootOverlayVisible: environment?.bootOverlayVisible,
      bootReady: environment?.bootReady,
      broadcastLoading: overlays?.broadcastLoading,
      broadcastMessage: overlays?.broadcastMessage,
      definitionModalOpen: overlays?.definitionModalOpen,
      duelObjectivesPopupDismissedDateId: duel?.objectivesPopupDismissedDateId,
      duelPopupMode: duel?.popupState?.mode,
      duelStatus: duel?.status,
      facebookAttemptedMarker: facebookAttemptedMarkerRef.current,
      isAboutOpen: overlays?.isAboutOpen,
      isAccountAuthenticated: account?.isAuthenticated,
      isAccountMenuOpen: overlays?.isAccountMenuOpen,
      isFacebookInviteOpen: overlays?.isFacebookInviteOpen,
      isHomeChatOpen: overlays?.isHomeChatOpen,
      isLegacyConverted: account?.isLegacyConverted,
      isLoggedIn: environment?.isLoggedIn,
      isNewPlayerPopupQuiet: account?.isNewPlayerPopupQuiet,
      isPatchNotesOpen: overlays?.isPatchNotesOpen,
      isPlayersOverlayOpen: overlays?.isPlayersOverlayOpen,
      isSettingsOpen: overlays?.isSettingsOpen,
      isSupportOpen: overlays?.isSupportOpen,
      phase: environment?.phase,
      popupDistinctVisitDays,
      shouldShowTutorial: overlays?.shouldShowTutorial,
      vaultAttemptedMarkers: vaultAttemptedMarkersRef.current,
      vaultPopupOpen: vault?.popup?.open,
      wordVault: vault?.words,
    });
    if (!action) return undefined;

    if (action.type === "close-duel") {
      duel?.setPopupState?.({ mode: null, step: 0, team: null, weekId: null });
      return undefined;
    }
    if (action.type === "patch-notes") {
      overlays?.setIsPatchNotesOpen?.(true);
      account?.markSeen?.(action.marker);
      return undefined;
    }
    if (action.type === "facebook-invite") {
      facebookAttemptedMarkerRef.current = action.marker;
      account?.markSeen?.(action.marker);
      overlays?.setIsFacebookInviteOpen?.(true);
      return undefined;
    }
    if (action.type === "consume-legacy-duel") {
      account?.markSeen?.(action.markers);
      return undefined;
    }
    if (action.type === "duel") {
      duel?.setPopupState?.({
        mode: action.mode,
        step: 0,
        team: duel?.status?.team || null,
        weekId: duel?.status?.weekId || null,
      });
      return undefined;
    }

    vaultAttemptedMarkersRef.current.add(action.marker);
    let cancelled = false;
    void (async () => {
      const candidates = pickVaultWordOfDayCandidates(vault?.words?.words);
      for (const candidate of candidates) {
        if (cancelled) return;
        const result = await fetchDefinitionSummaryForWordOfDay(candidate.word).catch(
          () => null
        );
        if (!result?.definition) continue;
        if (cancelled) return;
        vault?.setPopup?.({
          dateId: action.dateId,
          definition: result.definition,
          displayWord: result.displayWord || candidate.word,
          open: true,
          source: result.source || "",
          url: result.url || "",
          word: result.word || candidate.word,
        });
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    account?.createdAt,
    account?.isAuthenticated,
    account?.isLegacyConverted,
    account?.isNewPlayerPopupQuiet,
    account?.markSeen,
    account?.seenMarkers,
    account?.seenReady,
    duel?.objectivesPopupDismissedDateId,
    duel?.popupState?.mode,
    duel?.setPopupState,
    duel?.status,
    environment?.appView,
    environment?.bootOverlayVisible,
    environment?.bootReady,
    environment?.isLoggedIn,
    environment?.phase,
    overlays?.broadcastLoading,
    overlays?.broadcastMessage,
    overlays?.definitionModalOpen,
    overlays?.isAboutOpen,
    overlays?.isAccountMenuOpen,
    overlays?.isFacebookInviteOpen,
    overlays?.isHomeChatOpen,
    overlays?.isPatchNotesOpen,
    overlays?.isPlayersOverlayOpen,
    overlays?.isSettingsOpen,
    overlays?.isSupportOpen,
    overlays?.setIsFacebookInviteOpen,
    overlays?.setIsPatchNotesOpen,
    overlays?.shouldShowTutorial,
    popupDistinctVisitDays,
    vault?.popup?.open,
    vault?.setPopup,
    vault?.words,
  ]);
}
