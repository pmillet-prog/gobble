import React from "react";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { playPresenterPunch } from "../../components/botInterventions/presenterReactions.js";
import { getNextPresenterHitReaction, schedulePresenterHitExit } from "../../components/botInterventions/spriteInterventionAnimation.js";

export default function useTargetQuizPresenterDismiss({ enabled, onDismiss, onHit }) {
  const preferences = useFeatureRuntime("preferences");
  const [reaction, setReaction] = React.useState(null);
  const timers = React.useRef(new Set());
  const hitCount = React.useRef(0);
  const pending = React.useRef(false);
  const mounted = React.useRef(false);
  const clear = React.useCallback(() => { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); }, []);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; clear(); }; }, [clear]);
  const hit = async event => {
    event.preventDefault();
    event.stopPropagation();
    if (!enabled || !onDismiss || pending.current || reaction === "stars" || reaction === "exiting") return;
    if (!hitCount.current) {
      pending.current = true;
      let accepted = false;
      try { accepted = await onHit?.(); } finally { pending.current = false; }
      if (accepted === false || !mounted.current) return;
    }
    clear();
    setReaction(getNextPresenterHitReaction(hitCount.current++));
    if (!preferences.store.getState().isSfxMuted) playPresenterPunch();
    const schedule = (callback, delay) => {
      const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
      timers.current.add(timer);
    };
    schedulePresenterHitExit({ schedule, showStars: () => setReaction("stars"),
      startExit: () => setReaction("exiting"), complete: onDismiss, exitMs: 350 });
  };
  return { reaction, hit };
}
