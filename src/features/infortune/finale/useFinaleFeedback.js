import React from 'react';
import { useOptionalApplicationKernel } from '../../../app/react/ApplicationRuntimeProvider.jsx';
import { createFinaleFeedbackAudio } from './createFinaleFeedbackAudio.js';

export default function useFinaleFeedback(controller, reducedMotion) {
  const kernel = useOptionalApplicationKernel(), motion = React.useRef(reducedMotion);
  motion.current = reducedMotion;
  React.useEffect(() => {
    const player = createFinaleFeedbackAudio(), lease = kernel?.features.acquire('preferences');
    let previous = controller.store.getState().feedback;
    const settings = () => player.setPreferences(lease?.feature.store.getState());
    settings(); const releaseSettings = lease?.feature.store.subscribe(settings);
    const release = controller.store.subscribe(() => {
      const cue = controller.store.getState().feedback;
      if (cue === previous) return;
      previous = cue; player.play(cue, motion.current);
    });
    const unlock = () => player.unlock(), visibility = () => player.setHidden(document.hidden);
    visibility(); window.addEventListener('pointerdown', unlock, { passive: true }); window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      release(); releaseSettings?.(); lease?.release(); player.dispose();
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); document.removeEventListener('visibilitychange', visibility);
    };
  }, [controller, kernel]);
}
