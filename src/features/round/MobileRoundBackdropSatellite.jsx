import React from "react";
import { createPortal } from "react-dom";
import { useApplicationFields, useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { INITIAL_MOBILE_ROUND_BACKDROP, resolveMobileRoundBackdrop } from "./mobileRoundBackdrop.js";

export default function MobileRoundBackdropSatellite() {
  const view = useApplicationSelector((state) => state.navigation.view);
  const { phase } = useApplicationFields("game", ["phase"]);
  const { roundId, roundPreparing, breakKind } = useApplicationFields("realtime", [
    "roundId", "roundPreparing", "breakKind",
  ]);
  const layout = useFeatureRuntime("layout");
  const liveUi = useFeatureRuntime("liveUi");
  const results = useFeatureRuntime("results");
  const chat = useFeatureRuntime("chat");
  const { isMobileLayout } = useFeatureFields(layout, ["isMobileLayout"]);
  const { mobileRoundIntroStage, mobileRoundIntroHideTiles } = useFeatureFields(liveUi, [
    "mobileRoundIntroStage", "mobileRoundIntroHideTiles",
  ]);
  const { mobileOutroFadeActive, roundStartDelayed } = useFeatureFields(results, [
    "mobileOutroFadeActive", "roundStartDelayed",
  ]);
  const { mobileChatOpen, mobileChatClosing } = useFeatureFields(chat, ["mobileChatOpen", "mobileChatClosing"]);
  const previous = React.useRef(INITIAL_MOBILE_ROUND_BACKDROP);
  const enabled = isMobileLayout && ["live", "vault", "training", "daily_play"].includes(view);
  const backdrop = resolveMobileRoundBackdrop(previous.current, {
    enabled,
    phase,
    roundId,
    introStage: mobileRoundIntroStage,
    hideTiles: mobileRoundIntroHideTiles,
    outroActive: mobileOutroFadeActive && breakKind !== "tournament_end",
    preparationPending: !!roundPreparing || !!roundStartDelayed,
  });
  React.useLayoutEffect(() => {
    previous.current = backdrop;
  });

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden="true"
      data-mobile-round-backdrop="true"
      className="fixed inset-0 z-[121] pointer-events-none select-none bg-black"
      style={{
        opacity: backdrop.opacity,
        transition: `opacity ${backdrop.durationMs}ms ease-out`,
        visibility: enabled && !mobileChatOpen && !mobileChatClosing ? "visible" : "hidden",
      }}
    />,
    document.body
  );
}
