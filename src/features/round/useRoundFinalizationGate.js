import React from "react";

export function createRoundFinalizationGate({
  clearScheduledTimeout = clearTimeout,
  scheduleTimeout = setTimeout,
} = {}) {
  let config = {};
  let timerId = null;

  function configure(nextConfig = {}) {
    config = nextConfig;
  }

  function cancel() {
    if (timerId == null) return;
    clearScheduledTimeout(timerId);
    timerId = null;
  }

  function complete(effectSessionToken) {
    if (config.sessionTokenRef?.current !== effectSessionToken) return false;
    config.onFinalize?.(effectSessionToken);
    return true;
  }

  function request(effectSessionToken) {
    cancel();
    const hadPendingDragMove = !!config.flushPendingDragMove?.();
    if (!hadPendingDragMove) {
      return complete(effectSessionToken) ? "completed" : "stale";
    }
    timerId = scheduleTimeout(() => {
      timerId = null;
      complete(effectSessionToken);
    }, 0);
    return "deferred";
  }

  return Object.freeze({
    cancel,
    configure,
    request,
  });
}

export default function useRoundFinalizationGate(config) {
  const gateRef = React.useRef(null);
  if (!gateRef.current) {
    gateRef.current = createRoundFinalizationGate();
  }
  gateRef.current.configure(config);

  React.useEffect(() => () => gateRef.current.cancel(), []);
  return gateRef.current;
}
