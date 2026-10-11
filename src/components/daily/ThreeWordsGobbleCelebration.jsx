import React from "react";
import { IMAGE_KEYS } from "../../assets/assetKeys.js";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { bigwordUrl } from "../../features/celebration/bigscore/celebrationPresentation.js";

// The recap is a modal top layer: its celebration belongs inside the dialog.
export default function ThreeWordsGobbleCelebration({ doubleGobble = false, onComplete }) {
  const preferences = useFeatureRuntime("preferences");
  const enabled = useFeatureSelector(preferences, state => state.visualGobbleEnabled);
  const lite = useFeatureSelector(preferences, state => state.preferLiteVisualEffects);
  if (!enabled) return null;
  return <span className="daily-special-recap-gobble-effect" aria-hidden="true">
    <span className="celebration-pop celebration-image-pop celebration-gobble-pop"
      onAnimationEnd={onComplete} style={{
        "--celebration-x": "0px", "--celebration-y": lite ? "-12px" : "-35px",
        "--celebration-scale": 1.08, "--celebration-duration": lite ? "850ms" : "2200ms",
        "--celebration-size": lite ? "min(220px, 65vw)" : "min(300px, 70vw)",
      }}>
      <img src={bigwordUrl(IMAGE_KEYS.bigwords[doubleGobble ? "doubleGobble" : "gobble"])}
        alt="" className="celebration-image" draggable={false} />
    </span>
  </span>;
}
