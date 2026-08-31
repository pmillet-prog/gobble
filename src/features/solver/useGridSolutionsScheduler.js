import React from "react";

import {
  disposeClientSolverWorker,
  solveGridInWorker,
} from "../../compute/clientSolverWorker.js";

export function createGridSolutionsScheduler({
  cancelIdle =
    typeof window !== "undefined" && typeof window.cancelIdleCallback === "function"
      ? window.cancelIdleCallback.bind(window)
      : null,
  clearScheduledTimeout = clearTimeout,
  disposeWorker = disposeClientSolverWorker,
  requestIdle =
    typeof window !== "undefined" && typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback.bind(window)
      : null,
  scheduleTimeout = setTimeout,
  solve = solveGridInWorker,
} = {}) {
  let activeKey = null;
  let fallbackTimerId = null;
  let idleRequestId = null;
  let kickoffTimerId = null;

  function clearScheduledWork() {
    if (kickoffTimerId != null) {
      clearScheduledTimeout(kickoffTimerId);
      kickoffTimerId = null;
    }
    if (fallbackTimerId != null) {
      clearScheduledTimeout(fallbackTimerId);
      fallbackTimerId = null;
    }
    if (idleRequestId != null) {
      if (cancelIdle) {
        try {
          cancelIdle(idleRequestId);
        } catch (_) {}
      }
      idleRequestId = null;
    }
  }

  function cancel() {
    activeKey = null;
    clearScheduledWork();
  }

  function isCurrent(key) {
    return activeKey === key;
  }

  async function run(key, job) {
    if (!isCurrent(key)) return;
    let solutions;
    try {
      job.onStart?.();
      const rawSolutions = await solve(job.board, job.special);
      if (!isCurrent(key)) return;
      solutions = job.onWorkerResult?.(rawSolutions, {
        board: job.board,
        updateBestRefs: job.updateBestRefs,
      });
    } catch (error) {
      if (!isCurrent(key)) return;
      job.onWorkerError?.(error);
      solutions = job.onFallback?.({
        board: job.board,
        updateBestRefs: job.updateBestRefs,
      });
    }
    if (!isCurrent(key)) return;
    job.onComplete?.(solutions);
  }

  function schedule(job = {}) {
    cancel();
    if (!Array.isArray(job.board) || job.board.length === 0) return false;

    const key =
      job.jobKey || `solve-${Date.now()}-${Math.random()}`;
    activeKey = key;
    const kickoffDelay =
      typeof job.delayMs === "number" && Number.isFinite(job.delayMs)
        ? Math.max(0, Math.round(job.delayMs))
        : 4500;
    kickoffTimerId = scheduleTimeout(() => {
      kickoffTimerId = null;
      if (!isCurrent(key)) return;
      if (requestIdle) {
        idleRequestId = requestIdle(
          () => {
            idleRequestId = null;
            void run(key, job);
          },
          { timeout: 15000 }
        );
        return;
      }
      fallbackTimerId = scheduleTimeout(() => {
        fallbackTimerId = null;
        void run(key, job);
      }, 600);
    }, kickoffDelay);
    return true;
  }

  function dispose(reason = "application_disposed") {
    cancel();
    disposeWorker?.(reason);
  }

  return Object.freeze({
    cancel,
    dispose,
    hasActiveJob: () => activeKey != null,
    schedule,
  });
}

export default function useGridSolutionsScheduler() {
  const schedulerRef = React.useRef(null);
  if (!schedulerRef.current) {
    schedulerRef.current = createGridSolutionsScheduler();
  }

  React.useEffect(
    () => () => schedulerRef.current.dispose("application_disposed"),
    []
  );
  return schedulerRef.current;
}
