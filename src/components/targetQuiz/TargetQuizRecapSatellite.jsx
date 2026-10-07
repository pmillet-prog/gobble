import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { formatTargetQuizPoints } from "../../../shared/targetQuizSummary.js";
import "./targetQuizResults.css";
import TargetQuizRecapProgress from "./TargetQuizRecapProgress.jsx";

export function TargetQuizRecap({ summary }) {
  const answered = summary.correctCount + summary.wrongCount;
  return <section className="target-quiz-recap" role="status" aria-live="polite" aria-label="Bilan du mini-jeu">
    <div className="target-quiz-recap__card">
      <img className="target-quiz-recap__logo" src="/bots/foucault/millions-logo.png" alt="Qui veut gagner des Gobblars" />
      <h2>Bilan du mini-jeu</h2>
      <div className={`target-quiz-recap__score${summary.score < 0 ? " target-quiz-recap__score--negative" : ""}`}>{formatTargetQuizPoints(summary.score)}</div>
      <div className="target-quiz-recap__unit">{summary.cancelled ? "FouKro assommé · points annulés" : "points mini-jeu"}</div>
      <dl className="target-quiz-recap__stats">
        <div><dt>Bonnes réponses</dt><dd>{summary.correctCount}</dd></div>
        <div><dt>Mauvaises réponses</dt><dd>{summary.wrongCount}</dd></div>
        <div><dt>Meilleure série</dt><dd>{summary.bestStreak}</dd></div>
        <div><dt>Réussite</dt><dd>{answered ? Math.round(summary.correctCount / answered * 100) : 0}<small> %</small></dd></div>
      </dl>
      {summary.progression ? <TargetQuizRecapProgress progression={summary.progression} /> : null}
    </div>
  </section>;
}

export default function TargetQuizRecapSatellite() {
  const feature = useFeatureRuntime("targetQuiz");
  const summary = useFeatureSelector(feature, state => state.recap);
  return summary ? createPortal(<TargetQuizRecap summary={summary} />, document.body) : null;
}
