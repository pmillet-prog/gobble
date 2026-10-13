import React from "react";
import TrophyArt from "../../features/trophies/TrophyArt.jsx";
import { getTrophyMetal } from "../../features/trophies/trophyPresentation.js";
import PlayerProfileLink from "../profile/PlayerProfileLink.jsx";
import { buildWeeklyTrophyRows } from "./weeklyTrophyAwards.js";
import "./weeklyTrophiesRecap.css";

export default function WeeklyTrophiesRecap({ awards }) {
  const rows = React.useMemo(() => buildWeeklyTrophyRows(awards), [awards]);
  const unavailable = rows === null || (awards.length > 0 && rows.length === 0);
  return <section className="weekly-trophies-recap" aria-label="Les trophées de la semaine"
    data-trophy-recap-state={unavailable ? "unavailable" : rows.length ? "awards" : "empty"}>
    {unavailable ? <p className="weekly-trophies-empty">Les trophées de cette semaine ne sont pas disponibles.</p>
      : !rows.length ? <p className="weekly-trophies-empty">Aucun trophée obtenu cette semaine. La prochaine réserve peut-être de beaux succès !</p>
      : <>
        <p className="weekly-trophies-intro">Les succès de la semaine, tous joueurs confondus.</p>
        <ul className="weekly-trophy-list">
          {rows.map(({ reward, recipients }) => <li key={reward.id} className="weekly-trophy-card"
            data-weekly-trophy={reward.id} data-trophy-metal={getTrophyMetal(reward)}>
            <div className="weekly-trophy-portrait"><TrophyArt trophy={reward} className="weekly-trophy-art" /></div>
            <div className="weekly-trophy-content">
              <h3 className="weekly-trophy-name">{reward.name}</h3>
              {reward.metalLabel ? <div className="weekly-trophy-metal">{reward.metalLabel}</div> : null}
              <p className="weekly-trophy-winners"><span className="weekly-trophy-congratulations">Bravo à </span>
                {recipients.map((recipient, index) => <React.Fragment key={recipient.key}>
                  {index > 0 ? ", " : null}
                  <span className="weekly-trophy-recipient" data-recipient-id={recipient.userId}>
                    <PlayerProfileLink entry={recipient} className="weekly-trophy-nick" />
                    {recipient.count > 1 ? <span className="weekly-trophy-count" aria-label={`${recipient.count} exemplaires obtenus cette semaine`}> ×{recipient.count.toLocaleString("fr-FR")}</span> : null}
                  </span>
                </React.Fragment>)}.
              </p>
            </div>
          </li>)}
        </ul>
      </>}
  </section>;
}
