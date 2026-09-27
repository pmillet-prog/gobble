import React from "react";

import SpriteIntervention from "../botInterventions/SpriteIntervention.jsx";
import usePresenterHintsController from "../../features/presenters/usePresenterHintsController.js";
import { getResultsPresenter } from "../../features/presenters/resultsPresenter.js";
import { resolvePresenterKey } from "../../features/presenters/presenterIdentity.js";

function PivotIntervention({
  animated = true,
  chatFeature,
  enabled = false,
  hostRef,
  manual = false,
  onOpenWord = null,
  phaseKey = "",
  roundId = null,
}) {
  const presenterHintsController = usePresenterHintsController();
  const presenterState = React.useSyncExternalStore(
    presenterHintsController.subscribe,
    presenterHintsController.getSnapshot,
    presenterHintsController.getSnapshot
  );
  const presenter = getResultsPresenter(presenterState.entries.pivot);
  const handleManualActivation = React.useCallback(
    (event) => chatFeature?.recordPresenterActivation?.(resolvePresenterKey(event) || "pivot", event),
    [chatFeature]
  );
  const handlePresentationComplete = React.useCallback(
    (event) => chatFeature?.recordPresenterPresentationComplete?.(resolvePresenterKey(event) || "pivot", event),
    [chatFeature]
  );
  const subscribeInterventions = React.useCallback(
    (listener) =>
      presenterHintsController.subscribeInterventions("pivot", listener),
    [presenterHintsController]
  );
  return (
    <SpriteIntervention
      key={presenter.config.key}
      animated={animated}
      config={presenter.config}
      enabled={enabled}
      hostRef={hostRef}
      manualController={manual ? presenterHintsController : null}
      placementController={presenterHintsController}
      manualKey="pivot"
      onManualActivation={handleManualActivation}
      onOpenWord={onOpenWord}
      onPresentationComplete={handlePresentationComplete}
      phaseKey={phaseKey}
      queueWhileDisabled
      roundId={roundId}
      subscribeInterventions={subscribeInterventions}
    />
  );
}

export default React.memo(PivotIntervention);
