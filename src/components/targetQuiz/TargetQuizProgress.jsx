import React from "react";
import { TARGET_QUIZ_POINTS_GOAL } from "../../../shared/targetQuizPoints.js";
import "./targetQuizProgress.css";

const number = new Intl.NumberFormat("fr-FR");

export default function TargetQuizProgress({ points = 0, total = 0 }) {
  const progress = Math.min(TARGET_QUIZ_POINTS_GOAL, Math.max(0, points));
  return <div className="target-quiz-progress">
    <div className="target-quiz-progress__heading"><span>Vers les prochains <strong>50 gobblars</strong></span><strong>{number.format(progress)} / {number.format(TARGET_QUIZ_POINTS_GOAL)}</strong></div>
    <div className="target-quiz-progress__track" role="progressbar" aria-label="Qui veut gagner des Gobblars"
      aria-valuemin={0} aria-valuemax={TARGET_QUIZ_POINTS_GOAL} aria-valuenow={progress}>
      <div style={{ transform: `scaleX(${progress / TARGET_QUIZ_POINTS_GOAL})` }} />
    </div>
    <div className="target-quiz-progress__total">Balance totale <strong>{total < 0 ? "−" : "+"}{number.format(Math.abs(total))}</strong> points</div>
  </div>;
}
