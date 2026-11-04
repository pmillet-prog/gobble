import React from "react";
import { GOOD_WINDOW, PERFECT_WINDOW } from "../../src/features/infortune/wheelLaunchGame.js";
import "./launchGame.css";

export function LaunchMeters({ game, gauges, slot = "panel" }) {
  if (!game) return null;
  const powerBonus = game.scoringMode === "power";
  return <div className={`launch-meters launch-meters--${slot}`} ref={node => { gauges.current[slot] = node; }}
    data-ready={game.power >= game.minimumPower}
    style={{ "--power": `${Math.max(0, Math.min(1, game.power)) * 100}%` }}>
    <div className={`launch-meter ${game.stage === "power" || game.stage === "drag" ? "is-active" : ""}`}>
      <div className="launch-meter__label"><span>Puissance</span><output data-power-value>{Math.round(game.power * 100)} %</output></div>
      <div className="launch-meter__track" aria-label={`Puissance : minimum ${Math.round(game.minimumPower * 100)} %${powerBonus ? `, cible du bonus ${Math.round(game.targets.power * 100)} %` : ", bonus selon la précision du geste"}`}>
        <span className="launch-meter__fill" />
        {powerBonus && <><span className="launch-meter__good" style={{ left: `${(game.targets.power - GOOD_WINDOW) * 100}%`, width: `${GOOD_WINDOW * 200}%` }} />
          <span className="launch-meter__perfect" style={{ left: `${(game.targets.power - PERFECT_WINDOW) * 100}%`, width: `${PERFECT_WINDOW * 200}%` }} /></>}
        <span className="launch-meter__minimum" style={{ left: `${game.minimumPower * 100}%` }} />
        <i className="launch-meter__cursor" style={{ left: "var(--power)" }} />
      </div>
      <div className="launch-meter__ends"><span>Minimum {Math.round(game.minimumPower * 100)} %</span><span>{powerBonus ? `Bonus : cible ${Math.round(game.targets.power * 100)} %` : "Bonus : précision du geste"}</span></div>
    </div>
  </div>;
}
