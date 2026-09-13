import { normalizeWord, computeScore } from "../../components/gameLogic.js";
import { applyDailySpecialPlacements } from "../../components/daily/dailySpecialModel.js";
import { evaluateDailySpecialWords } from "../../../shared/dailySpecialReview.js";

export function resolveTutorialThreeWords(prepared, snapshot, { final = false } = {}) {
  const placements = { ...snapshot.specialPlacements };
  const grid = applyDailySpecialPlacements(prepared.grid, placements);
  const slots = (snapshot.wordSlots || []).slice(0, 3).map((slot, id) => ({
    id, word: normalizeWord(String(slot?.word || "")),
    display: String(slot?.display || slot?.word || "").toUpperCase(), path: [...(slot?.path || [])],
  }));
  // Live scores remain provisional, including deliberate non-words. Only the
  // results use the exact evaluator shared with daily 3 mots on the server.
  const wordReview = final ? evaluateDailySpecialWords(slots, {
    grid, dictionary: new Set(prepared.solutions.map(entry => entry.word)),
  }) : null;
  const retained = slots.filter((slot, index) => slot.word && (!final || wordReview[index].valid))
    .map(slot => ({ ...slot, pts: final ? wordReview[slot.id].points : computeScore(slot.word, slot.path, grid) }));
  return {
    ...snapshot,
    accepted: retained.map(slot => slot.word), score: retained.reduce((sum, slot) => sum + slot.pts, 0),
    wordScores: new Map(retained.map(slot => [slot.word, slot.pts])),
    paths: new Map(retained.map(slot => [slot.word, { path: slot.path }])),
    specialWordSlots: retained, specialPlacements: placements, wordReview,
  };
}
