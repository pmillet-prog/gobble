import React from "react";
import { useFeatureFields, useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { formatTargetQuizPoints } from "../../../shared/targetQuizSummary.js";
import "./targetQuizMobileStatus.css";

export function TargetQuizMobileScore() {
  const feature = useFeatureRuntime("targetQuiz");
  const score = useFeatureSelector(feature, state => state.summary?.score || 0);
  return <span className="target-quiz-mobile-score" role="status" aria-label={`Score total du mini-jeu : ${formatTargetQuizPoints(score)} points`}>
    <span>Mini-jeu</span><strong>{formatTargetQuizPoints(score)}</strong><span>points</span>
  </span>;
}

export function TargetQuizMobileStats() {
  const feature = useFeatureRuntime("targetQuiz");
  const { summary, streak } = useFeatureFields(feature, ["summary", "streak"]);
  return <dl className="target-quiz-mobile-stats" aria-label="Statistiques du mini-jeu" aria-live="polite">
    <div><dt>Série en cours</dt><dd>{streak}</dd></div>
    <div><dt>Meilleure série</dt><dd>{summary?.bestStreak || 0}</dd></div>
    <div><dt>Bonnes réponses</dt><dd>{summary?.correctCount || 0}</dd></div>
    <div><dt>Mauvaises réponses</dt><dd>{summary?.wrongCount || 0}</dd></div>
  </dl>;
}
