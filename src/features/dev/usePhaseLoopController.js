import React from "react";

export function readPhaseLoopTestEnabled(search, queryParam = "phaseLoop") {
  try {
    const raw = new URLSearchParams(String(search || "")).get(queryParam);
    if (!raw) return false;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on";
  } catch (_) {
    return false;
  }
}

export function createPhaseLoopController({
  clearScheduledTimeout = clearTimeout,
  getWallNowMs = Date.now,
  scheduleTimeout = setTimeout,
} = {}) {
  let config = {};
  let running = false;
  let roundCounter = 0;
  let timerId = null;

  function clearTimer() {
    if (timerId == null) return;
    clearScheduledTimeout(timerId);
    timerId = null;
  }

  function stop() {
    running = false;
    clearTimer();
  }

  function schedule(callback, delayMs) {
    clearTimer();
    timerId = scheduleTimeout(() => {
      timerId = null;
      if (!running) return;
      if (config.getCurrentView?.() !== "live") return;
      callback();
    }, Math.max(0, Math.round(delayMs)));
  }

  function enterResultsPhase() {
    if (!running) return;
    const resultsMs = Math.max(0, Number(config.timings?.resultsMs) || 0);
    const sourceRoomId = config.getSourceRoomId?.() || null;
    config.onEnterResults?.({
      nextStartAt: getWallNowMs() + resultsMs,
      sourceRoomId,
    });
    schedule(startIntroAndPlayingPhase, resultsMs);
  }

  function startIntroAndPlayingPhase() {
    if (!running) return;
    const sourceRoomId = config.getSourceRoomId?.() || null;
    const fallbackGridSize = Math.max(1, Number(config.fallbackGridSize) || 4);
    const gridSize =
      Number(config.resolveGridSize?.(sourceRoomId)) || fallbackGridSize;
    const grid = config.createGrid?.(gridSize) || [];
    const nowServerMs = Number(config.getNowServerMs?.()) || 0;
    const introMs = Math.max(0, Number(config.timings?.introMs) || 0);
    const playingMs = Math.max(0, Number(config.timings?.playingMs) || 0);
    const playingGuardMs = Math.max(
      0,
      Number(config.timings?.playingGuardMs) || 0
    );
    const startsAt = nowServerMs + introMs;
    const endsAt = startsAt + playingMs + playingGuardMs;
    roundCounter += 1;
    const roundId = `phase-loop-${roundCounter}-${getWallNowMs()}`;

    config.onStartRound?.({
      endsAt,
      grid,
      gridSize,
      introMs,
      roundId,
      sourceRoomId,
      startsAt,
    });
    schedule(enterResultsPhase, introMs + playingMs);
  }

  function configure(nextConfig = {}) {
    config = nextConfig;
  }

  function start() {
    stop();
    running = true;
    roundCounter = 0;
    config.stopRoundEffects?.();
    enterResultsPhase();
  }

  return Object.freeze({
    configure,
    start,
    stop,
  });
}

export default function usePhaseLoopController({ enabled, restartKey, ...config }) {
  const controllerRef = React.useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createPhaseLoopController();
  }
  controllerRef.current.configure(config);

  React.useEffect(() => {
    const controller = controllerRef.current;
    if (enabled) controller.start();
    else controller.stop();
    return () => controller.stop();
  }, [enabled, restartKey]);
}
