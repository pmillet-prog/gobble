import React from "react";

import SpriteIntervention from "../botInterventions/SpriteIntervention.jsx";
import usePresenterHintsController from "../../features/presenters/usePresenterHintsController.js";
import { PIVOT_INTERVENTION_CONFIG } from "./pivotAnimation.js";

function PivotIntervention({
  animated = true,
  chatFeature,
  enabled = false,
  hostRef,
  manual = false,
  phaseKey = "",
  roundId = null,
}) {
  const presenterHintsController = usePresenterHintsController();
  const handleManualActivation = React.useCallback(
    (event) => chatFeature?.recordPresenterActivation?.("pivot", event),
    [chatFeature]
  );
  const handlePresentationComplete = React.useCallback(
    (event) => chatFeature?.recordPresenterPresentationComplete?.("pivot", event),
    [chatFeature]
  );
  const subscribeInterventions = React.useCallback(
    (listener) =>
      presenterHintsController.subscribeInterventions("pivot", listener),
    [presenterHintsController]
  );
  return (
    <SpriteIntervention
      animated={animated}
      config={PIVOT_INTERVENTION_CONFIG}
      enabled={enabled}
      hostRef={hostRef}
      manualController={manual ? presenterHintsController : null}
      placementController={presenterHintsController}
      manualKey="pivot"
      onManualActivation={handleManualActivation}
      onPresentationComplete={handlePresentationComplete}
      phaseKey={phaseKey}
      queueWhileDisabled
      roundId={roundId}
      subscribeInterventions={subscribeInterventions}
    />
  );
}

export default React.memo(PivotIntervention);
