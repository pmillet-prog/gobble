import React from "react";

import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export function useRoundClockController({
  countdownSeconds,
  deadlineServerMs,
  disabled = false,
  getServerNowMs,
  maxSeconds,
  onCountdownElapsed,
  onOcidExpired,
  onRoundExpired,
  phase,
  sessionTokenRef,
  specialRoundType,
}) {
  const clock = useFeatureRuntime("clock");
  const callbacksRef = React.useRef({
    getServerNowMs,
    onCountdownElapsed,
    onOcidExpired,
    onRoundExpired,
  });
  React.useLayoutEffect(() => {
    callbacksRef.current = {
      getServerNowMs,
      onCountdownElapsed,
      onOcidExpired,
      onRoundExpired,
    };
  }, [getServerNowMs, onCountdownElapsed, onOcidExpired, onRoundExpired]);

  React.useEffect(() => {
    const effectSessionToken = sessionTokenRef.current;
    let countdownTimerId = null;
    let elapsedHandled = false;
    const isCurrentSession = () =>
      sessionTokenRef.current === effectSessionToken;
    const unsubscribeExpiration = clock.onExpired(() => {
      if (elapsedHandled || !isCurrentSession()) return;
      elapsedHandled = true;
      if (specialRoundType === "ocid") {
        callbacksRef.current.onOcidExpired?.(effectSessionToken);
        return;
      }
      callbacksRef.current.onRoundExpired?.(effectSessionToken);
    });

    if (phase === "countdown") {
      clock.setCountdown(countdownSeconds);
      countdownTimerId = window.setTimeout(() => {
        if (!isCurrentSession()) return;
        callbacksRef.current.onCountdownElapsed?.(effectSessionToken);
      }, 1000);
    } else if (phase === "playing" && !disabled) {
      clock.startRound({
        deadlineServerMs: Number.isFinite(deadlineServerMs)
          ? deadlineServerMs
          : callbacksRef.current.getServerNowMs() + maxSeconds * 1000,
        maxSeconds,
        serverNowMs: callbacksRef.current.getServerNowMs(),
      });
    } else {
      clock.stop({ preserveRemaining: true });
    }

    return () => {
      if (countdownTimerId != null) {
        window.clearTimeout(countdownTimerId);
      }
      unsubscribeExpiration();
      clock.stop({ preserveRemaining: true });
    };
  }, [
    clock,
    countdownSeconds,
    deadlineServerMs,
    disabled,
    maxSeconds,
    phase,
    sessionTokenRef,
    specialRoundType,
  ]);

}

export default function RoundClockController(props) {
  useRoundClockController(props);
  return null;
}
