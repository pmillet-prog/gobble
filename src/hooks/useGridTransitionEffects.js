import React, { useEffect } from "react";

export default function useGridTransitionEffects(
  tileIntroTimerRef,
  tileRefs,
  gridRef,
  clearTileIntroAnimationFnRef,
  triggerTileIntroAnimationFnRef,
  implodeTimerRef,
  implodePhaseTimerRef,
  implodeFallbackRef,
  pendingRoundEndRef,
  pendingBreakStartRef,
  setImplodeActive,
  commitTraceSelection,
  activeTraceStartedAtRef,
  roundIdRef,
  implodeRoundRef,
  draggingRef,
  processRoundEndedRef,
  setServerStatus,
  setPhase,
  processBreakStartedRef
) {
const clearTileIntroAnimation = React.useCallback(() => {
  if (tileIntroTimerRef.current) {
    clearTimeout(tileIntroTimerRef.current);
    tileIntroTimerRef.current = null;
  }
  tileRefs.current.forEach((el) => {
    if (!el) return;
    el.classList.remove("tile-intro");
    el.style.removeProperty("--intro-x");
    el.style.removeProperty("--intro-y");
    el.style.removeProperty("--intro-rot");
    el.style.removeProperty("--intro-delay");
    el.style.removeProperty("--intro-dur");
    el.style.removeProperty("--intro-scale-start");
  });
}, []);

const triggerTileIntroAnimation = React.useCallback(() => {
  const gridEl = gridRef.current;
  if (!gridEl || typeof window === "undefined") return 0;
  const viewportWidth = Math.max(1, window.innerWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const margin = Math.max(90, Math.round(Math.min(viewportWidth, viewportHeight) * 0.16));
  let maxTotalMs = 0;

  clearTileIntroAnimation();

  tileRefs.current.forEach((el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const tileCenterX = rect.left + rect.width / 2;
    const tileCenterY = rect.top + rect.height / 2;
    const side = Math.floor(Math.random() * 4);
    const randX = Math.random() * viewportWidth;
    const randY = Math.random() * viewportHeight;
    const sourceX =
      side === 0
        ? -margin
        : side === 1
        ? viewportWidth + margin
        : randX;
    const sourceY =
      side === 2
        ? -margin
        : side === 3
        ? viewportHeight + margin
        : randY;
    const dx = sourceX - tileCenterX;
    const dy = sourceY - tileCenterY;
    const dist = Math.hypot(dx, dy);
    const distNorm = Math.min(1.4, dist / Math.max(1, Math.hypot(viewportWidth, viewportHeight)));
    const rot = (Math.random() * 2 - 1) * (420 + 360 * distNorm);
    const delay = Math.max(0, distNorm * 0.08 + Math.random() * 0.04);
    const duration = 0.72 + distNorm * 0.28 + Math.random() * 0.08;
    const scaleStart = 1.65 + distNorm * 0.52 + Math.random() * 0.16;

    el.style.setProperty("--intro-x", `${dx}px`);
    el.style.setProperty("--intro-y", `${dy}px`);
    el.style.setProperty("--intro-rot", `${rot}deg`);
    el.style.setProperty("--intro-delay", `${delay}s`);
    el.style.setProperty("--intro-dur", `${duration}s`);
    el.style.setProperty("--intro-scale-start", `${scaleStart}`);
    el.classList.remove("tile-intro");
    void el.offsetWidth;
    el.classList.add("tile-intro");
    maxTotalMs = Math.max(maxTotalMs, (delay + duration) * 1000);
  });

  if (maxTotalMs > 0) {
    if (tileIntroTimerRef.current) clearTimeout(tileIntroTimerRef.current);
    tileIntroTimerRef.current = setTimeout(() => {
      clearTileIntroAnimation();
    }, Math.ceil(maxTotalMs + 120));
  }
  return Math.max(0, Math.ceil(maxTotalMs));
}, [clearTileIntroAnimation]);

useEffect(() => {
  clearTileIntroAnimationFnRef.current = clearTileIntroAnimation;
}, [clearTileIntroAnimation]);

useEffect(() => {
  triggerTileIntroAnimationFnRef.current = triggerTileIntroAnimation;
}, [triggerTileIntroAnimation]);

const clearImplodeAnimation = React.useCallback(() => {
  if (implodeTimerRef.current) {
    clearTimeout(implodeTimerRef.current);
    implodeTimerRef.current = null;
  }
  tileRefs.current.forEach((el) => {
    if (!el) return;
    el.classList.remove("tile-implode");
    el.style.removeProperty("--implode-x");
    el.style.removeProperty("--implode-y");
    el.style.removeProperty("--implode-ox");
    el.style.removeProperty("--implode-oy");
    el.style.removeProperty("--implode-rot");
    el.style.removeProperty("--implode-delay");
    el.style.removeProperty("--implode-dur");
    el.style.removeProperty("--implode-opacity-mid");
    el.style.removeProperty("--implode-scale-mid");
    el.style.removeProperty("--implode-scale-end");
  });
}, []);

const triggerImplodeAnimation = React.useCallback(() => {
  const gridEl = gridRef.current;
  if (!gridEl) return;
  const gridRect = gridEl.getBoundingClientRect();
  if (!gridRect.width || !gridRect.height) return;

  const centerX = gridRect.left + gridRect.width / 2;
  const centerY = gridRect.top + gridRect.height / 2;
  const maxDist = Math.max(1, Math.hypot(gridRect.width / 2, gridRect.height / 2));
  let maxTotalMs = 0;

  tileRefs.current.forEach((el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tileCenterX = rect.left + rect.width / 2;
    const tileCenterY = rect.top + rect.height / 2;
    const dx = centerX - tileCenterX;
    const dy = centerY - tileCenterY;
    const dist = Math.hypot(dx, dy);
    const distNorm = Math.min(1, dist / maxDist);
    const orbitFactor = 0.22 + Math.random() * 0.28;
    const rot = (Math.random() * 2 - 1) * 720;
    const delay = distNorm * 0.35;
    const minDur = 1.2;
    const maxDur = 2.6;
    const duration = minDur + distNorm * (maxDur - minDur);
    const opacityMid = Math.max(0.1, 1 - distNorm * 0.6);
    const scaleMid = 0.6 + distNorm * 0.25;
    const scaleEnd = 0.08 + distNorm * 0.12;

    let ox = 0;
    let oy = 0;
    if (dist > 0.5) {
      const inv = 1 / dist;
      const perpX = -dy * inv;
      const perpY = dx * inv;
      const orbitMag = dist * orbitFactor;
      ox = perpX * orbitMag;
      oy = perpY * orbitMag;
    }

    el.style.setProperty("--implode-x", `${dx}px`);
    el.style.setProperty("--implode-y", `${dy}px`);
    el.style.setProperty("--implode-ox", `${ox}px`);
    el.style.setProperty("--implode-oy", `${oy}px`);
    el.style.setProperty("--implode-rot", `${rot}deg`);
    el.style.setProperty("--implode-delay", `${delay}s`);
    el.style.setProperty("--implode-dur", `${duration}s`);
    el.style.setProperty("--implode-opacity-mid", `${opacityMid}`);
    el.style.setProperty("--implode-scale-mid", `${scaleMid}`);
    el.style.setProperty("--implode-scale-end", `${scaleEnd}`);

    el.classList.remove("tile-implode");
    void el.offsetWidth;
    el.classList.add("tile-implode");
    maxTotalMs = Math.max(maxTotalMs, (delay + duration) * 1000);
  });

  if (maxTotalMs > 0) {
    if (implodeTimerRef.current) clearTimeout(implodeTimerRef.current);
    const cleanupMs = Math.max(maxTotalMs, IMPLODE_PHASE_MS) + 80;
    implodeTimerRef.current = setTimeout(() => {
      clearImplodeAnimation();
    }, Math.ceil(cleanupMs));
  }
}, [clearImplodeAnimation]);

const stopImplodePhase = React.useCallback(() => {
  if (implodePhaseTimerRef.current) {
    clearTimeout(implodePhaseTimerRef.current);
    implodePhaseTimerRef.current = null;
  }
  implodeFallbackRef.current = false;
  pendingRoundEndRef.current = null;
  pendingBreakStartRef.current = null;
  setImplodeActive(false);
  clearImplodeAnimation();
}, [clearImplodeAnimation]);

const clearSelection = React.useCallback(() => {
  commitTraceSelection([], []);
  activeTraceStartedAtRef.current = null;
}, []);

const startImplodePhase = React.useCallback(
  (payload = null, { fallback = false } = {}) => {
    if (payload) {
      pendingRoundEndRef.current = payload;
      implodeFallbackRef.current = false;
    } else if (fallback) {
      implodeFallbackRef.current = true;
    }

    if (implodePhaseTimerRef.current) {
      return;
    }

    if (!payload) {
      pendingRoundEndRef.current = null;
    }

    const activeRoundId = payload?.roundId ?? roundIdRef.current ?? null;
    if (activeRoundId) {
      implodeRoundRef.current = activeRoundId;
    }

    if (draggingRef.current) {
      draggingRef.current = false;
      clearSelection();
    }

    setImplodeActive(true);
    triggerImplodeAnimation();

    implodePhaseTimerRef.current = setTimeout(() => {
      implodePhaseTimerRef.current = null;
      const pending = pendingRoundEndRef.current;
      pendingRoundEndRef.current = null;
      const shouldFallback = implodeFallbackRef.current;
      implodeFallbackRef.current = false;
      if (pending && processRoundEndedRef.current) {
        processRoundEndedRef.current(pending);
      } else if (shouldFallback) {
        setServerStatus("break");
        setPhase("results");
      }
      const pendingBreak = pendingBreakStartRef.current;
      if (pendingBreak && processBreakStartedRef.current) {
        pendingBreakStartRef.current = null;
        processBreakStartedRef.current(pendingBreak);
      }
      setImplodeActive(false);
      clearImplodeAnimation();
    }, IMPLODE_PHASE_MS);
  },
  [clearImplodeAnimation, triggerImplodeAnimation]
);


  return [clearTileIntroAnimation, clearSelection, stopImplodePhase];
}
