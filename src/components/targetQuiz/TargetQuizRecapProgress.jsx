import React from "react";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { buildTargetQuizProgressFrames, getTargetQuizProgressFrame, TARGET_QUIZ_PROGRESS_DELAY, TARGET_QUIZ_PROGRESS_DURATION } from "../../features/targetQuiz/targetQuizProgressAnimation.js";
import TargetQuizProgress from "./TargetQuizProgress.jsx";

export default function TargetQuizRecapProgress({ progression }) {
  const notifications = useFeatureRuntime("notifications");
  const preferences = useFeatureRuntime("preferences");
  const timeline = React.useMemo(() => buildTargetQuizProgressFrames(progression), [progression]);
  const [frame, setFrame] = React.useState(timeline.before);
  React.useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now() + TARGET_QUIZ_PROGRESS_DELAY;
    let raf;
    let published = 0;
    const tick = () => {
      const fraction = reduced ? 1 : Math.max(0, (performance.now() - start) / TARGET_QUIZ_PROGRESS_DURATION);
      const next = getTargetQuizProgressFrame(timeline, fraction);
      setFrame(next);
      while (published < next.rewards) {
        const reward = progression.rewards?.[published++];
        if (reward) notifications.show("", 0, { gobblarsReward: {
          ...reward, balance: Math.max(reward.balance, preferences.store.getState().gobblarsBalance || 0), label: "Qui veut gagner des Gobblars",
        } });
      }
      if (fraction < 1) raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(tick, reduced ? 0 : TARGET_QUIZ_PROGRESS_DELAY);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [timeline, progression, notifications, preferences]);
  return <TargetQuizProgress {...frame} />;
}
