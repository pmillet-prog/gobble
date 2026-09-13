import { scoreWordOnGridWithPath } from "../../shared/gameLogic.js";

// Final verdict only: live previews deliberately include dictionary misses.
export function evaluateLiveSpecial3Word({ word, path, grid, dictionary, duplicateWord, duplicateStartTile }) {
  const reason = !word ? "empty" : duplicateWord ? "duplicate_word"
    : duplicateStartTile ? "duplicate_start" : !dictionary?.has?.(word) ? "not_in_dictionary" : null;
  const scored = !reason && Array.isArray(path) && path.length
    ? scoreWordOnGridWithPath(word, grid, path, null) : null;
  return {
    scored,
    valid: !!scored,
    reason: reason || (scored ? null : "invalid_path"),
    points: scored ? Number(scored.pts) || 0 : 0,
  };
}
