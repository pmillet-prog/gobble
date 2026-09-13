import React from "react";
import "./homeTutorialButton.css";

export default function HomeTutorialButton({ onClick }) {
  return <button type="button" onClick={onClick} className="home-tutorial-button" aria-label="Apprendre à jouer">
    <span className="home-tutorial-symbol material-symbols-outlined" aria-hidden="true">gesture</span>
    <span className="home-tutorial-label"><strong>Apprendre à jouer</strong><small>Une partie guidée pour commencer</small></span>
    <span className="home-tutorial-arrow" aria-hidden="true">→</span>
  </button>;
}
