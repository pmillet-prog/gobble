import { createStateFeature } from "../../app/core/createStateFeature.js";
import { shouldProcessAttachedLiveRoomEvent } from "../../utils/liveEventScope.js";

const EMPTY_LIST = Object.freeze([]);

export function createInitialLiveFeedState() {
  return {
    announcements: EMPTY_LIST,
    lastWords: EMPTY_LIST,
  };
}

export function createLiveFeedFeature(context) {
  let active = false;
  let feature = null;
  let realtimeConfig = {};
  let realtimeSocket = null;
  let realtimeUnsubscribe = null;

  function shouldHandleRealtimeEvent(incomingRoomId = null, incomingRoundId = null) {
    if (realtimeConfig.phaseLoopTestEnabledRef?.current) return false;
    if (realtimeConfig.standaloneTrainingSessionRef?.current) return false;
    return shouldProcessAttachedLiveRoomEvent({
      appView: realtimeConfig.appViewRef?.current,
      gameplaySession: realtimeConfig.gameplaySession,
      isLoggedIn: realtimeConfig.isLoggedInRef?.current,
      activeRoomId: realtimeConfig.currentRoomIdRef?.current,
      incomingRoomId,
      incomingRoundId,
      liveSessionReadyRef: realtimeConfig.liveSessionReadyRef,
    });
  }

  function appendAnnouncements(entries) {
    if (!entries || entries.length === 0) return;
    feature.set("announcements", (previous) =>
      [...previous, ...entries].slice(-40)
    );
  }

  function maybeTriggerGobble(entry) {
    if (!entry || realtimeConfig.phaseRef?.current !== "playing") return;
    if (
      entry.type !== "best_possible_score" &&
      entry.type !== "longest_possible"
    ) {
      return;
    }
    const selfRaw = String(
      realtimeConfig.nicknameRef?.current || realtimeConfig.nickname || ""
    ).trim();
    const authorRaw = String(entry.nick || "").trim();
    const self = selfRaw ? selfRaw.toLowerCase() : "";
    const author = authorRaw ? authorRaw.toLowerCase() : "";
    if (!self || !author || self !== author) return;
    if (Date.now() - Number(realtimeConfig.lastGobbleAtRef?.current || 0) < 1600) {
      return;
    }
    realtimeConfig.triggerPraiseFlash?.("GOBBLE !", {
      kind: "gobble",
      shakeGrid: true,
    });
    realtimeConfig.triggerConfettiBurst?.("gobble");
  }

  function maybeShowDuelToast(entry) {
    if (!entry || entry.type !== "objective_validated") return;
    const selfNick = String(realtimeConfig.nicknameRef?.current || "")
      .trim()
      .toLowerCase();
    const nick = String(entry.nick || "").trim().toLowerCase();
    if (!selfNick || !nick || selfNick !== nick) return;
    const message = realtimeConfig.buildObjectiveToastMessage?.(
      {
        objectiveId: entry.objectiveId,
        objectiveTitle: entry.objectiveTitle,
        objectiveBucket: entry.objectiveBucket,
        objectiveProgress: entry.objectiveProgress,
        objectiveTarget: entry.objectiveTarget,
        teamPoints: entry.teamPoints,
      },
      { validated: true }
    );
    realtimeConfig.showToast?.(message, 2800);
  }

  function maybeShowFakeTwinsToast(entry) {
    if (!entry || entry.type !== "fake_twins_completed") return;
    const bonus = Math.max(0, Number(entry.bonus) || 0);
    const nick = String(entry.nick || "").trim();
    const label = bonus > 0 ? `+${bonus} pts` : "bonus validé";
    realtimeConfig.showToast?.(
      nick
        ? `${nick} complète les faux jumeaux : ${label}`
        : `Faux jumeaux complétés : ${label}`,
      3200
    );
  }

  function maybeShowCultureThemeToast(entry) {
    if (!entry || entry.type !== "culture_theme_completed") return;
    const bonus = Math.max(0, Number(entry.bonus) || 0);
    const nick = String(entry.nick || "").trim();
    const theme = String(entry.theme || "").trim();
    const label = bonus > 0 ? `+${bonus} pts` : "bonus validé";
    const subject = theme ? `WikiMama ${theme}` : "WikiMama";
    realtimeConfig.showToast?.(
      nick
        ? `${nick} complète ${subject} : ${label}`
        : `${subject} complété : ${label}`,
      3200
    );
  }

  function processAnnouncement(entry) {
    realtimeConfig.maybePlayAnnouncementSound?.(entry);
    maybeTriggerGobble(entry);
    maybeShowDuelToast(entry);
    maybeShowFakeTwinsToast(entry);
    maybeShowCultureThemeToast(entry);
  }

  function onAnnouncement(entry) {
    if (!entry || !shouldHandleRealtimeEvent(entry.roomId, entry.roundId)) return;
    if (entry.type === "big_word" || entry.type === "long_word") return;
    processAnnouncement(entry);
    appendAnnouncements([entry]);
  }

  function onAnnouncements(batch) {
    if (!Array.isArray(batch) || batch.length === 0) return;
    const filtered = batch.filter(
      (entry) =>
        entry &&
        shouldHandleRealtimeEvent(entry.roomId, entry.roundId) &&
        entry.type !== "big_word" &&
        entry.type !== "long_word"
    );
    if (!filtered.length) return;
    filtered.forEach(processAnnouncement);
    appendAnnouncements(filtered);
  }

  function bindRealtime() {
    const nextSocket = realtimeConfig.socket || context.ports?.realtime || null;
    if (realtimeSocket === nextSocket && realtimeUnsubscribe) return;
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    realtimeSocket = nextSocket;
    if (!active || typeof realtimeSocket?.bind !== "function") return;
    realtimeUnsubscribe = realtimeSocket.bind({
      announcement: onAnnouncement,
      announcements: onAnnouncements,
    });
  }

  function configureRealtime(nextConfig = {}) {
    realtimeConfig = nextConfig;
    bindRealtime();
  }

  feature = createStateFeature(context, createInitialLiveFeedState, {
    start: ({ scope, store }) => {
      active = true;
      bindRealtime();
      scope.add(() => {
        active = false;
        realtimeUnsubscribe?.();
        realtimeUnsubscribe = null;
        realtimeSocket = null;
        realtimeConfig = {};
        store.patch(createInitialLiveFeedState());
      });
    },
  });

  const setAnnouncements = (nextOrUpdater) =>
    feature.set("announcements", nextOrUpdater);
  const setLastWords = (nextOrUpdater) =>
    feature.set("lastWords", nextOrUpdater);
  const reset = () => feature.patch(createInitialLiveFeedState());

  return Object.freeze({
    ...feature,
    configureRealtime,
    reset,
    setAnnouncements,
    setLastWords,
  });
}
