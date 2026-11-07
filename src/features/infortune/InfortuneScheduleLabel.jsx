import React from 'react';
import { useOptionalApplicationKernel } from '../../app/react/ApplicationRuntimeProvider.jsx';
import { useFeatureRuntime, useFeatureSelector } from '../../app/react/useFeatureRuntime.js';
import { INFORTUNE_RESULTS_READING_MS } from '../../../shared/infortuneIntermission.js';

function ScheduledLabel({ children }) {
  const finale = useFeatureRuntime('infortuneFinale');
  const finalePhase = useFeatureSelector(finale, state => state.phase);
  const startsIn = useFeatureSelector(finale, state => state.startsIn);
  const feature = useFeatureRuntime('infortune');
  const opensAt = useFeatureSelector(feature, state => state.stage === 'scheduled' ? state.opensAt : null);
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    if (!opensAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [opensAt]);
  const seconds = Math.min(INFORTUNE_RESULTS_READING_MS / 1000, Math.max(0, Math.ceil((opensAt - now) / 1000)));
  if (finalePhase === 'waiting') return <>Finale de la roue dans {startsIn} s</>;
  if (['playing', 'loading', 'result', 'ranking'].includes(finalePhase)) return <>Finale de la roue en cours</>;
  return opensAt ? <>Lancer de roue dans {seconds} s</> : children;
}
export default function InfortuneScheduleLabel(props) {
  return useOptionalApplicationKernel() ? <ScheduledLabel {...props} /> : props.children;
}
