import { normalizeWord } from "../../../shared/gameLogic.js";
import { evaluateDailySpecialWords } from "../../../shared/dailySpecialReview.js";
import { applyDailySpecialPlacements } from "../../components/daily/dailySpecialModel.js";

export function buildTrainingThreeWordsResult({ training, wordSlots, placements, nick, userId }) {
  const slots = Array.from({ length: 3 }, (_, id) => {
    const slot = wordSlots?.[id];
    return { id, word: normalizeWord(slot?.word || ""),
      display: slot?.display || slot?.word || "", path: [...(slot?.path || [])] };
  });
  const review = evaluateDailySpecialWords(slots, {
    grid: applyDailySpecialPlacements(training.grid, placements),
    dictionary: new Set((training.solutions || []).map(entry =>
      normalizeWord((Array.isArray(entry) ? entry[0] : entry?.word) || ""))),
  });
  const specialWordSlots = slots.map((slot, id) => ({
    ...slot, valid: review[id].valid, reason: review[id].reason, pts: review[id].points,
  }));
  const accepted = specialWordSlots.filter(slot => slot.word && slot.valid);
  return {
    nick, userId, isBot: false, score: accepted.reduce((sum, slot) => sum + slot.pts, 0),
    words: accepted.map(slot => slot.word),
    wordScores: Object.fromEntries(accepted.map(slot => [slot.word, slot.pts])),
    specialWordSlots, specialPlacements: { ...placements },
  };
}
