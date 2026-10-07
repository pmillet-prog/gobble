import React from "react";
import { formatTargetQuizPoints } from "../../../shared/targetQuizSummary.js";
import "./targetQuizResults.css";

export default function TargetQuizBonusBadge({ summary }) {
  if (!summary) return null;
  const points = formatTargetQuizPoints(summary.score);
  return <span className={`target-quiz-bonus${summary.score < 0 ? " target-quiz-bonus--negative" : ""}`}
    title={`Mini-jeu : ${points} points · ${summary.correctCount} bonnes réponses · ${summary.wrongCount} mauvaises réponses · meilleure série : ${summary.bestStreak}`}
    aria-label={`Mini-jeu : ${points} points`}>
    <img src="/bots/foucault/millions-logo.png" width="24" height="24" alt="" />
    <strong>{points}</strong>
  </span>;
}
