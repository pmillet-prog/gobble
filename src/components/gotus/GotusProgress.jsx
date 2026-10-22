import React from "react";
import { normalizeGotusProgress, GOTUS_WORDS_GOAL, GOTUS_GOBBLARS_REWARD } from "../../../shared/gotusProgress.js";
import "./gotusProgress.css";

export default function GotusProgress({ progress, progression, showTotal = true }) {
  const profile = normalizeGotusProgress(progression?.after || progress);
  const reward = Number(progression?.reward?.amount) || 0;
  return <div className="gotus-progress">
    <div className="gotus-progress__heading"><span>Prochains <strong>{GOTUS_GOBBLARS_REWARD} gobblars</strong></span><strong>{profile.words} / {GOTUS_WORDS_GOAL} mots</strong></div>
    <div className="gotus-progress__track" role="progressbar" aria-label="Mots Gotus trouvés vers la prochaine récompense"
      aria-valuemin={0} aria-valuemax={GOTUS_WORDS_GOAL} aria-valuenow={profile.words}>
      <i style={{ transform: `scaleX(${profile.words / GOTUS_WORDS_GOAL})` }} />
    </div>
    {reward > 0 ? <p className="gotus-progress__reward">+{reward} gobblars ! Une nouvelle série commence.</p> : null}
    {showTotal ? <p className="gotus-progress__total">{profile.totalWins.toLocaleString("fr-FR")} mot{profile.totalWins > 1 ? "s" : ""} trouvé{profile.totalWins > 1 ? "s" : ""} en live</p> : null}
  </div>;
}
