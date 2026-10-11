export { evaluateDailySpecialWords } from "../../shared/dailySpecialReview.js";

// Presentation metadata follows the daily service's existing score/length
// thresholds. It does not award Gobbles or change the result's points.
export function annotateDailySpecialGobbles(review, { maxWordLen, maxWordPts }) {
  return review.map(entry => {
    const valid = entry.valid === true && !!entry.word;
    const longest = valid && Number.isFinite(maxWordLen) && maxWordLen > 0
      && entry.word.length >= maxWordLen;
    const highestScore = valid && Number.isFinite(maxWordPts) && maxWordPts > 0
      && Number.isFinite(entry.points) && entry.points >= maxWordPts;
    return { ...entry, gobble: longest || highestScore, doubleGobble: longest && highestScore };
  });
}
