import React from "react";
import AvatarThumbnail from "../../features/avatar/AvatarThumbnail.jsx";
import { PRESENTER_IDENTITIES } from "../../../shared/presenterIdentities.js";
import "./infortuneContestants.css";

export default function InfortuneContestants({ contestants = [], economy, onChoose, disabled = false }) {
  const Card = onChoose ? "button" : "div";
  return <div className="infortune-contestants" aria-label="Les autres candidats de ton plateau">
    {contestants.map(player => <Card className="infortune-contestants__player" key={player.id}
      {...(onChoose ? { type: "button", disabled, onClick: () => onChoose(player.id), "aria-label": `Échanger avec ${player.nick}` } : {})}>
      {player.isBot && PRESENTER_IDENTITIES[player.presenterKey]
        ? <img src={PRESENTER_IDENTITIES[player.presenterKey].buttonUrl} alt="" />
        : player.userId ? <AvatarThumbnail userId={player.userId} size={48} showPlaceholder />
          : <img src="/avatars/default.png" alt="" />}
      <div><strong>{player.nick}</strong><small>{player.isBot ? "Présentateur invité" : player.rank ? `${player.rank}${player.rank === 1 ? "er" : "e"} au classement` : "Candidat"}</small>
        {economy && <b>{economy.hidden ? "Cagnotte masquée" : `${(economy.members[player.id]?.bank ?? 0).toLocaleString("fr-FR")} €`}</b>}
      </div>
    </Card>)}
  </div>;
}
