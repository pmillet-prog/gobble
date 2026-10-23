import React from "react";
import { GOTUS_LETTER_LABELS } from "./gotusLetterLabels.js";

export default function GotusKeyboard({ state, onKey }) {
  const marks = React.useMemo(() => {
    const result = {}, ranks = { absent: 1, present: 2, correct: 3 };
    state.attempts.forEach((attempt, row) => {
      const visible = state.phase === "revealing" && row === state.attempts.length - 1 ? state.revealed : 6;
      [...attempt.word].slice(0, visible).forEach((letter, column) => {
        if ((ranks[result[letter]] || 0) < ranks[attempt.marks[column]]) result[letter] = attempt.marks[column];
      });
    });
    return result;
  }, [state.attempts, state.phase, state.revealed]);
  return <div className="gotus__keyboard" aria-label="Clavier Gotus">
    {["AZERTYUIOP", "QSDFGHJKLM", "⌫WXCVBN↵"].map(letters => <div key={letters}>
      {[...letters].map(letter => <button key={letter} type="button" data-mark={marks[letter]}
        disabled={!state.canAnswer}
        aria-label={letter === "⌫" ? "Effacer une lettre" : letter === "↵" ? "Proposer" : `${letter}${marks[letter] ? `, ${GOTUS_LETTER_LABELS[marks[letter]]}` : ""}`}
        onClick={() => onKey(letter === "⌫" ? "Backspace" : letter === "↵" ? "Enter" : letter)}>{letter}</button>)}
    </div>)}
  </div>;
}
