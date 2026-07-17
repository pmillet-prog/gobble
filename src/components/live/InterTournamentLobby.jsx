import React from "react";

function getReadyLine(lobby) {
  const ready = Number(lobby?.readyCount) || 0;
  const threshold = Number(lobby?.readyThreshold) || 1;
  const active = Number(lobby?.activeHumanCount) || 0;
  const afk = Number(lobby?.afkHumanCount) || 0;
  const activePart = active > 0 ? ` · ${active} actif${active > 1 ? "s" : ""}` : "";
  const afkPart = afk > 0 ? ` · ${afk} AFK` : "";
  return `${ready}/${threshold} prêts${activePart}${afkPart}`;
}

const styles = `
.inter-lobby-art {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.inter-lobby-title {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  pointer-events: none;
  filter: drop-shadow(0 8px 10px rgba(0, 0, 0, 0.38));
}
.inter-lobby-actions {
  width: 78%;
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 2.25fr) minmax(0, 0.72fr);
  align-items: center;
  gap: 5%;
  margin-top: 2.5%;
  pointer-events: auto;
}
.inter-lobby-side,
.inter-lobby-training-slot {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border: 0;
  padding: 0;
  background: transparent;
}
.inter-lobby-training-slot {
  transform: translateX(-16%);
}
.inter-lobby-side {
  cursor: pointer;
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.38));
  transition: transform 180ms ease, filter 180ms ease;
  -webkit-tap-highlight-color: transparent;
}
.inter-lobby-side:hover {
  transform: translateY(-1px) scale(1.055);
  filter: brightness(1.08) drop-shadow(0 8px 10px rgba(0, 0, 0, 0.42));
}
.inter-lobby-side:active {
  transform: translateY(1px) scale(0.96);
}
.inter-lobby-side img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
.inter-lobby-ready {
  position: relative;
  width: 100%;
  aspect-ratio: 3.55 / 1;
  overflow: visible;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 7px 9px rgba(0, 0, 0, 0.42));
  transition: transform 180ms ease, filter 180ms ease, opacity 180ms ease;
  -webkit-tap-highlight-color: transparent;
}
.inter-lobby-ready:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.025);
  filter: brightness(1.08) drop-shadow(0 10px 12px rgba(0, 0, 0, 0.46));
}
.inter-lobby-ready:active:not(:disabled) {
  transform: translateY(1px) scale(0.975);
}
.inter-lobby-ready:disabled {
  cursor: default;
  opacity: 0.58;
}
.inter-lobby-ready-image {
  position: absolute;
  left: -5.2%;
  top: -53%;
  display: block;
  width: 110.4%;
  height: auto;
  pointer-events: none;
  user-select: none;
  opacity: 0;
  transform: scale(0.965);
  transition: opacity 240ms ease, transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.inter-lobby-ready-image-active {
  opacity: 1;
  transform: scale(1);
}
.inter-lobby-status {
  margin-top: 1.5%;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(27, 15, 5, 0.62);
  color: #ffe7a0;
  font-size: clamp(10px, 0.72vw, 13px);
  line-height: 1.2;
  font-weight: 900;
  text-shadow: 0 1px 2px #000;
  pointer-events: none;
}
.inter-lobby-maintenance {
  margin-top: 4px;
  color: #ffcf70;
  font-size: 12px;
  font-weight: 900;
  text-shadow: 0 1px 3px #000;
}
@media (max-aspect-ratio: 1/1) {
  .inter-lobby-actions {
    position: absolute;
    left: 5%;
    top: 72svh;
    width: 90%;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 3fr) minmax(0, 0.85fr);
    gap: 3%;
    margin-top: 0;
  }
  .inter-lobby-status {
    position: absolute;
    left: 50%;
    top: calc(72svh + 17vw);
    margin-top: 0;
    transform: translateX(-50%);
    font-size: 10px;
    white-space: nowrap;
  }
  .inter-lobby-maintenance {
    position: absolute;
    left: 50%;
    top: calc(72svh + 22vw);
    transform: translateX(-50%);
    white-space: nowrap;
  }
}
`;

export default function InterTournamentLobby({
  lobby = null,
  onBack = null,
  onReady,
  selfReady = false,
  team = null,
  trainingControl = null,
}) {
  const isCountdown = lobby?.phase === "countdown";
  const isIntro = lobby?.phase === "intro";
  const readyDisabled = isCountdown || isIntro || !!lobby?.maintenanceMode;
  const teamColor = team === "red" ? "rouge" : "bleu";
  const titleSrc = `/buttons/salon%20${teamColor}.png`;
  const idleSrc = `/buttons/pret%20${teamColor}.png`;
  const readySrc = "/buttons/pret%20valid%C3%A9.png";
  const backSrc = `/buttons/bouton%20retour%20${teamColor}.png`;

  return (
    <div className="inter-lobby-art">
      <style>{styles}</style>
      <img className="inter-lobby-title" src={titleSrc} alt="Salon" draggable="false" />
      <div className="inter-lobby-actions">
        <button
          type="button"
          className="inter-lobby-side"
          aria-label="Retour à l'accueil"
          title="Retour à l'accueil"
          onClick={() => onBack?.()}
        >
          <img src={backSrc} alt="" draggable="false" />
        </button>
        <button
          type="button"
          className="inter-lobby-ready"
          disabled={readyDisabled}
          aria-pressed={selfReady ? "true" : "false"}
          aria-label={selfReady ? "Désactiver mon statut prêt" : "Me déclarer prêt"}
          onClick={() => onReady?.(!selfReady)}
        >
          <img
            className={`inter-lobby-ready-image ${!selfReady ? "inter-lobby-ready-image-active" : ""}`}
            src={idleSrc}
            alt=""
            draggable="false"
          />
          <img
            className={`inter-lobby-ready-image ${selfReady ? "inter-lobby-ready-image-active" : ""}`}
            src={readySrc}
            alt=""
            draggable="false"
          />
        </button>
        <div className="inter-lobby-training-slot">{trainingControl}</div>
      </div>
      <div className="inter-lobby-status">{getReadyLine(lobby)}</div>
      {lobby?.maintenanceMode ? (
        <div className="inter-lobby-maintenance">Maintenance en cours</div>
      ) : null}
    </div>
  );
}
