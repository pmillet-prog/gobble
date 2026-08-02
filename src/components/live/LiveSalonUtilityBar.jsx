import React from "react";
import { UI_IMAGE_KEYS, getUiImageUrl } from "../../assets/uiAssetManifest.js";

const ACTIONS = [
  { key: "stats", label: "Statistiques", imageKey: UI_IMAGE_KEYS.home.stats },
  { key: "players", label: "Joueurs", imageKey: UI_IMAGE_KEYS.home.players },
  { key: "vault", label: "Coffre-fort", imageKey: UI_IMAGE_KEYS.home.vault },
  { key: "settings", label: "Réglages", imageKey: UI_IMAGE_KEYS.home.settings },
];

const styles = `
.live-salon-utility-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(4px, 0.7vh, 9px);
  width: 100%;
}
.live-salon-utility-button {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 5px 7px rgba(0, 0, 0, 0.36));
  transition: transform 170ms ease, filter 170ms ease;
  -webkit-tap-highlight-color: transparent;
}
.live-salon-utility-button:hover {
  transform: translateY(-1px) scale(1.055);
  filter: brightness(1.07) drop-shadow(0 7px 9px rgba(0, 0, 0, 0.42));
}
.live-salon-utility-button:active {
  transform: translateY(1px) scale(0.95);
}
.live-salon-utility-button img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
.live-salon-utility-count {
  position: absolute;
  right: 3%;
  top: 5%;
  min-width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 3px solid #ffd37a;
  border-radius: 999px;
  background: radial-gradient(circle at 35% 25%, #ff7771, #ba1f28 70%);
  color: #fff7e6;
  font: 900 18px/1 system-ui, sans-serif;
  text-shadow: 0 2px 2px rgba(0, 0, 0, 0.6);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.42);
}
@media (max-aspect-ratio: 1/1) {
  .live-salon-utility-bar {
    flex-direction: row;
    justify-content: center;
    gap: 3%;
  }
  .live-salon-utility-button {
    width: 22%;
  }
  .live-salon-utility-count {
    min-width: clamp(25px, 7vw, 31px);
    height: clamp(25px, 7vw, 31px);
    padding: 0 5px;
    border-width: 2px;
    font-size: clamp(12px, 3.6vw, 15px);
  }
}
`;

export default function LiveSalonUtilityBar({
  humanCount = 0,
  onOpenPlayers = null,
  onOpenSettings = null,
  onOpenStats = null,
  onOpenVault = null,
}) {
  const callbacks = {
    players: onOpenPlayers,
    settings: onOpenSettings,
    stats: onOpenStats,
    vault: onOpenVault,
  };

  return (
    <div className="live-salon-utility-bar">
      <style>{styles}</style>
      {ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          className="live-salon-utility-button"
          aria-label={action.label}
          title={action.label}
          onClick={() => callbacks[action.key]?.()}
        >
          <img src={getUiImageUrl(action.imageKey)} alt="" draggable="false" />
          {action.key === "players" ? (
            <span className="live-salon-utility-count" aria-label={`${humanCount} joueurs humains`}>
              {Math.max(0, Number(humanCount) || 0)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
