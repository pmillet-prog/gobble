import { formatNumber } from "../../utils/numbers.js";
import { formatMsShort, formatWeeklyDate } from "./weeklyStatsModel.js";
import { formatWeeklyTop3Percentage } from "./weeklyTop3Model.js";

const count = (value) => formatNumber(Number(value) || 0);
const TIME_BOARDS = new Set(["bestTimeTargetLong", "bestTimeTargetScore"]);
const WORD_BOARDS = new Set(["bestWord", "longestWord", ...TIME_BOARDS]);
const RECORD_BOARDS = new Set([...WORD_BOARDS, "mostWordsInGame", "bestSpecial3Score", "bestRoundScore"]);

export function getStatsRowDetails(boardKey, entry) {
  let value = "";
  let unit = "";
  const details = [];
  switch (boardKey) {
    case "medals":
      value = count(entry.total); unit = "médailles";
      details.push(`🥇 ${count(entry.gold)} · 🥈 ${count(entry.silver)} · 🥉 ${count(entry.bronze)}`);
      break;
    case "mostWordsInGame": value = count(entry.wordsCount); unit = "mots"; break;
    case "totalScore":
      value = count(entry.totalScore); unit = "points";
      if (Number.isFinite(entry.roundsPlayed)) details.push(`${count(entry.roundsPlayed)} manches jouées`);
      break;
    case "top3":
      value = formatWeeklyTop3Percentage(entry.percentage);
      details.push(`${count(entry.top3Count)} top 3 / ${count(entry.roundsPlayed)} manches`);
      break;
    case "bestWord": case "bestRoundScore": case "bestSpecial3Score":
      value = count(entry.pts); unit = "points"; break;
    case "longestWord": value = count(entry.len); unit = "lettres"; break;
    case "vocab": value = count(entry.vocabCount); unit = "mots uniques"; break;
    case "weeklyVocab": value = count(entry.weeklyVocabCount ?? entry.vocabCount); unit = "mots uniques"; break;
    case "bestTimeTargetLong": case "bestTimeTargetScore": value = formatMsShort(entry.ms); break;
    case "mostGobbles": case "gobbles": value = count(entry.gobbles); unit = "gobbles"; break;
    case "doubleGobbles": value = count(entry.doubleGobbles); unit = "double gobbles"; break;
    case "presenterHits": value = count(entry.hits); unit = "coups reçus"; break;
    case "qpugAnswers": value = count(entry.correctCount); unit = "bonnes réponses"; break;
    case "targetQuizPoints": value = `${Number(entry.points) > 0 ? "+" : ""}${count(entry.points)}`; unit = "points"; break;
  }
  if (RECORD_BOARDS.has(boardKey) && entry.achievedAt) details.push(formatWeeklyDate(entry.achievedAt));
  return { value, unit, details, word: WORD_BOARDS.has(boardKey) ? entry.word : null };
}
