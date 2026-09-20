import React from "react";

const NAMES = { gold: "or", silver: "argent", bronze: "bronze" };
export default function ProfileMedalCaption({ medals }) {
  const won = Object.entries(NAMES).filter(([color]) => medals[color] > 0);
  if (!won.length) return null;
  return <div className="profile-medals-caption" aria-label="Médailles des mini-tournois du jour">
    <span>Médailles du jour</span>
    <div>{won.map(([color, name]) => <span key={color} className={`profile-medal-count profile-medal-count-${color}`}>
      <i aria-hidden="true" />{medals[color]} {name}
    </span>)}</div>
    <small>Épinglées jusqu’à minuit</small>
  </div>;
}
