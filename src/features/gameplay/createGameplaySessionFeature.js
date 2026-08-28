import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";

const ORIGIN_VIEWS = Object.freeze({
  daily: new Set(["daily_play"]),
  dev: new Set(["live"]),
  live: new Set(["live"]),
  training: new Set(["training"]),
});

function createInitialState() {
  return {
    capabilities: null,
    entryKind: null,
    generation: 0,
    origin: null,
    phase: "idle",
    roomId: null,
    roundId: null,
    roundStatus: null,
    sessionId: null,
    startsAt: null,
    endsAt: null,
    lastCancelReason: null,
  };
}

function normalizeId(value) {
  if (value == null || value === "") return null;
  return String(value);
}

function normalizeOrigin(value) {
  const origin = String(value || "").trim().toLowerCase();
  return Object.hasOwn(ORIGIN_VIEWS, origin) ? origin : null;
}

function normalizePhase(value) {
  const phase = String(value || "").trim().toLowerCase();
  if (phase === "intro") return "intro";
  if (phase === "playing") return "playing";
  if (phase === "ending" || phase === "resolving") return "resolving";
  if (phase === "results") return "results";
  if (phase === "break" || phase === "intermission") return "intermission";
  if (phase === "preparing") return "preparing";
  if (phase === "lobby") return "lobby";
  return "idle";
}

function getSnapshotRoundId(snapshot) {
  return normalizeId(
    snapshot?.currentRound?.roundId ??
      snapshot?.lastRoundResults?.round?.roundId ??
      snapshot?.lastRoundResults?.round?.id ??
      snapshot?.lastRoundResults?.payload?.roundId
  );
}

function isCompatibleView(origin, view) {
  const allowedViews = ORIGIN_VIEWS[origin];
  return !!allowedViews?.has?.(String(view || ""));
}

export function createGameplaySessionFeature({ getKernel, scope }) {
  const store = createFeatureStore(createInitialState());
  const refs = Object.freeze({
    sessionId: { current: null },
  });
  let active = false;
  let config = {};
  let generation = 0;
  let sessionScope = null;

  function disposeSessionResources() {
    sessionScope?.dispose?.();
    sessionScope = null;
  }

  function replaceSession(next) {
    refs.sessionId.current = next.sessionId;
    store.replace(next);
    return next;
  }

  function openSession({
    capabilities = null,
    endsAt = null,
    entryKind = "start",
    origin,
    phase = "playing",
    roomId = null,
    roundId = null,
    roundStatus = null,
    startsAt = null,
  } = {}) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      return { accepted: false, error: "invalid_origin", state: store.getState() };
    }
    generation += 1;
    disposeSessionResources();
    sessionScope = createResourceScope(`gameplay:${normalizedOrigin}:${generation}`);
    const next = {
      capabilities:
        capabilities && typeof capabilities === "object"
          ? Object.freeze({ ...capabilities })
          : null,
      entryKind: String(entryKind || "start"),
      generation,
      origin: normalizedOrigin,
      phase: normalizePhase(phase),
      roomId: normalizeId(roomId),
      roundId: normalizeId(roundId),
      roundStatus: roundStatus == null ? null : String(roundStatus),
      sessionId: `${normalizedOrigin}:${generation}`,
      startsAt: Number.isFinite(startsAt) ? startsAt : null,
      endsAt: Number.isFinite(endsAt) ? endsAt : null,
      lastCancelReason: null,
    };
    replaceSession(next);
    config.onTransition?.({ kind: "opened", state: next });
    return { accepted: true, duplicate: false, state: next };
  }

  function startRound(payload = {}, { entryKind = "event", origin = "live" } = {}) {
    const current = store.getState();
    const nextOrigin = normalizeOrigin(origin);
    const nextRoomId = normalizeId(payload?.roomId);
    const nextRoundId = normalizeId(payload?.roundId);
    const duplicate =
      current.sessionId &&
      current.origin === nextOrigin &&
      (current.phase === "intro" || current.phase === "playing") &&
      current.roomId === nextRoomId &&
      current.roundId === nextRoundId;
    if (duplicate) {
      return { accepted: false, duplicate: true, state: current };
    }
    return openSession({
      endsAt: payload?.endsAt,
      entryKind,
      origin: nextOrigin,
      phase: payload?.status === "intro" ? "intro" : "playing",
      roomId: nextRoomId,
      roundId: nextRoundId,
      roundStatus: payload?.status || "running",
      startsAt: payload?.startsAt,
    });
  }

  function hydrateSnapshot(snapshot, { entryKind = "resume" } = {}) {
    if (!snapshot || typeof snapshot !== "object") {
      return { accepted: false, error: "invalid_snapshot", state: store.getState() };
    }
    const phase = normalizePhase(snapshot.phase || "lobby");
    const currentRound = snapshot.currentRound || null;
    return openSession({
      endsAt: currentRound?.endsAt,
      entryKind,
      origin: "live",
      phase,
      roomId: snapshot.roomId,
      roundId: getSnapshotRoundId(snapshot),
      roundStatus: currentRound?.status || null,
      startsAt: currentRound?.startsAt,
      capabilities: snapshot?.player?.capabilities || null,
    });
  }

  function transitionPhase(phase, payload = {}) {
    const current = store.getState();
    if (!current.sessionId) {
      return { accepted: false, error: "no_session", state: current };
    }
    const incomingRoomId = normalizeId(payload?.roomId);
    const incomingRoundId = normalizeId(payload?.roundId);
    if (incomingRoomId && current.roomId && incomingRoomId !== current.roomId) {
      return { accepted: false, error: "wrong_room", state: current };
    }
    if (incomingRoundId && current.roundId && incomingRoundId !== current.roundId) {
      return { accepted: false, error: "wrong_round", state: current };
    }
    const next = {
      ...current,
      phase: normalizePhase(phase),
      endsAt: Number.isFinite(payload?.endsAt) ? payload.endsAt : current.endsAt,
      roundStatus:
        payload?.status == null ? current.roundStatus : String(payload.status),
    };
    replaceSession(next);
    config.onTransition?.({ kind: "phase", previous: current, state: next });
    return { accepted: true, state: next };
  }

  function acceptsEvent({ origin = "live", roomId = null, roundId = null } = {}) {
    const current = store.getState();
    if (!current.sessionId || current.origin !== normalizeOrigin(origin)) return false;
    const incomingRoomId = normalizeId(roomId);
    const incomingRoundId = normalizeId(roundId);
    if (incomingRoomId && incomingRoomId !== current.roomId) return false;
    if (incomingRoundId && incomingRoundId !== current.roundId) return false;
    return true;
  }

  function updateCapabilities(nextCapabilities, payload = {}) {
    const current = store.getState();
    if (
      !acceptsEvent({
        origin: payload?.origin || current.origin,
        roomId: payload?.roomId,
        roundId: payload?.roundId,
      })
    ) {
      return { accepted: false, error: "stale_session", state: current };
    }
    const resolved =
      typeof nextCapabilities === "function"
        ? nextCapabilities(current.capabilities)
        : nextCapabilities;
    const capabilities =
      resolved && typeof resolved === "object"
        ? Object.freeze({ ...resolved })
        : null;
    const next = { ...current, capabilities };
    replaceSession(next);
    config.onTransition?.({ kind: "capabilities", previous: current, state: next });
    return { accepted: true, state: next };
  }

  function registerResource(dispose, expectedSessionId = refs.sessionId.current) {
    if (typeof dispose !== "function") return () => {};
    if (!sessionScope || expectedSessionId !== refs.sessionId.current) {
      dispose();
      return () => {};
    }
    return sessionScope.add(dispose);
  }

  function isCurrent(sessionId) {
    return !!sessionId && refs.sessionId.current === sessionId;
  }

  function cancel(reason = "cancelled") {
    const current = store.getState();
    if (!current.sessionId) return false;
    disposeSessionResources();
    refs.sessionId.current = null;
    const next = {
      ...createInitialState(),
      generation,
      lastCancelReason: String(reason || "cancelled"),
    };
    store.replace(next);
    config.onCancel?.({ reason: next.lastCancelReason, previous: current });
    config.onTransition?.({ kind: "cancelled", previous: current, state: next });
    return true;
  }

  function configure(nextConfig = {}) {
    config = { ...config, ...nextConfig };
  }

  function reconcileNavigation() {
    const current = store.getState();
    if (!current.sessionId) return;
    const view = getKernel?.()?.getState?.()?.navigation?.view;
    if (!isCompatibleView(current.origin, view)) {
      cancel(`navigation:${view || "unknown"}`);
    }
  }

  function start() {
    active = true;
    const kernel = getKernel?.();
    if (kernel?.subscribe) scope.add(kernel.subscribe(reconcileNavigation));
    reconcileNavigation();
    scope.add(() => {
      if (!active) return;
      active = false;
      disposeSessionResources();
      config = {};
      refs.sessionId.current = null;
      store.replace(createInitialState());
    });
  }

  return Object.freeze({
    acceptsEvent,
    cancel,
    configure,
    hydrateSnapshot,
    isCurrent,
    refs,
    registerResource,
    start,
    startRound,
    store,
    transitionPhase,
    updateCapabilities,
  });
}
