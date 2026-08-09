import React from "react";
import { createPortal } from "react-dom";

const TARGET_ATTRIBUTE = "data-score-flight-target";
const TARGET_WAIT_FRAMES = 36;
const DISPLAY_SCALE = 0.9;

function findVisibleTarget(targetId) {
  if (typeof document === "undefined") return null;
  const expectedId = String(targetId || "");
  if (!expectedId) return null;
  const candidates = document.querySelectorAll(`[${TARGET_ATTRIBUTE}]`);
  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) continue;
    if (candidate.getAttribute(TARGET_ATTRIBUTE) !== expectedId) continue;
    const rect = candidate.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const style = window.getComputedStyle(candidate);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
    if (rect.right <= 0 || rect.left >= window.innerWidth) continue;
    return candidate;
  }
  return null;
}

function pulseArrival(target) {
  if (!(target instanceof HTMLElement) || typeof target.animate !== "function") return;
  target.animate(
    [
      { transform: "scale(0.72)", filter: "brightness(1.8)", opacity: 0.35 },
      { transform: "scale(1.16)", filter: "brightness(1.35)", opacity: 1, offset: 0.42 },
      { transform: "scale(1)", filter: "brightness(1)", opacity: 1 },
    ],
    { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
  );
}

function ScoreFlight({ flight, onComplete }) {
  const nodeRef = React.useRef(null);
  const capsuleBodyRef = React.useRef(null);
  const scoreTextRef = React.useRef(null);
  const textShadowOffsetRef = React.useRef(null);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const scoreLabel = `+${Math.max(0, Math.trunc(Number(flight.points) || 0))}`;
  const capsuleViewHeight = 64;
  const capsuleViewWidth = Math.max(88, 42 + scoreLabel.length * 21);
  const capsuleIdSuffix = String(flight.id || scoreLabel).replace(/[^a-zA-Z0-9_-]/g, "");
  const textInsetShadowId = `score-flight-text-inset-${capsuleIdSuffix}`;

  React.useLayoutEffect(() => {
    let animation = null;
    let travelAnimation = null;
    let capsuleBodyAnimation = null;
    let scoreTextAnimation = null;
    let fallbackTimer = null;
    let frameId = null;
    let target = null;
    let targetVisibility = "";
    let attempts = 0;
    let stopped = false;
    let finished = false;

    const restoreTarget = () => {
      if (target instanceof HTMLElement) {
        target.style.visibility = targetVisibility;
      }
    };
    const finish = ({ pulse = true } = {}) => {
      if (finished || stopped) return;
      finished = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      restoreTarget();
      if (pulse) pulseArrival(target);
      onCompleteRef.current?.(flight.id);
    };
    const start = () => {
      if (stopped) return;
      target = findVisibleTarget(flight.targetId);
      const node = nodeRef.current;
      const capsuleBody = capsuleBodyRef.current;
      const scoreText = scoreTextRef.current;
      if (!target || !node || !capsuleBody || !scoreText) {
        attempts += 1;
        if (attempts < TARGET_WAIT_FRAMES) {
          frameId = window.requestAnimationFrame(start);
        } else {
          finish({ pulse: false });
        }
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const targetStyle = window.getComputedStyle(target);
      const targetFontPx = Math.max(1, Number.parseFloat(targetStyle.fontSize) || 11);
      const displayFontPx =
        DISPLAY_SCALE *
        Math.min(
          flight.lite ? 34 : 44,
          Math.max(flight.lite ? 30 : 38, targetFontPx * (flight.lite ? 2.65 : 3.35))
        );
      const capsuleHeightPx = displayFontPx * 1.5;
      const capsuleWidthPx = capsuleHeightPx * (capsuleViewWidth / capsuleViewHeight);
      node.style.fontFamily = targetStyle.fontFamily;
      node.style.fontSize = `${displayFontPx}px`;
      node.style.lineHeight = "1";
      node.style.fontWeight = "900";
      node.style.width = `${capsuleWidthPx}px`;
      node.style.height = `${capsuleHeightPx}px`;
      const capsuleStyle = window.getComputedStyle(node);
      const reliefTextRgb = capsuleStyle
        .getPropertyValue("--podium-gold-shadow-rgb")
        .trim();
      const reliefTextColor = reliefTextRgb ? `rgb(${reliefTextRgb})` : "rgb(112, 72, 0)";
      const reliefOffsetXPx =
        Number.parseFloat(capsuleStyle.getPropertyValue("--podium-relief-offset-x")) || 0;
      const reliefOffsetYPx =
        Number.parseFloat(capsuleStyle.getPropertyValue("--podium-relief-offset")) || 0;
      const svgUnitsPerCssPixel = capsuleViewHeight / capsuleHeightPx;
      textShadowOffsetRef.current?.setAttribute(
        "dx",
        String(reliefOffsetXPx * svgUnitsPerCssPixel)
      );
      textShadowOffsetRef.current?.setAttribute(
        "dy",
        String(reliefOffsetYPx * svgUnitsPerCssPixel)
      );
      const destinationTextColor = targetStyle.color || "rgb(15, 23, 42)";
      scoreText.style.color = reliefTextColor;

      const nodeRect = node.getBoundingClientRect();
      const scoreTextRect = scoreText.getBoundingClientRect();
      const destinationScale = Math.min(
        1,
        Math.max(
          0.08,
          Math.min(
            targetRect.width / Math.max(1, scoreTextRect.width),
            targetRect.height / Math.max(1, scoreTextRect.height)
          )
        )
      );
      const midpointScale = Math.max(0.5, destinationScale * 1.8);
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const endLeft = targetCenterX - nodeRect.width / 2;
      const endTop = targetCenterY - nodeRect.height / 2;
      const deltaX = Number(flight.sourceX) - targetCenterX;
      const deltaY = Number(flight.sourceY) - targetCenterY;
      const arcY = -Math.min(52, 20 + Math.abs(deltaX) * 0.055);
      const midpointX = deltaX * 0.56;
      const midpointY = deltaY * 0.56 + arcY;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

      node.style.left = `${endLeft}px`;
      node.style.top = `${endTop}px`;
      if (reducedMotion) {
        pulseArrival(target);
        finish({ pulse: false });
        return;
      }

      targetVisibility = target.style.visibility;
      target.style.visibility = "hidden";
      // Le plateau et le trajet sont deux séquences distinctes : allonger le
      // premier ne peut donc plus recalculer ni ralentir l'accélération du second.
      const introDuration = flight.lite ? 110 : 154;
      const plateauDuration = 500;
      const introAndPlateauDuration = introDuration + plateauDuration;
      const travelDuration = flight.lite ? 540 : 756;
      const totalDuration = introAndPlateauDuration + travelDuration;
      if (typeof node.animate !== "function") {
        finish();
        return;
      }
      animation = node.animate(
        [
          {
            transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(0.18)`,
            opacity: 0,
            easing: "cubic-bezier(0.2, 0.82, 0.26, 1)",
          },
          {
            transform: `translate3d(${deltaX}px, ${deltaY - 4}px, 0) scale(1)`,
            opacity: 1,
            offset: introDuration / introAndPlateauDuration,
            easing: "linear",
          },
          {
            transform: `translate3d(${deltaX}px, ${deltaY - 4}px, 0) scale(1)`,
            opacity: 1,
          },
        ],
        {
          duration: introAndPlateauDuration,
          easing: "linear",
          fill: "forwards",
        }
      );
      animation.onfinish = () => {
        if (stopped || finished) return;
        travelAnimation = node.animate(
          [
            {
              transform: `translate3d(${deltaX}px, ${deltaY - 4}px, 0) scale(1)`,
              opacity: 1,
            },
            {
              transform: `translate3d(${deltaX}px, ${deltaY - 7}px, 0) scale(0.88)`,
              opacity: 0.96,
              offset: 0.185,
            },
            {
              transform: `translate3d(${midpointX}px, ${midpointY}px, 0) scale(${midpointScale})`,
              opacity: 0.98,
              offset: 0.667,
            },
            {
              transform: `translate3d(0, 0, 0) scale(${destinationScale})`,
              opacity: 1,
            },
          ],
          {
            duration: travelDuration,
            easing: "cubic-bezier(0.2, 0.82, 0.26, 1)",
            fill: "forwards",
          }
        );
        capsuleBodyAnimation = capsuleBody.animate(
          [
            { opacity: 0.9 },
            { opacity: 0.18, offset: 0.667 },
            { opacity: 0 },
          ],
          {
            duration: travelDuration,
            easing: "cubic-bezier(0.2, 0.82, 0.26, 1)",
            fill: "forwards",
          }
        );
        scoreTextAnimation = scoreText.animate(
          [{ color: reliefTextColor }, { color: destinationTextColor }],
          {
            duration: travelDuration,
            easing: "cubic-bezier(0.2, 0.82, 0.26, 1)",
            fill: "forwards",
          }
        );
        travelAnimation.onfinish = () => finish({ pulse: false });
        travelAnimation.oncancel = () => finish({ pulse: false });
      };
      fallbackTimer = window.setTimeout(
        () => finish({ pulse: false }),
        totalDuration + 120
      );
    };

    frameId = window.requestAnimationFrame(start);
    return () => {
      stopped = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
      }
      if (travelAnimation) {
        travelAnimation.onfinish = null;
        travelAnimation.oncancel = null;
        travelAnimation.cancel();
      }
      capsuleBodyAnimation?.cancel();
      scoreTextAnimation?.cancel();
      restoreTarget();
    };
  }, [flight]);

  return (
    <div
      ref={nodeRef}
      className="score-flight-gold-capsule fixed z-[21450] opacity-0 will-change-transform"
      style={{
        pointerEvents: "none",
        transformOrigin: "center",
      }}
    >
      <span ref={capsuleBodyRef} className="absolute inset-0 block" style={{ opacity: 0.9 }}>
        <span className="score-flight-capsule-relief" />
        <span className="score-flight-capsule-face">
          <span className="score-flight-capsule-reflection" />
        </span>
      </span>
      <svg
        viewBox={`0 0 ${capsuleViewWidth} ${capsuleViewHeight}`}
        className="absolute inset-0 block h-full w-full overflow-visible"
        style={{ fontFamily: "inherit" }}
        focusable="false"
      >
        <defs>
          <filter
            id={textInsetShadowId}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feComponentTransfer in="SourceAlpha" result="inverseTextAlpha">
              <feFuncA type="table" tableValues="1 0" />
            </feComponentTransfer>
            <feGaussianBlur in="inverseTextAlpha" stdDeviation="0.85" result="blurredInverse" />
            <feOffset ref={textShadowOffsetRef} in="blurredInverse" dx="0.75" dy="2" result="offsetInverse" />
            <feComposite
              in="offsetInverse"
              in2="SourceAlpha"
              operator="in"
              result="innerShadowMask"
            />
            <feFlood floodColor="rgb(0 0 0)" floodOpacity="0.42" result="innerShadowColor" />
            <feComposite
              in="innerShadowColor"
              in2="innerShadowMask"
              operator="in"
              result="innerShadow"
            />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="innerShadow" />
            </feMerge>
          </filter>
        </defs>
        <text
          ref={scoreTextRef}
          x={capsuleViewWidth / 2}
          y={capsuleViewHeight / 2}
          dy="0.08em"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          fontSize="31"
          fontWeight="900"
          letterSpacing="0.2"
          style={{ color: "rgb(var(--podium-gold-shadow-rgb))" }}
          filter={`url(#${textInsetShadowId})`}
        >
          {scoreLabel}
        </text>
      </svg>
    </div>
  );
}

export default function ScoreFlightLayer({ flights = [], onComplete }) {
  if (typeof document === "undefined" || !Array.isArray(flights) || flights.length === 0) {
    return null;
  }
  return createPortal(
    <div className="fixed inset-0 z-[21440] pointer-events-none" aria-hidden="true">
      {flights.map((flight) => (
        <ScoreFlight key={flight.id} flight={flight} onComplete={onComplete} />
      ))}
    </div>,
    document.body
  );
}
