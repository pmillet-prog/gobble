import React from 'react';
import { useOptionalApplicationKernel } from '../../app/react/ApplicationRuntimeProvider.jsx';
import { useFeatureRuntime, useFeatureSelector } from '../../app/react/useFeatureRuntime.js';
import SpriteIntervention from '../../components/botInterventions/SpriteIntervention.jsx';
import { ROMEJKO_INTERVENTION_CONFIG } from '../../components/romejko/romejkoAnimation.js';
import { wheelInvitationEvent, completeWheelInvitation } from './wheelInvitationPresentation.js';
import './wheelResultsEntry.css';

const config = Object.freeze({ ...ROMEJKO_INTERVENTION_CONFIG, key: 'mauresque', accessibleName: 'Christian Mauresque',
  spriteUrl: '/bots/presenters/mauresque/frames-v2.webp', buttonUrl: '/bots/presenters/mauresque/button-v2.webp', reactionUrls: Object.freeze({}),
  mirrored: false, frameAspectRatio: 5 / 6, frameCount: 5, textHoldMs: 1400 });
const reminderConfig = Object.freeze({ ...config, textHoldMs: 3500 });

function Entry({ children, size, hostRef, vocabularyReady = false, vocabularyRoundId }) {
  const feature = useFeatureRuntime('infortune');
  const state = useFeatureSelector(feature, value => value);
  const ownHost = React.useRef(null);
  const [now, setNow] = React.useState(Date.now);
  const available = !!state.plateau && state.stage !== 'scheduled' && !state.entered && !state.result && now < state.opensAt;
  const ready = vocabularyReady && String(vocabularyRoundId ?? '') === String(state.roundId ?? '');
  React.useEffect(() => {
    if (!state.optional || state.entered) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.optional, state.entered]);
  React.useEffect(() => {
    const remind = () => {
      if (document.hidden) feature.finishWheelReminder(state.key);
      else if (available) feature.showWheelReminder(ready, state.key);
    };
    remind();
    document.addEventListener('visibilitychange', remind);
    return () => document.removeEventListener('visibilitychange', remind);
  }, [feature, state.key, available, ready]);
  const subscribe = React.useCallback(listener => {
    const event = wheelInvitationEvent(state);
    if (event) listener(event);
    return () => {};
  }, [state.speaking, state.reminderSpeaking, state.roundId, state.roomId, state.key]);
  if (!state.optional || state.stage === 'idle') return children;
  return <div ref={ownHost} className="wheel-results-entry" style={{ width: size, height: size }}>
    <button type="button" data-presenter-key="mauresque" className="wheel-results-entry__button" disabled={!available}
      aria-label={available ? 'Christian Mauresque : lancer ma roue' : 'Christian Mauresque : lancer pris en compte'}
      title="Lancer ma roue · facultatif" onClick={() => feature.requestWheel()}>
      <span className="wheel-results-entry__portrait" aria-hidden="true" />
    </button>
    {available && <span className="wheel-results-entry__notification" aria-hidden="true">!</span>}
    <SpriteIntervention config={state.reminderSpeaking ? reminderConfig : config}
      enabled={state.speaking || (state.reminderSpeaking && available && ready)} animated hostRef={hostRef || ownHost}
      roundId={state.roundId} phaseKey="results" subscribeInterventions={subscribe}
      onPresentationComplete={event => completeWheelInvitation(feature, event)} />
  </div>;
}

export default function WheelResultsEntry(props) {
  return useOptionalApplicationKernel() ? <Entry {...props} /> : props.children;
}
