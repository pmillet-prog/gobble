import React from "react";
import { createPortal } from "react-dom";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { createGotusIntroPlayback } from "../../features/gotus/gotusIntroPlayback.js";
import "./gotusIntro.css";

const SOUND_FIELDS = ["isSfxMuted"];

export default function GotusIntro({ active, enabled, onFinish }) {
  const preferences = useFeatureRuntime("preferences");
  const { isSfxMuted } = useFeatureFields(preferences, SOUND_FIELDS);
  const overlayRef = React.useRef(null), logoRef = React.useRef(null), playerRef = React.useRef(null);
  const enabledRef = React.useRef(false), finishRef = React.useRef(onFinish);
  enabledRef.current = enabled && !isSfxMuted; finishRef.current = onFinish;

  React.useLayoutEffect(() => {
    if (!active) return undefined;
    const overlay = overlayRef.current, logo = logoRef.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let finalScale = 1;
    const measure = () => {
      finalScale = 2 * Math.max(overlay.clientWidth / Math.max(1, logo.offsetWidth),
        overlay.clientHeight / Math.max(1, logo.offsetHeight));
    };
    measure();
    const player = createGotusIntroPlayback({
      onFrame: ({ progress, durationMs }) => {
        overlay.dataset.state = "running";
        overlay.dataset.progress = String(progress);
        overlay.dataset.durationMs = String(durationMs);
        logo.style.transform = `scale(${motion.matches ? 1 : 1 + (finalScale - 1) * progress ** 3})`;
      },
      onFinish: () => finishRef.current?.(),
    });
    playerRef.current = player;
    player.setEnabled(enabledRef.current);
    const onVisibility = () => { if (document.hidden) player.finish(); };
    window.addEventListener("resize", measure);
    logo.addEventListener("load", measure);
    document.addEventListener("visibilitychange", onVisibility);
    if (document.hidden) player.finish();
    else void player.start({ ready: logo.decode?.().catch(() => {}) });
    return () => {
      player.dispose();
      if (playerRef.current === player) playerRef.current = null;
      window.removeEventListener("resize", measure);
      logo.removeEventListener("load", measure);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);
  React.useEffect(() => playerRef.current?.setEnabled(enabled && !isSfxMuted), [enabled, isSfxMuted]);

  if (!active) return null;
  return createPortal(<div ref={overlayRef} className="gotus-intro" data-state="preparing" data-progress="0"
    role="status" aria-label="Introduction de Gotus">
    <img ref={logoRef} className="gotus-intro__logo" src="/gotus/gotus-logo.webp" alt="Gotus" width="900" height="300" />
  </div>, document.body);
}
