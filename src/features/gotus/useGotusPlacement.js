import React from "react";
import { useFeatureRuntime, useFeatureFields } from "../../app/react/useFeatureRuntime.js";

// Eligibility, the target celebration latch and existing portal hosts are shared
// with the waiting-game placement. Selecting Gotus never starts the quiz session.
export default function useGotusPlacement({ quizPlacement, miniGameKind, roundId, context }) {
  const feature = useFeatureRuntime("gotus");
  const state = useFeatureFields(feature, ["key", "started", "dismissed", "summary"]);
  const enabled = miniGameKind === "gotus" && context.appView === "live" && context.isLoggedIn &&
    !context.currentRoundTraining && !context.standaloneTrainingSession;
  const key = enabled ? `${context.userId ?? context.nickname}:${context.roomId}:${roundId}` : "";
  React.useLayoutEffect(() => {
    feature.configure({ key, roundId, selfUserId: context.userId, selfNick: context.nickname });
  }, [feature, key, roundId, context.userId, context.nickname]);
  React.useEffect(() => {
    if (!enabled || !context.socket) return undefined;
    const onProgress = payload => {
      if (String(payload?.roundId) !== String(roundId)) return;
      feature.capture(roundId, { ...payload.summary, ...payload, started: true });
    };
    context.socket.on("gotus:progress", onProgress);
    return () => context.socket.off("gotus:progress", onProgress);
  }, [feature, enabled, context.socket, roundId]);
  const onSessionStateChange = React.useCallback(value => feature.capture(roundId, value), [feature, roundId]);
  // Once the Gotus session has started, later target celebrations must not
  // unmount it; the initial celebration gate belongs only to first entry.
  const active = !!quizPlacement?.active || (state.started && !!quizPlacement?.canRun);
  return { ...quizPlacement, active: enabled && state.key === key && !state.dismissed && active,
    onSessionStateChange, onDismiss: feature.dismiss, summary: state.key === key ? state.summary : null };
}
