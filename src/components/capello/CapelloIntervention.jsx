import React from "react";

import SpriteIntervention from "../botInterventions/SpriteIntervention.jsx";
import usePresenterHintsController from "../../features/presenters/usePresenterHintsController.js";
import { CAPELLO_INTERVENTION_CONFIG } from "./capelloAnimation.js";

function CapelloIntervention({
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
    (event) => chatFeature?.recordPresenterActivation?.("capello", event),
    [chatFeature]
  );
  const handlePresentationComplete = React.useCallback(
    (event) => chatFeature?.recordPresenterPresentationComplete?.("capello", event),
    [chatFeature]
  );
  const subscribeInterventions = React.useCallback(
    (listener) =>
      presenterHintsController.subscribeInterventions("capello", listener),
    [presenterHintsController]
  );
  return (
    <SpriteIntervention
      animated={animated}
      config={CAPELLO_INTERVENTION_CONFIG}
      enabled={enabled}
      hostRef={hostRef}
      manualController={manual ? presenterHintsController : null}
      placementController={presenterHintsController}
      manualKey="capello"
      onManualActivation={handleManualActivation}
      onPresentationComplete={handlePresentationComplete}
      phaseKey={phaseKey}
      queueWhileDisabled
      roundId={roundId}
      subscribeInterventions={subscribeInterventions}
    />
  );
}

export default React.memo(CapelloIntervention);
