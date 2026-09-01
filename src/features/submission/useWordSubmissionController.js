import React from "react";

import { useLazyObjectController } from "../../app/react/useLazyController.js";
import { normalizeWord } from "../../components/gameLogic.js";
import { createWordSubmissionEngine } from "../../game/createWordSubmissionEngine.js";
import {
  capturePendingSubmissions,
  reconcilePendingSubmissions,
} from "../../network/liveSubmissionRecovery.js";
import { recordPerfEvent } from "../../perf/renderPerfProbe.js";

const WORD_SUBMISSION_CONTROLLER_METHODS = Object.freeze([
  "getLivePreviewLabelForCell",
  "getPathPreviewScoreConfig",
  "isKnownSubmissionWord",
  "requeueInFlightSubmissions",
  "restorePendingSubmissionEntries",
  "scheduleBatchFlush",
  "submit",
  "syncLiveSpecial3WordsState",
  "tryAutoSubmitCurrentWordAtRoundEnd",
]);

function sameRoundId(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }
  return String(left) === String(right);
}

export default function useWordSubmissionController({
  runtime,
  setSubmissionTick,
  shouldDeferStateUpdate,
  submissionTick,
}) {
  const submissionStatusRef = React.useRef(new Map());
  const pendingWordsRef = React.useRef(new Set());
  const pendingQueueRef = React.useRef([]);
  const inFlightBatchesRef = React.useRef(new Map());
  const pendingRecoveryRef = React.useRef(null);
  const batchTimerRef = React.useRef(null);
  const batchSeqRef = React.useRef(1);
  const batchUnsupportedRef = React.useRef(false);
  const submissionGenerationRef = React.useRef(0);
  const timerIdsRef = React.useRef(new Set());
  const stateFrameRef = React.useRef(null);
  const stateUpdatePendingRef = React.useRef(false);
  const stateUpdateDeferredRef = React.useRef(false);
  const setSubmissionTickRef = React.useRef(setSubmissionTick);
  const shouldDeferStateUpdateRef = React.useRef(shouldDeferStateUpdate);
  setSubmissionTickRef.current = setSubmissionTick;
  shouldDeferStateUpdateRef.current = shouldDeferStateUpdate;

  const clearTimeoutFn = React.useCallback((timerId) => {
    if (timerId == null) return;
    clearTimeout(timerId);
    timerIdsRef.current.delete(timerId);
  }, []);

  const setTimeoutFn = React.useCallback((callback, delayMs) => {
    let timerId = null;
    timerId = setTimeout(() => {
      timerIdsRef.current.delete(timerId);
      callback();
    }, delayMs);
    timerIdsRef.current.add(timerId);
    return timerId;
  }, []);

  const touchSubmissionState = React.useCallback(
    ({ deferDuringTrace = false } = {}) => {
      if (deferDuringTrace && shouldDeferStateUpdateRef.current?.()) {
        stateUpdateDeferredRef.current = true;
        recordPerfEvent("submission-status-held");
        return;
      }
      if (stateUpdatePendingRef.current) return;
      stateUpdatePendingRef.current = true;
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        stateFrameRef.current = window.requestAnimationFrame(() => {
          stateFrameRef.current = null;
          stateUpdatePendingRef.current = false;
          setSubmissionTickRef.current?.((tick) => tick + 1);
        });
        return;
      }
      stateUpdatePendingRef.current = false;
      setSubmissionTickRef.current?.((tick) => tick + 1);
    },
    []
  );

  const reset = React.useCallback(
    ({ clearRecovery = false, notify = true } = {}) => {
      for (const timerId of Array.from(timerIdsRef.current)) {
        clearTimeoutFn(timerId);
      }
      batchTimerRef.current = null;
      inFlightBatchesRef.current.clear();
      pendingQueueRef.current = [];
      pendingWordsRef.current.clear();
      submissionStatusRef.current.clear();
      batchUnsupportedRef.current = false;
      submissionGenerationRef.current += 1;
      if (clearRecovery) pendingRecoveryRef.current = null;
      if (notify) touchSubmissionState();
    },
    [clearTimeoutFn, touchSubmissionState]
  );

  const controller = useLazyObjectController(
    createWordSubmissionEngine,
    {
      ...runtime,
      batchSeqRef,
      batchTimerRef,
      batchUnsupportedRef,
      clearTimeoutFn,
      inFlightBatchesRef,
      pendingQueueRef,
      pendingWordsRef,
      setTimeoutFn,
      submissionGenerationRef,
      submissionStatusRef,
      touchSubmissionState,
    },
    WORD_SUBMISSION_CONTROLLER_METHODS
  );

  const prepareForIncomingRound = React.useCallback(
    (currentRoundId, incomingRoundId) => {
      const pendingSnapshot = capturePendingSubmissions(
        submissionStatusRef.current,
        currentRoundId
      );
      if (pendingSnapshot.entries.length > 0) {
        pendingRecoveryRef.current = pendingSnapshot;
      } else if (!sameRoundId(currentRoundId, incomingRoundId)) {
        pendingRecoveryRef.current = null;
      }
      return pendingSnapshot;
    },
    []
  );

  const beginRecovery = React.useCallback(
    ({ enabled, roundId }) => {
      if (!enabled) {
        pendingRecoveryRef.current = null;
        reset();
        return null;
      }
      const currentSnapshot = capturePendingSubmissions(
        submissionStatusRef.current,
        roundId
      );
      return currentSnapshot.entries.length > 0
        ? currentSnapshot
        : pendingRecoveryRef.current;
    },
    [reset]
  );

  const clearRecovery = React.useCallback(() => {
    pendingRecoveryRef.current = null;
  }, []);

  const reconcileRecovery = React.useCallback(
    ({ activeRoundId, pendingSnapshot, serverWords }) =>
      reconcilePendingSubmissions({
        activeRoundId,
        pendingSnapshot,
        serverWords,
      }),
    []
  );

  const resetBatchCapability = React.useCallback(() => {
    batchUnsupportedRef.current = false;
  }, []);

  const markCultureThemeWords = React.useCallback(
    (wordSet) => {
      if (!(wordSet instanceof Set)) return 0;
      let changed = 0;
      submissionStatusRef.current.forEach((meta, word) => {
        if (!wordSet.has(normalizeWord(word))) return;
        submissionStatusRef.current.set(word, {
          ...meta,
          cultureThemeWord: true,
        });
        changed += 1;
      });
      if (changed > 0) touchSubmissionState();
      return changed;
    },
    [touchSubmissionState]
  );

  const flushDeferredState = React.useCallback(() => {
    if (!stateUpdateDeferredRef.current) return false;
    stateUpdateDeferredRef.current = false;
    touchSubmissionState();
    return true;
  }, [touchSubmissionState]);

  React.useEffect(
    () => () => {
      reset({ clearRecovery: true, notify: false });
      if (
        stateFrameRef.current != null &&
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(stateFrameRef.current);
      }
      stateFrameRef.current = null;
      stateUpdatePendingRef.current = false;
      stateUpdateDeferredRef.current = false;
    },
    [reset]
  );

  const pendingWordEntries = React.useMemo(() => {
    const entries = [];
    submissionStatusRef.current.forEach((meta, word) => {
      if (!meta) return;
      entries.push({
        word,
        status: meta.status || "pending",
        userPts: meta.optimisticPts,
        reason: meta.reason || "",
        usedFakeTwins: !!meta.usedFakeTwins,
        fakeTwinsCompletionWord: !!meta.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!meta.fakeTwinsBonusOnly,
        ts: meta.ts || 0,
      });
    });
    entries.sort((left, right) => (right.ts || 0) - (left.ts || 0));
    return entries;
  }, [submissionTick]);

  const pendingStatusMap = React.useMemo(
    () => new Map(pendingWordEntries.map((entry) => [entry.word, entry])),
    [pendingWordEntries]
  );
  const pendingCount = React.useMemo(
    () => pendingWordEntries.filter((entry) => entry.status === "pending").length,
    [pendingWordEntries]
  );

  return {
    ...controller,
    beginRecovery,
    clearRecovery,
    flushDeferredState,
    markCultureThemeWords,
    pendingCount,
    pendingStatusMap,
    pendingStatusRef: submissionStatusRef,
    pendingWordEntries,
    prepareForIncomingRound,
    reconcileRecovery,
    reset,
    resetBatchCapability,
  };
}
