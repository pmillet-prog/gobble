import React from "react";

const RETRY_DELAY_MS = 5000;
const MAX_MARKER_LENGTH = 180;

function normalizeMarkers(rawMarkers) {
  const source = Array.isArray(rawMarkers) ? rawMarkers : [rawMarkers];
  return Array.from(
    new Set(
      source
        .map((marker) => String(marker || "").trim())
        .filter(
          (marker) =>
            marker &&
            marker.length <= MAX_MARKER_LENGTH &&
            !/[\u0000-\u001f\u007f]/u.test(marker)
        )
    )
  );
}

export default function useAccountSeenMarkers({ authenticatedUserId, isAuthenticated }) {
  const safeUserId = Number.isInteger(Number(authenticatedUserId))
    ? Number(authenticatedUserId)
    : null;
  const [state, setState] = React.useState({ userId: null, ready: false, markers: new Set() });
  const stateRef = React.useRef(state);
  const activeUserIdRef = React.useRef(safeUserId);
  const pendingRef = React.useRef(new Set());
  const flushInFlightRef = React.useRef(false);
  const retryTimerRef = React.useRef(null);
  const flushRef = React.useRef(null);

  activeUserIdRef.current = isAuthenticated ? safeUserId : null;
  stateRef.current = state;

  const scheduleFlush = React.useCallback((delayMs = 0) => {
    if (retryTimerRef.current || typeof window === "undefined") return;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushRef.current?.();
    }, Math.max(0, Number(delayMs) || 0));
  }, []);

  flushRef.current = async () => {
    if (flushInFlightRef.current) return;
    const userId = activeUserIdRef.current;
    const markers = normalizeMarkers(Array.from(pendingRef.current)).slice(0, 64);
    if (!userId || markers.length === 0) return;
    flushInFlightRef.current = true;
    try {
      const response = await fetch("/api/auth/ui-seen", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ markers }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) throw new Error(data?.error || "ui_seen_failed");
      markers.forEach((marker) => pendingRef.current.delete(marker));
      if (pendingRef.current.size > 0) scheduleFlush(0);
    } catch (_) {
      if (activeUserIdRef.current === userId) scheduleFlush(RETRY_DELAY_MS);
    } finally {
      flushInFlightRef.current = false;
      if (activeUserIdRef.current && pendingRef.current.size > 0) {
        scheduleFlush(
          activeUserIdRef.current === userId ? RETRY_DELAY_MS : 0
        );
      }
    }
  };

  const markSeen = React.useCallback(
    (rawMarkers) => {
      const userId = activeUserIdRef.current;
      const knownMarkers =
        stateRef.current.userId === userId ? stateRef.current.markers : new Set();
      const markers = normalizeMarkers(rawMarkers).filter(
        (marker) => !knownMarkers.has(marker) && !pendingRef.current.has(marker)
      );
      if (!userId || markers.length === 0) return;
      markers.forEach((marker) => pendingRef.current.add(marker));
      setState((previous) => {
        const nextMarkers = new Set(
          previous.userId === userId ? previous.markers : []
        );
        markers.forEach((marker) => nextMarkers.add(marker));
        return { userId, ready: previous.userId === userId ? previous.ready : false, markers: nextMarkers };
      });
      scheduleFlush(0);
    },
    [scheduleFlush]
  );

  React.useEffect(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    pendingRef.current = new Set();
    if (!isAuthenticated || !safeUserId) {
      setState({ userId: null, ready: true, markers: new Set() });
      return undefined;
    }
    let cancelled = false;
    let loadRetryTimer = null;
    setState({ userId: safeUserId, ready: false, markers: new Set() });
    const loadMarkers = () => {
      fetch("/api/auth/ui-seen", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok || data?.ok === false) {
            throw new Error(data?.error || "ui_seen_failed");
          }
          return normalizeMarkers(data?.markers);
        })
        .then((markers) => {
          if (cancelled || activeUserIdRef.current !== safeUserId) return;
          const merged = new Set(markers);
          pendingRef.current.forEach((marker) => merged.add(marker));
          setState({ userId: safeUserId, ready: true, markers: merged });
          if (pendingRef.current.size > 0) scheduleFlush(0);
        })
        .catch(() => {
          if (cancelled || activeUserIdRef.current !== safeUserId) return;
          loadRetryTimer = window.setTimeout(loadMarkers, RETRY_DELAY_MS);
        });
    };
    loadMarkers();
    return () => {
      cancelled = true;
      if (loadRetryTimer) window.clearTimeout(loadRetryTimer);
    };
  }, [isAuthenticated, safeUserId, scheduleFlush]);

  React.useEffect(
    () => () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    },
    []
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const flushPending = () => {
      void flushRef.current?.();
    };
    window.addEventListener("pagehide", flushPending);
    return () => window.removeEventListener("pagehide", flushPending);
  }, []);

  return {
    ready: !isAuthenticated || (state.userId === safeUserId && state.ready),
    markers: state.userId === safeUserId ? state.markers : new Set(),
    markSeen,
  };
}
