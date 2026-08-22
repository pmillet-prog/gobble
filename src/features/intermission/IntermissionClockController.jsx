import React from "react";

import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export function useIntermissionClockController({ getServerNowMs, nextStartAt }) {
  const clock = useFeatureRuntime("intermission");
  const getServerNowMsRef = React.useRef(getServerNowMs);

  React.useLayoutEffect(() => {
    getServerNowMsRef.current = getServerNowMs;
  }, [getServerNowMs]);

  React.useEffect(() => {
    if (!Number.isFinite(nextStartAt)) {
      clock.stop();
      return undefined;
    }
    clock.startCountdown({
      deadlineServerMs: Number(nextStartAt),
      serverNowMs: getServerNowMsRef.current(),
    });
    return () => clock.stop();
  }, [clock, nextStartAt]);

  return clock;
}
