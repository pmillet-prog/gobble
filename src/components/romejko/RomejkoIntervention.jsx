import React from "react";

import SpriteIntervention from "../botInterventions/SpriteIntervention.jsx";
import usePresenterHintsController from "../../features/presenters/usePresenterHintsController.js";
import { ROMEJKO_INTERVENTION_CONFIG } from "./romejkoAnimation.js";

function RomejkoIntervention({
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
    (event) => chatFeature?.recordPresenterActivation?.("romejko", event),
    [chatFeature]
  );
  const handlePresentationComplete = React.useCallback(
    (event) => chatFeature?.recordPresenterPresentationComplete?.("romejko", event),
    [chatFeature]
  );
  const subscribeInterventions = React.useCallback(
    (listener) =>
      presenterHintsController.subscribeInterventions("romejko", listener),
    [presenterHintsController]
  );
  return (
    <SpriteIntervention
      animated={animated}
      config={ROMEJKO_INTERVENTION_CONFIG}
      enabled={enabled}
      hostRef={hostRef}
      manualController={manual ? presenterHintsController : null}
      placementController={presenterHintsController}
      manualKey="romejko"
      onManualActivation={handleManualActivation}
      onPresentationComplete={handlePresentationComplete}
      phaseKey={phaseKey}
      queueWhileDisabled
      roundId={roundId}
      subscribeInterventions={subscribeInterventions}
    />
  );
}

export default React.memo(RomejkoIntervention);
