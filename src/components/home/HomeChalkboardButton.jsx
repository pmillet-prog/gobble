import React from "react";
import useChalkboardUnread from "../../features/chalkboard/useChalkboardUnread.js";
import "./homeChalkboardButton.css";

export default function HomeChalkboardButton({ disabled = false, maintenanceMode = false, accountId, onClick }) {
  const unread = useChalkboardUnread(accountId, !maintenanceMode);
  return (
    <button
      type="button"
      className="home-lobby-button home-icon-button home-chalkboard-button"
      onClick={onClick}
      disabled={disabled}
      aria-label={unread ? "Le grand tableau · nouvelles contributions" : "Le grand tableau"}
      title={maintenanceMode ? "Le grand tableau est fermé pendant la mise à jour" : "Le grand tableau"}
    >
      <img className="home-lobby-img" src="/buttons/grand-tableau-v2.webp" alt="" draggable="false" decoding="async" />
      {unread ? <span className="home-chalkboard-unread" aria-hidden="true">!</span> : null}
    </button>
  );
}
