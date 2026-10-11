import React from "react";
import { TROPHY_BY_ID } from "../../../shared/trophyCatalog.js";
import { getTrophyAwardPoints, getTrophyMetal, getTrophyRewardName, trophyRewardCount } from "./trophyPresentation.js";
import TrophyArt from "./TrophyArt.jsx";
import "./trophyMetalLighting.css";
import "./trophies.css";

export default function TrophyRewardToast({ reward }) {
  const trophy = TROPHY_BY_ID[reward?.id];
  if (!trophy) return null;
  const points = getTrophyAwardPoints(reward);
  return <div className="trophy-reward-toast trophy-metal-lighting" data-trophy-metal={getTrophyMetal(trophy)} role="status">
    <TrophyArt trophy={trophy} loading="eager" />
    <div><span className="trophy-reward-eyebrow">Trophée obtenu !</span><strong>{getTrophyRewardName(trophy)}</strong>
      <span>{trophy.repeat === "once" ? "✓ Obtenu une fois" : `${reward.delta > 1 ? `+${reward.delta} · ` : ""}Collection : ×${trophyRewardCount(trophy, reward.count).toLocaleString("fr-FR")}`}</span>
      {reward.dev ? <span className="trophy-reward-points">Essai · sans points au classement</span> : points !== null ? <span className="trophy-reward-points">+{points.toLocaleString("fr-FR")} points au classement</span> : null}</div>
  </div>;
}
