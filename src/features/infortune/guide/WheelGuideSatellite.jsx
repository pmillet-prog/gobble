import React from 'react';
import { useFeatureRuntime, useFeatureSelector } from '../../../app/react/useFeatureRuntime.js';
import { useApplicationSelector } from '../../../app/react/ApplicationRuntimeProvider.jsx';
const Guide = React.lazy(() => import('./WheelGuide.jsx'));

export default function WheelGuideSatellite() {
  const overlays = useFeatureRuntime('overlays');
  const guide = useFeatureSelector(overlays, state => state.wheelGuide);
  const userId = useApplicationSelector(state => state.session.authState?.user?.id);
  const atHome = useApplicationSelector(state => state.navigation.view === 'home' && state.game.phase === 'lobby' && !state.session.isLoggedIn);
  React.useEffect(() => {
    if (guide && String(guide.userId) !== String(userId)) overlays.set('wheelGuide', null);
  }, [guide, userId, overlays]);
  if (!guide || !atHome || String(guide.userId) !== String(userId)) return null;
  return <React.Suspense fallback={null}><Guide onComplete={() => {
    guide.onComplete?.();
    overlays.set('wheelGuide', null);
  }} /></React.Suspense>;
}
