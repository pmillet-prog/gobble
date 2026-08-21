import confetti from "canvas-confetti";
import { getScoreFlightOrigin } from "../components/score/scoreFlightGeometry.js";
import { showCelebrationFlash } from "../components/celebrationFxStore.js";
import { isFirefoxMobileUserAgent } from "../app/adapters/deviceCapabilities.js";
import { recordPerfEvent } from "../perf/renderPerfProbe.js";

export function createCelebrationEffects(
  canVibrateRef,
  confettiBurstTokenRef,
  gridRef,
  gridShakeAnimationRef,
  gridShakeTimerRef,
  invalidLastRef,
  isMobileLayout,
  isMobileLayoutRef,
  isVibrationEnabledRef,
  lastGobbleAtRef,
  phaseRef,
  praiseLastRef,
  preferLiteVisualEffectsRef,
  scoreFlightSequenceRef,
  setGridShake,
  setScoreFlights,
  tileRefs,
  visualConfettiEnabledRef,
  visualGobbleEnabledRef,
  visualInvalidWordsEnabledRef,
  visualPraiseEnabledRef,
  visualScoreFlightsEnabledRef,
  visualScreenShakeEnabledRef,
) {

  function triggerScoreFlight({ feedItemId, path, points }) {
    if (!visualScoreFlightsEnabledRef.current) return;
    if (!feedItemId || !Number.isFinite(Number(points))) return;
    const safePath = Array.isArray(path) ? path : [];
    const lastTileIndex = Number(safePath[safePath.length - 1]);
    const lastTile = Number.isInteger(lastTileIndex) ? tileRefs.current[lastTileIndex] : null;
    const origin = getScoreFlightOrigin({
      tileRect: lastTile?.getBoundingClientRect?.(),
      gridRect: gridRef.current?.getBoundingClientRect?.(),
    });
    if (!origin) return;
    scoreFlightSequenceRef.current += 1;
    const id = `score-flight-${Date.now()}-${scoreFlightSequenceRef.current}`;
    const flight = {
      id,
      lite: !!preferLiteVisualEffectsRef.current,
      points: Number(points),
      sourceX: origin.x,
      sourceY: origin.y,
      targetId: String(feedItemId),
    };
    setScoreFlights((current) => [...current.slice(-5), flight]);
  }

  function triggerGridShake() {
    const mobileNow = !!isMobileLayoutRef.current;
    if (!visualScreenShakeEnabledRef.current) {
      if (gridShakeTimerRef.current) {
        clearTimeout(gridShakeTimerRef.current);
        gridShakeTimerRef.current = null;
      }
      try {
        gridShakeAnimationRef.current?.cancel?.();
      } catch (_) {}
      gridShakeAnimationRef.current = null;
      if (mobileNow) setGridShake(false);
      try {
        if (
          canVibrateRef.current &&
          isVibrationEnabledRef.current &&
          typeof navigator !== "undefined" &&
          typeof navigator.vibrate === "function"
        ) {
          navigator.vibrate(50);
        }
      } catch (_) {}
      return;
    }
    if (gridShakeTimerRef.current) {
      clearTimeout(gridShakeTimerRef.current);
      gridShakeTimerRef.current = null;
    }
    try {
      gridShakeAnimationRef.current?.cancel?.();
    } catch (_) {}
    gridShakeAnimationRef.current = null;
    if (mobileNow) {
      setGridShake(false);
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => setGridShake(true));
      } else {
        setGridShake(true);
      }
    }
    try {
      const gridEl = gridRef.current;
      if (!mobileNow && gridEl instanceof HTMLElement && typeof gridEl.animate === "function") {
        const keyframes = [
          { translate: "0px 0px" },
          { translate: "-2px 0px" },
          { translate: "4px 0px" },
          { translate: "-6px 0px" },
          { translate: "6px 0px" },
          { translate: "-4px 0px" },
          { translate: "0px 0px" },
        ];
        const animation = gridEl.animate(keyframes, {
          duration: 340,
          easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)",
        });
        gridShakeAnimationRef.current = animation;
        animation.onfinish = () => {
          if (gridShakeAnimationRef.current === animation) {
            gridShakeAnimationRef.current = null;
          }
        };
        animation.oncancel = () => {
          if (gridShakeAnimationRef.current === animation) {
            gridShakeAnimationRef.current = null;
          }
        };
      }
    } catch (_) {}
    try {
      if (
        canVibrateRef.current &&
        isVibrationEnabledRef.current &&
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate(50);
      }
    } catch (_) {}
    if (mobileNow) {
      gridShakeTimerRef.current = setTimeout(() => {
        setGridShake(false);
        gridShakeTimerRef.current = null;
      }, 520);
    }
  }

  function triggerPraiseFlash(
    text,
    { kind = "blue", shakeGrid = false, force = false, durationMs: requestedDurationMs = null } = {}
  ) {
    const now = Date.now();
    if (!force && now - praiseLastRef.current < 420) return;
    praiseLastRef.current = now;
    const lite = !!preferLiteVisualEffectsRef.current;
    const isGobbleKind = kind === "gobble" || kind === "doubleGobble";
    const angle = Math.random() * Math.PI * 2;
    const minDist = isMobileLayout ? (lite ? 32 : 90) : lite ? 70 : 140;
    const maxDist = isMobileLayout ? (lite ? 68 : 160) : lite ? 120 : 240;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const dx = Math.round(Math.cos(angle) * dist);
    const dy = Math.round(Math.sin(angle) * dist);
    const scaleBase = lite ? (isGobbleKind ? 1.08 : 1.0) : 1.6;
    const scaleRange = lite ? 0.12 : 0.5;
    const scale = Number(((1.0 + Math.random() * scaleRange) * scaleBase).toFixed(2));
    if (isGobbleKind) {
      lastGobbleAtRef.current = now;
      const durationMs = lite ? Math.round(780 + Math.random() * 120) : Math.round(2200 + Math.random() * 400);
      triggerConfettiBurst("gobble");
      if (visualGobbleEnabledRef.current) {
        showCelebrationFlash("gobbleFlash", {
          id: now + Math.random(),
          text,
          kind,
          dx,
          dy,
          scale,
          durationMs,
          lite,
        }, durationMs);
      }
      if (shakeGrid) triggerGridShake();
      return;
    }
    const durationMs = Number.isFinite(Number(requestedDurationMs))
      ? Math.max(lite ? 1100 : 2200, Math.round(Number(requestedDurationMs)))
      : lite
      ? Math.round(650 + Math.random() * 120)
      : Math.round(1500 + Math.random() * 300);
    if (visualPraiseEnabledRef.current) {
      showCelebrationFlash("praiseFlash", {
        id: now + Math.random(),
        text,
        kind,
        dx,
        dy,
        scale,
        durationMs,
        lite,
      }, durationMs);
    }
    if (shakeGrid) triggerGridShake();
  }

  function triggerInvalidFlash(
    text,
    { force = false, durationMs = 980 } = {}
  ) {
    if (!visualInvalidWordsEnabledRef.current) return;
    if (phaseRef.current !== "playing") return;
    const now = Date.now();
    if (!force && now - invalidLastRef.current < 260) return;
    invalidLastRef.current = now;
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 0.7;
    const minDist = isMobileLayout ? 18 : 24;
    const maxDist = isMobileLayout ? 36 : 48;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const dx = Math.round(Math.cos(angle) * dist);
    const dy = Math.round(Math.sin(angle) * dist);
    const scale = Number((1.06 + Math.random() * 0.18).toFixed(2));
    const flash = {
      id: now + Math.random(),
      text,
      dx,
      dy,
      scale: preferLiteVisualEffectsRef.current ? Math.min(scale, 1.04) : scale,
      durationMs: preferLiteVisualEffectsRef.current ? Math.min(durationMs, 720) : durationMs,
      lite: !!preferLiteVisualEffectsRef.current,
    };
    showCelebrationFlash("invalidFlash", flash, flash.durationMs);
  }

  function triggerConfettiBurst(kind = "target") {
    if (!visualConfettiEnabledRef.current) return;
    if (typeof window === "undefined") return;
    if (isMobileLayoutRef.current && preferLiteVisualEffectsRef.current) return;
    recordPerfEvent("confetti", { kind });
    const burstToken = ++confettiBurstTokenRef.current;
    const isMobileFirefox =
      isMobileLayoutRef.current &&
      typeof navigator !== "undefined" &&
      isFirefoxMobileUserAgent(navigator.userAgent || "");

    const rect = gridRef.current?.getBoundingClientRect?.();
    const origin = rect
      ? {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height * 0.42) / window.innerHeight,
        }
      : { x: 0.5, y: 0.4 };

    const base = {
      origin,
      zIndex: 13050,
      disableForReducedMotion: true,
    };

    const fire = (particleRatio, opts) => {
      if (confettiBurstTokenRef.current !== burstToken) return;
      confetti({
        ...base,
        ...opts,
        particleCount: Math.floor(140 * particleRatio),
      });
    };

    if (preferLiteVisualEffectsRef.current) {
      const isGobble = kind === "gobble";
      const isTournament = kind === "tournament";
      fire(isTournament ? 0.18 : isGobble ? 0.13 : 0.11, {
        spread: isTournament ? 92 : isGobble ? 60 : 72,
        startVelocity: isTournament ? 30 : 26,
        scalar: 0.72,
        shapes: ["circle"],
        colors: isGobble
          ? ["#fbbf24", "#fde68a", "#ffffff"]
          : ["#22c55e", "#3b82f6", "#eab308", "#ffffff"],
        ticks: 80,
      });
      return;
    }

    if (kind === "gobble") {
      fire(0.35, {
        spread: 65,
        startVelocity: 52,
        scalar: 1.05,
        shapes: ["star"],
        colors: ["#fbbf24", "#f59e0b", "#fde68a"],
        ticks: 120,
      });
      fire(0.25, {
        spread: 95,
        startVelocity: 38,
        scalar: 0.9,
        shapes: ["circle"],
        colors: ["#ffffff", "#fef3c7"],
        ticks: 140,
      });
      return;
    }

    if (kind === "target") {
      fire(0.55, {
        spread: 105,
        startVelocity: 42,
        scalar: 1.0,
        shapes: ["square", "circle"],
        colors: ["#22c55e", "#3b82f6", "#a855f7", "#eab308", "#ef4444"],
        ticks: 200,
      });
      fire(0.15, {
        spread: 160,
        startVelocity: 18,
        scalar: 0.85,
        shapes: ["circle"],
        colors: ["#ffffff"],
        ticks: 220,
      });
      return;
    }

    if (isMobileFirefox) {
      fire(0.12, {
        spread: 72,
        startVelocity: 26,
        scalar: 0.85,
        shapes: ["circle"],
        colors: ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"],
        ticks: 90,
      });
      return;
    }

    const end = Date.now() + 2400;
    (function frame() {
      if (confettiBurstTokenRef.current !== burstToken) return;
      confetti({
        ...base,
        particleCount: 4,
        angle: 60,
        spread: 55,
        startVelocity: 58,
        scalar: 1.0,
        origin: { x: 0.05, y: 0.9 },
        colors: ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"],
        ticks: 260,
      });
      confetti({
        ...base,
        particleCount: 4,
        angle: 120,
        spread: 55,
        startVelocity: 58,
        scalar: 1.0,
        origin: { x: 0.95, y: 0.9 },
        colors: ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"],
        ticks: 260,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  return {
    triggerConfettiBurst,
    triggerGridShake,
    triggerInvalidFlash,
    triggerPraiseFlash,
    triggerScoreFlight,
  };
}
