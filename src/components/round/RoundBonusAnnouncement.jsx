import React from "react";
import "./roundBonusAnnouncement.css";

export default function RoundBonusAnnouncement({ bonus }) {
  if (!bonus) return null;
  return <div className="round-intro-bonus" aria-label={`Mini-jeu bonus : ${bonus.label}`}>
    <img className={`round-intro-bonus__logo round-intro-bonus__logo--${bonus.kind}`}
      src={bonus.logo} alt="" decoding="async" />
    <div className="round-intro-bonus__copy">
      <div className="round-intro-bonus__eyebrow">Mini-jeu bonus</div>
      <div className="round-intro-bonus__name">{bonus.label}</div>
      <p className="round-intro-bonus__hint">Trouvez la cible assez tôt pour y jouer&nbsp;!</p>
    </div>
  </div>;
}
