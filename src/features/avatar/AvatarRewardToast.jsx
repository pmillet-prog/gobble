import React from "react";
import AvatarAccessoryPreview from "./AvatarAccessoryPreview.jsx";

export default function AvatarRewardToast({ reward }) {
  return <div className="avatar-reward-toast" role="status">
    <div className="avatar-reward-toast-art">
      {reward.family === "accessories" && reward.id === "participant_tag"
        ? <AvatarAccessoryPreview nickname={reward.nickname} />
        : <img src={reward.imageUrl} alt={reward.label} />}
    </div>
    <div><span className="avatar-reward-toast-eyebrow">Nouvel élément débloqué !</span><strong>{reward.label}</strong>
      <p>{reward.objective === "donor" ? "Merci pour ton soutien à Gobble !" : reward.objective === "weekly_race" ? `${reward.place} place de la course hebdo · Bravo !` : <>{reward.target} {reward.unit} · Bien joué !</>}</p>
      <small>{reward.expiresAt ? "À porter dans l’atelier jusqu’au lundi à 00 h (Paris)" : "Disponible dans l’atelier d’avatar"}</small>
    </div>
  </div>;
}
