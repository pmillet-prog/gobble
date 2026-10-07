import React from "react";
import TargetQuizProgress from "../targetQuiz/TargetQuizProgress.jsx";
import { normalizeTargetQuizPoints } from "../../../shared/targetQuizPoints.js";

export default function ProfileTargetQuiz({ progress }) {
  if (!progress) return null;
  return <section className="profile-target-quiz" aria-label="Qui veut gagner des Gobblars">
    <img src="/bots/foucault/millions-logo.png" alt="" />
    <div><h3>Qui veut gagner des Gobblars</h3><TargetQuizProgress {...normalizeTargetQuizPoints(progress)} /></div>
  </section>;
}
