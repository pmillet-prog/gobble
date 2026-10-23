import React from "react";
import { GOTUS_LETTER_LABELS } from "./gotusLetterLabels.js";
import "./gotusBoard.css";

export default function GotusBoard({ state, boardRef, input, feedbackId }) {
  const boardId = React.useId();
  const activeRow = state.phase === "revealing" ? state.attempts.length - 1
    : ["playing", "submitting"].includes(state.phase) ? state.attempts.length : -1;
  const selectedId = state.canAnswer && activeRow >= 0 ? `${boardId}-${activeRow}-${state.activeColumn}` : undefined;
  const select = event => {
    const cell = event.target.closest("[data-gotus-column][data-editable=true]");
    if (cell) input.selectCell(Number(cell.dataset.gotusColumn));
  };
  return <div className="gotus__board" ref={boardRef} role="grid" tabIndex={state.canAnswer ? 0 : -1}
    aria-label="Grille Gotus : six essais, six lettres" aria-describedby={feedbackId}
    aria-readonly={!state.canAnswer} aria-activedescendant={selectedId}
    onClick={select} onKeyDown={input.onKeyDown} onPaste={input.onPaste}>
    {Array.from({ length: 6 }, (_, row) => <div className="gotus__row" key={row} role="row"
      aria-label={`Essai ${row + 1}`} data-active={row === activeRow}>
      {Array.from({ length: 6 }, (_, column) => {
        const attempt = state.attempts[row];
        const editable = state.canAnswer && row === activeRow;
        const selected = editable && column === state.activeColumn;
        let letter = "", mark = "empty";
        if (attempt) {
          letter = attempt.word[column];
          mark = state.phase === "revealing" && row === activeRow && column >= state.revealed ? "draft" : attempt.marks[column];
        } else if (row === activeRow) {
          const draftLetter = state.draft[column]?.trim();
          letter = draftLetter || "·";
          mark = !draftLetter ? "empty" : draftLetter === state.known[column] ? "known" : "draft";
        }
        const description = letter && letter !== "·" ? `${letter}, ${GOTUS_LETTER_LABELS[mark]}` : "case vide";
        return <div className="gotus__cell" key={column} id={`${boardId}-${row}-${column}`} role="gridcell"
          data-mark={mark} data-gotus-row={row} data-gotus-column={column} data-editable={editable} data-selected={selected}
          aria-selected={selected} aria-readonly={!editable} aria-label={`Lettre ${column + 1}, ${description}`}>
          <span>{letter}</span>
        </div>;
      })}
    </div>)}
  </div>;
}
