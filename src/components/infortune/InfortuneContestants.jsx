import React from "react";
import AvatarThumbnail from "../../features/avatar/AvatarThumbnail.jsx";
import { PRESENTER_IDENTITIES } from "../../../shared/presenterIdentities.js";
import { contestantBankView } from "../../features/infortune/contestantBankView.js";
import "./infortuneContestants.css";

export default function InfortuneContestants({ contestants = [], economy, onChoose, selectedId, disabled = false }) {
  const Card = onChoose ? "button" : "div";
  return <div className="infortune-contestants" aria-label="Les autres candidats de ton plateau">
    {contestants.map(player => {
      const bank = contestantBankView(economy, player.id);
      return <Card className={`infortune-contestants__player${selectedId === player.id ? " is-selected" : ""}`} key={player.id}
      {...(onChoose ? { type: "button", disabled, onClick: () => onChoose(player.id), "aria-label": `Échanger avec ${player.nick}`, "aria-pressed": selectedId === player.id } : {})}>
      {player.isBot && PRESENTER_IDENTITIES[player.presenterKey]
        ? <img src={PRESENTER_IDENTITIES[player.presenterKey].buttonUrl} alt="" />
        : player.userId ? <AvatarThumbnail userId={player.userId} size={48} showPlaceholder />
          : <img src="/avatars/default.png" alt="" />}
      <div><strong>{player.nick}</strong><small>{player.isBot ? "Présentateur invité" : player.rank ? `${player.rank}${player.rank === 1 ? "er" : "e"} au classement` : "Candidat"}</small>
        {economy && <div role="status" aria-label={`Cagnotte de ${player.nick}`} aria-atomic="true">
          <b>{bank.amount}</b>{bank.status && <small>{bank.status}</small>}
        </div>}
      </div>
    </Card>; })}
  </div>;
}
