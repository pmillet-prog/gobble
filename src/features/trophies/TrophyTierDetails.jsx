import React from "react";
import { getTrophyRewards } from "../../../shared/trophyCatalog.js";
import { getTrophyCountLabel, getTrophyRewardName, trophyRewardCount } from "./trophyPresentation.js";
import TrophyArt from "./TrophyArt.jsx";
import TrophyDevControls from "./TrophyDevControls.jsx";

export default function TrophyTierDetails({ category, selectedReward, counts, userId, onSelectReward }) {
  const rewards = getTrophyRewards(category);
  const count = trophyRewardCount(selectedReward, counts[selectedReward.id]);
  return <div className="trophy-tier-details">
    {rewards.length > 1 ? <div className="trophy-tier-buttons" role="group" aria-label={`Paliers de ${category.name}`}>
      {rewards.map(reward => {
        const obtained = trophyRewardCount(reward, counts[reward.id]);
        return <button type="button" key={reward.id} data-trophy-reward={reward.id}
          aria-pressed={selectedReward.id === reward.id} aria-label={`${getTrophyRewardName(reward)} · ${getTrophyCountLabel(reward, obtained)}`}
          onClick={() => onSelectReward(reward.id)}>
          <TrophyArt trophy={reward} locked={!obtained} />
          <span>{reward.metalLabel}</span><small>{obtained ? reward.repeat === "once" ? "✓ Obtenu" : `×${obtained.toLocaleString("fr-FR")}` : "À conquérir"}</small>
        </button>;
      })}
    </div> : null}
    <p className="trophy-tier-condition" aria-live="polite">{selectedReward.description}</p>
    <p className="trophy-tier-status">{getTrophyCountLabel(selectedReward, count)} · {Number.isFinite(selectedReward.points) ? `${selectedReward.points.toLocaleString("fr-FR")} points par obtention` : "Barème à venir"}</p>
    {rewards.length > 1 ? <p className="trophy-tier-note">Bronze et argent restent acquis une fois. Les ors s’accumulent.</p> : null}
    <TrophyDevControls trophyId={selectedReward.id} userId={userId} />
  </div>;
}
