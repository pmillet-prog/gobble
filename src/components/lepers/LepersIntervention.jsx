import React from "react";

import SpriteIntervention from "../botInterventions/SpriteIntervention.jsx";
import { LEPERS_BONUS_SFX_KEYS } from "../../assets/assetKeys.js";
import usePresenterHintsController from "../../features/presenters/usePresenterHintsController.js";
import {
  LEPERS_INTERVENTION_CONFIG,
  LEPERS_SOLVED_CELEBRATION_DELAY_MS,
  LEPERS_SOLVED_CELEBRATION_DURATION_MS,
} from "./lepersAnimation.js";

function LepersIntervention({
  animated = true,
  chatFeature,
  enabled = false,
  hostRef,
  liveRoundFeature,
  manual = false,
  phaseKey = "",
  playBonusVoice,
  roundId = null,
  triggerPraiseFlash,
}) {
  const presenterHintsController = usePresenterHintsController();
  const retainedRoundIdRef = React.useRef(roundId);
  const viewedChallengeRoundsRef = React.useRef(new Set());
  const playBonusVoiceRef = React.useRef(playBonusVoice);
  const triggerPraiseFlashRef = React.useRef(triggerPraiseFlash);
  if (roundId != null) retainedRoundIdRef.current = roundId;
  playBonusVoiceRef.current = playBonusVoice;
  triggerPraiseFlashRef.current = triggerPraiseFlash;
  const handleManualActivation = React.useCallback(
    (event) => {
      const eventRoundId = String(event?.roundId || "").trim();
      if (event?.kind === "challenge" && eventRoundId) {
        viewedChallengeRoundsRef.current.add(eventRoundId);
      }
      chatFeature?.recordPresenterActivation?.("lepers", event);
    },
    [chatFeature]
  );
  const handlePresentationComplete = React.useCallback(
    (event) =>
      chatFeature?.recordPresenterPresentationComplete?.("lepers", event),
    [chatFeature]
  );

  const subscribeInterventions = React.useCallback(
    (listener) => {
      let solvedTimer = null;
      const unsubscribeLive = liveRoundFeature?.subscribeLepersInterventions?.((event) => {
        if (event?.kind !== "solved") {
          if (solvedTimer != null) {
            clearTimeout(solvedTimer);
            solvedTimer = null;
          }
          listener(event);
          return;
        }
        if (solvedTimer != null) clearTimeout(solvedTimer);
        try {
          const bonusSoundKey =
            LEPERS_BONUS_SFX_KEYS[
              Math.floor(Math.random() * LEPERS_BONUS_SFX_KEYS.length)
            ];
          playBonusVoiceRef.current?.(bonusSoundKey);
          triggerPraiseFlashRef.current?.("BONUS !", {
            kind: "bonus",
            shakeGrid: true,
            force: true,
            durationMs: LEPERS_SOLVED_CELEBRATION_DURATION_MS,
          });
        } catch (_) {}
        const solvedRoundId = String(event?.roundId || "").trim();
        if (!viewedChallengeRoundsRef.current.has(solvedRoundId)) return;
        solvedTimer = setTimeout(() => {
          solvedTimer = null;
          const lepersState =
            presenterHintsController.getSnapshot().entries?.lepers;
          if (lepersState?.stunned) return;
          listener(event);
          presenterHintsController.request("lepers", { automatic: true });
        }, LEPERS_SOLVED_CELEBRATION_DELAY_MS);
      });
      const unsubscribePresenter = presenterHintsController.subscribeInterventions(
        "lepers",
        listener
      );
      return () => {
        if (solvedTimer != null) clearTimeout(solvedTimer);
        unsubscribeLive?.();
        unsubscribePresenter?.();
      };
    },
    [liveRoundFeature, presenterHintsController]
  );

  return (
    <SpriteIntervention
      animated={animated}
      config={LEPERS_INTERVENTION_CONFIG}
      enabled={enabled}
      hostRef={hostRef}
      manualController={manual ? presenterHintsController : null}
      placementController={presenterHintsController}
      manualKey="lepers"
      onManualActivation={handleManualActivation}
      onPresentationComplete={handlePresentationComplete}
      phaseKey={phaseKey}
      queueWhileDisabled
      roundId={retainedRoundIdRef.current}
      subscribeInterventions={subscribeInterventions}
    />
  );
}

export default React.memo(LepersIntervention);
