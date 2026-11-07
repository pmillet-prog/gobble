import React from 'react';
import { useFeatureRuntime } from '../../app/react/useFeatureRuntime.js';

export default function FinaleSettingsButton() {
  const overlays = useFeatureRuntime('overlays');
  return <button type="button" aria-label="Réglages de la finale" title="Réglages" onClick={() => overlays.set('settingsOpen', true)}>⚙</button>;
}
