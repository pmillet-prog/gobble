import { keyboardMarks, MAX_ATTEMPTS } from "./model.mjs";

const descriptions = { correct: "bien placée", present: "mal placée", absent: "absente à cette position", known: "déjà trouvée", draft: "proposée", empty: "à trouver" };

export function createView(document) {
  const board = document.querySelector("#board");
  const rows = Array.from({ length: MAX_ATTEMPTS }, (_, rowIndex) => {
    const row = document.createElement("div");
    row.className = "board-row";
    row.setAttribute("role", "row");
    row.setAttribute("aria-label", `Essai ${rowIndex + 1}`);
    const cells = Array.from({ length: 6 }, () => {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "cell");
      const letter = document.createElement("span");
      cell.append(letter); row.append(cell);
      return { cell, letter };
    });
    board.append(row);
    return { row, cells };
  });
  const keyboard = document.querySelector("#keyboard");
  const keys = new Map();
  for (const letters of ["AZERTYUIOP", "QSDFGHJKLM", "⌫WXCVBN↵"]) {
    const row = document.createElement("div");
    row.className = "keyboard-row";
    for (const letter of letters) {
      const key = document.createElement("button");
      key.type = "button"; key.textContent = letter; key.dataset.key = letter;
      key.disabled = true;
      if (letter === "⌫" || letter === "↵") { key.className = "key-wide"; key.setAttribute("aria-label", letter === "⌫" ? "Effacer une lettre" : "Proposer le mot"); }
      keys.set(letter, key); row.append(key);
    }
    keyboard.append(row);
  }
  const input = document.querySelector("#guess");
  const feedback = document.querySelector("#feedback");
  const speech = document.querySelector("#speech");
  const presenter = document.querySelector(".presenter");
  let neutralVictoryCell = null;
  const setVictoryFrame = frame => {
    if (neutralVictoryCell) delete neutralVictoryCell.dataset.victoryNeutral;
    neutralVictoryCell = frame ? rows[frame.row]?.cells[frame.column]?.cell : null;
    if (neutralVictoryCell) neutralVictoryCell.dataset.victoryNeutral = "true";
  };
  let previousPhase = "";
  const render = state => {
    const activeRow = state.phase === "revealing" ? state.attempts.length - 1 : state.attempts.length;
    rows.forEach(({ row, cells }, rowIndex) => {
      const attempt = state.attempts[rowIndex];
      const active = rowIndex === activeRow && ["playing", "revealing"].includes(state.phase);
      row.dataset.active = String(active);
      cells.forEach(({ cell, letter }, column) => {
        let value = "", mark = "empty";
        if (attempt) {
          value = attempt.word[column];
          mark = state.phase === "revealing" && active && column >= state.revealed ? "draft" : attempt.marks[column];
        } else if (active) {
          value = state.draft[column] || state.known[column] || "·";
          mark = state.draft[column] ? "draft" : state.known[column] ? "known" : "empty";
        }
        if (letter.textContent !== value) letter.textContent = value;
        cell.dataset.mark = mark;
        cell.setAttribute("aria-label", value && value !== "·" ? `${value}, ${descriptions[mark]}` : "Case vide");
      });
    });
    const marks = keyboardMarks(state);
    for (const [letter, key] of keys) {
      key.dataset.mark = marks[letter] || "";
      key.disabled = state.phase !== "playing";
      if (/^[A-Z]$/.test(letter)) key.setAttribute("aria-label", marks[letter] ? `${letter}, ${descriptions[marks[letter]]}` : letter);
    }
    const playing = state.phase === "playing";
    input.disabled = !playing;
    document.querySelector("#submit").disabled = !playing;
    document.querySelector("#new-round").disabled = false;
    document.querySelector("#give-up").disabled = ["won", "lost"].includes(state.phase);
    if (input.value !== state.draft) input.value = state.draft;
    input.setAttribute("aria-invalid", String(Boolean(state.error)));
    const message = state.error || state.message;
    if (feedback.textContent !== message) feedback.textContent = message;
    feedback.dataset.error = String(Boolean(state.error));
    speech.textContent = state.phase === "won" ? "C’est le bon mot ! Bravo !" : state.phase === "lost" ? `Il fallait trouver ${state.target} !` : state.phase === "revealing" ? "Voyons voir…" : "Six lettres, un peu de flair… À vous !";
    presenter.dataset.expression = state.phase === "revealing" ? "speaking" : state.phase === "won" ? "wink" : "idle";
    document.querySelector("#attempt-counter").textContent = `${Math.min(state.attempts.length + (playing ? 1 : 0), 6)} / 6`;
    document.querySelector("#round-label").textContent = state.phase === "won" ? "BRAVO, VOUS AVEZ LE MOT !" : state.phase === "lost" ? `LA SOLUTION : ${state.target}` : "LA PREMIÈRE LETTRE VOUS EST OFFERTE";
    if (playing && previousPhase && previousPhase !== "playing" && matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
    previousPhase = state.phase;
  };
  return { render, input, keyboard, setVictoryFrame };
}
