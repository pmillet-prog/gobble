import React from 'react';
import { createPortal } from 'react-dom';
import { useFeatureRuntime, useFeatureSelector } from '../../app/react/useFeatureRuntime.js';
import InfortuneGameSurface from '../../components/infortune/InfortuneGameSurface.jsx';
import InfortuneWheelLoading from '../../components/infortune/InfortuneWheelLoading.jsx';

export default function ResultsLoadingSatellite() {
  const feature = useFeatureRuntime('resultsLoading');
  const visible = useFeatureSelector(feature, state => state.visible);
  if (!visible) return null;
  return createPortal(<InfortuneGameSurface title="Résultats de la manche" subtitle="Tous les scores sont en cours de rassemblement">
    <div role="status" style={{ height: '100%', display: 'grid', placeContent: 'center', textAlign: 'center', padding: 24 }}>
      <InfortuneWheelLoading label="Calcul des résultats…" />
      <p>Ta manche est terminée. Les résultats s’afficheront dès qu’ils seront prêts.</p>
    </div>
  </InfortuneGameSurface>, document.body);
}
