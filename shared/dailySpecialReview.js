import { scoreWordOnGrid, scoreWordOnGridWithPath } from "./gameLogic.js";

function startTile(path) {
  const first = Array.isArray(path) ? Number(path[0]) : NaN;
  return Number.isInteger(first) && first >= 0 ? first : null;
}

// Inputs have already been normalized and limited to the three submitted words.
// Keep the scoring verdict and the explanation together, using the played path.
export function evaluateDailySpecialWords(submissions, { grid, dictionary }) {
  const words = new Set();
  const starts = new Set();
  return submissions.map(({ word, path }) => {
    let reason = null;
    let scored = null;
    if (words.has(word)) reason = "duplicate_word";
    else if (startTile(path) != null && starts.has(startTile(path))) reason = "duplicate_start";
    else if (!dictionary.has(word)) reason = "not_in_dictionary";
    else {
      scored = Array.isArray(path) && path.length
        ? scoreWordOnGridWithPath(word, grid, path)
        : scoreWordOnGrid(word, grid);
      if (!scored) reason = "invalid_path";
      else if (startTile(scored.path) != null && starts.has(startTile(scored.path))) reason = "duplicate_start";
    }
    if (!reason) {
      words.add(word);
      if (startTile(scored.path) != null) starts.add(startTile(scored.path));
    }
    return { word, valid: !reason, reason, points: reason ? 0 : scored.pts || 0 };
  });
}
