import { normalizeWord } from "../../../shared/gameLogic.js";
import { getDailySpecialWordReview } from "../../components/daily/dailySpecialRecapModel.js";

export function getLiveThreeWordsRecap(results, { userId, nickname } = {}) {
  const entries = Array.isArray(results) ? results : [];
  const nickKey = String(nickname || "").trim().toLocaleLowerCase("fr");
  const self = (userId && entries.find(entry => String(entry.userId) === String(userId))) ||
    entries.find(entry => nickKey && String(entry?.nick || "").trim().toLocaleLowerCase("fr") === nickKey);
  if (!self || !Array.isArray(self.specialWordSlots)) return null;
  const accepted = new Set((self.words || []).map(normalizeWord));
  const result = {
    score: self.score,
    wordReview: self.specialWordSlots.slice(0, 3).map(slot => {
      const word = normalizeWord(slot?.word || "");
      const valid = typeof slot?.valid === "boolean" ? slot.valid : accepted.has(word);
      return {
        word: slot?.display || slot?.word || "", valid,
        points: valid ? (self.wordScores?.[word] ?? slot?.pts ?? null) : 0,
        reason: slot?.reason || "not_counted",
      };
    }),
  };
  return { result, review: getDailySpecialWordReview(result) };
}
