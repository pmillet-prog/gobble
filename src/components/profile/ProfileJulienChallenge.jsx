import React from "react";
import AvatarAccessoryPreview from "../../features/avatar/AvatarAccessoryPreview.jsx";
import { AVATAR_OBJECTIVES } from "../../../shared/avatarObjectives.js";
import "./profileJulienChallenge.css";

export default function ProfileJulienChallenge({ count, nickname }) {
  if (count == null) return null;
  const total = Math.max(0, Number(count) || 0);
  const target = AVATAR_OBJECTIVES.lepers_correct_answers.target;
  return <section className="profile-julien-challenge" aria-label="Défi de Julien Lechéper">
    <div className="profile-julien-tag"><AvatarAccessoryPreview nickname={nickname} /></div>
    <div><strong>Face à Julien Lechéper</strong><p>{total.toLocaleString("fr-FR")} bonne{total === 1 ? "" : "s"} réponse{total === 1 ? "" : "s"}</p>
      {total < target ? <><progress value={total} max={target} aria-label="Progression vers l’étiquette de participant" /><small>Étiquette de participant à {target} bonnes réponses</small></> : <small>Étiquette de participant débloquée</small>}
    </div>
  </section>;
}
