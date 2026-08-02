import React from "react";
import { createPortal } from "react-dom";

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function MobileRoundIntroOverlay({
  countdown = null,
  darkMode = false,
  goLabel = "PARTEZ !",
  gridRef = null,
  isMobileLayout = false,
  roundLabel = "",
  roundDescription = "",
  roundTypeLabel = "",
  stage = "idle",
  titleFadeMs = 180,
}) {
  const active = stage !== "idle";
  const [squareStyle, setSquareStyle] = React.useState(null);

  React.useLayoutEffect(() => {
    if (!active) {
      setSquareStyle(null);
      return undefined;
    }

    let rafId = null;
    const updateRect = () => {
      const rect = gridRef?.current?.getBoundingClientRect?.() || null;
      if (
        !rect ||
        !Number.isFinite(rect.left) ||
        !Number.isFinite(rect.top) ||
        !Number.isFinite(rect.width) ||
        !Number.isFinite(rect.height)
      ) {
        setSquareStyle(null);
        return;
      }
      const side = Math.max(0, Math.round(Math.min(rect.width, rect.height)));
      if (!(side > 0)) {
        setSquareStyle(null);
        return;
      }
      setSquareStyle({
        left: `${Math.round(rect.left + (rect.width - side) / 2)}px`,
        top: `${Math.round(rect.top + (rect.height - side) / 2)}px`,
        width: `${side}px`,
        height: `${side}px`,
        __sidePx: side,
      });
    };
    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateRect();
      });
    };

    updateRect();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);

    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [active, gridRef, stage, countdown, isMobileLayout]);

  if (!active || typeof document === "undefined") return null;

  const sidePx = Number(squareStyle?.__sidePx) || 0;
  const countdownFontPx = sidePx ? clampValue(Math.round(sidePx * 0.45), 104, 260) : 180;
  const goFontPx = sidePx ? clampValue(Math.round(sidePx * 0.19), 28, 108) : 72;
  const goldGradient =
    "linear-gradient(180deg, #6f4300 0%, #f0b81e 16%, #fff4b5 30%, #d48a05 46%, #fff2aa 63%, #b16d00 80%, #fff8cf 100%)";
  const useMobileTextTuning = isMobileLayout;
  const titleGoldTextStyle = {
    backgroundImage: goldGradient,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke:
      !darkMode && useMobileTextTuning
        ? "0.85px rgba(0,0,0,0.88)"
        : useMobileTextTuning
        ? "0px transparent"
        : "1px rgba(100,55,0,0.42)",
    textShadow: useMobileTextTuning
      ? !darkMode
        ? "0 1px 0 rgba(255,244,194,0.36), 0 2px 8px rgba(0,0,0,0.44)"
        : "0 1px 0 rgba(255,244,194,0.42), 0 2px 8px rgba(0,0,0,0.38)"
      : "0 0 2px rgba(255,255,255,0.42), 0 0 14px rgba(255,215,90,0.26), 0 0 24px rgba(255,190,40,0.14), 0 8px 18px rgba(0,0,0,0.42)",
    position: "relative",
    animation: "goldPulse 2.2s ease-in-out infinite",
  };
  const countdownGoldTextStyle = {
    backgroundImage: goldGradient,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke:
      !darkMode && useMobileTextTuning
        ? "1px rgba(0,0,0,0.92)"
        : useMobileTextTuning
        ? "0px transparent"
        : "1px rgba(100,55,0,0.42)",
    textShadow: useMobileTextTuning
      ? !darkMode
        ? "0 1px 0 rgba(255,244,194,0.4), 0 3px 10px rgba(0,0,0,0.46), 0 0 10px rgba(255,210,85,0.18)"
        : "0 1px 0 rgba(255,244,194,0.46), 0 3px 10px rgba(0,0,0,0.42), 0 0 10px rgba(255,210,85,0.2)"
      : "0 0 2px rgba(255,255,255,0.42), 0 0 14px rgba(255,215,90,0.26), 0 0 24px rgba(255,190,40,0.14), 0 8px 18px rgba(0,0,0,0.42)",
    position: "relative",
    filter: useMobileTextTuning
      ? "drop-shadow(0 0 4px rgba(255,210,80,0.14))"
      : "drop-shadow(0 0 8px rgba(255,210,80,0.18))",
    opacity: 0.92,
  };
  const showsBackdrop =
    isMobileLayout && (stage === "results_fade_out" || stage === "intro_fade_in");
  const backdropClass =
    stage === "results_fade_out"
      ? "mobile-round-intro-fade-to-black"
      : stage === "intro_fade_in"
      ? "mobile-round-intro-fade-from-black"
      : "mobile-round-intro-backdrop";
  const showsTitle = stage === "title" || stage === "title_fade_out";
  const showsCountdown = stage === "countdown";
  const countdownIsGo =
    typeof countdown === "string" && countdown.trim().toUpperCase() === String(goLabel).trim();
  const normalizedRoundTypeLabel = String(roundTypeLabel || "").toUpperCase();
  const isSpecial =
    normalizedRoundTypeLabel.startsWith("MANCHE SPECIALE") ||
    normalizedRoundTypeLabel.startsWith("FINALE");

  const styleForRender = squareStyle
    ? {
        left: squareStyle.left,
        top: squareStyle.top,
        width: squareStyle.width,
        height: squareStyle.height,
      }
    : null;
  const overlayZIndex = showsBackdrop ? 121 : 120;

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none select-none"
      style={{ zIndex: overlayZIndex }}
    >
      {showsBackdrop ? <div className={`absolute inset-0 bg-black ${backdropClass}`} /> : null}
      {showsTitle && styleForRender ? (
        <div
          className="fixed flex flex-col items-center justify-center rounded-2xl border-2 bg-black/82 px-4 py-5 text-center"
          style={{
            ...styleForRender,
            borderColor: "rgba(196,128,52,0.78)",
            opacity: stage === "title_fade_out" ? 0 : 1,
            transition: `opacity ${titleFadeMs}ms ease-out`,
            boxShadow: "0 24px 70px rgba(0,0,0,0.72), inset 0 0 26px rgba(244,182,88,0.12)",
          }}
        >
          <div
            className="text-[clamp(14px,1.3vw,19px)] font-black tracking-[0.22em]"
            style={titleGoldTextStyle}
          >
            {roundLabel || "MANCHE"}
          </div>
          <div
            className={`mt-3 text-[clamp(15px,1.5vw,23px)] font-black tracking-[0.08em] uppercase ${
              isSpecial ? "" : ""
            }`}
            style={{
              ...titleGoldTextStyle,
              opacity: isSpecial ? 0.95 : 0.9,
            }}
          >
            {roundTypeLabel || "manche classique"}
          </div>
          {roundDescription ? (
            <div className="mt-3 max-w-[92%] text-[11px] font-semibold leading-snug text-white/82">
              {roundDescription}
            </div>
          ) : null}
        </div>
      ) : null}
      {showsCountdown && styleForRender ? (
        <div className="fixed flex items-center justify-center" style={styleForRender}>
          <span
            key={`intro-count-${countdown ?? "x"}`}
            className={`font-black tabular-nums leading-none text-amber-300 ${
              countdownIsGo
                ? "round-intro-go-fade whitespace-nowrap tracking-[0.03em]"
                : "round-intro-countdown-pop"
            }`}
            style={{
              ...countdownGoldTextStyle,
              fontSize: `${countdownIsGo ? goFontPx : countdownFontPx}px`,
            }}
          >
            {countdown == null ? "" : String(countdown)}
          </span>
        </div>
      ) : null}
    </div>,
    document.body
  );
}

export default React.memo(MobileRoundIntroOverlay);
