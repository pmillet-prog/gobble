import React from "react";
import "./homeChalkboardButton.css";

export default function HomeChalkboardButton({ disabled = false, maintenanceMode = false, onClick }) {
  return (
    <button
      type="button"
      className="home-lobby-button home-icon-button home-chalkboard-button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Le grand tableau"
      aria-describedby="home-chalkboard-new"
      title={maintenanceMode ? "Le grand tableau est fermé pendant la mise à jour" : "Le grand tableau"}
    >
      <img className="home-lobby-img" src="/buttons/grand-tableau-v2.webp" alt="" draggable="false" decoding="async" />
      <span id="home-chalkboard-new" className="home-chalkboard-new">Nouveau !</span>
    </button>
  );
}
