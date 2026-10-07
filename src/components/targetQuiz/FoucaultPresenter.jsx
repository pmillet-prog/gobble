import React from "react";
import {
  FOUCAULT_NORMAL_FRAME,
  FOUCAULT_QUESTION_SPRITE,
  FOUCAULT_REACTION_SPRITE,
  FOUCAULT_SERIOUS_FRAME,
  getFoucaultQuestionClipPoints,
  getFoucaultQuestionViewBox,
  getFoucaultReactionViewBox,
  scheduleFoucaultAnimation,
} from "./foucaultAnimation.js";

const spriteReadyPromises = new Map();
export const FOUKRO_HIT_SPRITES = Object.freeze({
  hit1: "/bots/foucault/hit-1.png", hit2: "/bots/foucault/hit-2.png", stars: "/bots/foucault/stars.png",
});

function preloadSprite(url) {
  const existing = spriteReadyPromises.get(url);
  if (existing) return existing;
  if (typeof Image === "undefined") return Promise.resolve(false);
  const ready = new Promise((resolve) => {
    const image = new Image();
    let decoding = false;
    const finish = (loaded) => {
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    };
    const loaded = () => {
      if (decoding) return;
      decoding = true;
      if (!image.naturalWidth) {
        finish(false);
      } else if (typeof image.decode === "function") {
        image.decode().then(() => finish(true), () => finish(true));
      } else {
        finish(true);
      }
    };
    image.onload = loaded;
    image.onerror = () => finish(false);
    image.decoding = "async";
    image.src = url;
    if (image.complete) loaded();
  });
  spriteReadyPromises.set(url, ready);
  return ready;
}

export default function FoucaultPresenter({ questionToken, feedback = null, active = true, dismissReaction = null }) {
  const rootRef = React.useRef(null);
  const frameRef = React.useRef(null);
  const clipRef = React.useRef(null);
  const clipId = React.useId();
  const reaction = feedback ? (feedback.correct ? "victory" : "defeat") : null;
  const hitSprite = FOUKRO_HIT_SPRITES[dismissReaction === "exiting" ? "stars" : dismissReaction];

  React.useEffect(() => {
    void preloadSprite(FOUCAULT_QUESTION_SPRITE.url);
    void preloadSprite(FOUCAULT_REACTION_SPRITE.url);
    Object.values(FOUKRO_HIT_SPRITES).forEach(url => void preloadSprite(url));
  }, []);

  React.useLayoutEffect(() => {
    const setFrame = (frame) => {
      frameRef.current?.setAttribute("viewBox", getFoucaultQuestionViewBox(frame));
      clipRef.current?.setAttribute("points", getFoucaultQuestionClipPoints(frame));
      if (rootRef.current) rootRef.current.dataset.frame = String(frame);
    };
    const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let cancelAnimation = null;
    let disposed = false;
    let stopped = false;
    const settle = () => {
      stopped = true;
      cancelAnimation?.();
      cancelAnimation = null;
      setFrame(FOUCAULT_SERIOUS_FRAME);
    };

    if (!active || !questionToken || reaction || document.hidden || motionPreference?.matches) {
      settle();
      return undefined;
    }

    setFrame(FOUCAULT_NORMAL_FRAME);
    void preloadSprite(FOUCAULT_QUESTION_SPRITE.url).then((ready) => {
      if (disposed || stopped || !ready) return;
      if (document.hidden || motionPreference?.matches) {
        settle();
        return;
      }
      cancelAnimation = scheduleFoucaultAnimation({ onFrame: setFrame });
    });
    const handleVisibility = () => {
      if (document.hidden) settle();
    };
    const handleMotionPreference = () => {
      if (motionPreference?.matches) settle();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    motionPreference?.addEventListener?.("change", handleMotionPreference);
    return () => {
      disposed = true;
      cancelAnimation?.();
      document.removeEventListener("visibilitychange", handleVisibility);
      motionPreference?.removeEventListener?.("change", handleMotionPreference);
    };
  }, [active, questionToken, reaction]);

  return (
    <div ref={rootRef} className="target-quiz__presenter" data-state={dismissReaction || reaction || "question"} aria-hidden="true">
      {hitSprite ? <img key={dismissReaction} className="target-quiz__presenter-reaction" src={hitSprite} alt="" draggable={false} /> : null}
      <svg width="100%" height="100%" viewBox="0 0 620 512" focusable="false" style={{ display: hitSprite ? "none" : "block", overflow: "hidden" }}>
        <svg
          ref={frameRef}
          x="144"
          y="0"
          width={FOUCAULT_QUESTION_SPRITE.frameWidth}
          height="512"
          viewBox={getFoucaultQuestionViewBox(FOUCAULT_NORMAL_FRAME)}
          preserveAspectRatio="none"
          overflow="hidden"
          style={{ display: reaction ? "none" : "block" }}
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <polygon ref={clipRef} points={getFoucaultQuestionClipPoints(FOUCAULT_NORMAL_FRAME)} />
            </clipPath>
          </defs>
          <image clipPath={`url(#${clipId})`} href={FOUCAULT_QUESTION_SPRITE.url} width={FOUCAULT_QUESTION_SPRITE.width} height={FOUCAULT_QUESTION_SPRITE.height} />
        </svg>
        <svg
          x="36.5"
          y="0"
          width="547"
          height="512"
          viewBox={getFoucaultReactionViewBox(reaction === "victory")}
          preserveAspectRatio="none"
          overflow="hidden"
          style={{ display: reaction ? "block" : "none" }}
        >
          <image href={FOUCAULT_REACTION_SPRITE.url} width={FOUCAULT_REACTION_SPRITE.width} height={FOUCAULT_REACTION_SPRITE.height} />
        </svg>
      </svg>
    </div>
  );
}
