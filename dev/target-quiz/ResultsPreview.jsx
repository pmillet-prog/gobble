import React from "react";
import useFinalRanking from "../../src/components/results/useFinalRanking.jsx";
import RankingWidgetMobile from "../../src/components/RankingWidgetMobile.jsx";

const entries = [
  { nick: "Paul", score: 10, targetFoundAt: 12000, targetFoundMs: 12000, words: ["EXTRAORDINAIRE"], targetQuiz: { score: -75, correctCount: 0, wrongCount: 1, bestStreak: 0 } },
  { nick: "Test", score: 9, targetFoundAt: 20000, targetFoundMs: 20000, words: ["EXTRAORDINAIRE"], targetQuiz: { score: 425, correctCount: 4, wrongCount: 1, bestStreak: 3 } },
  { nick: "Tigre", score: 8, targetFoundAt: 178000, targetFoundMs: 178000, words: ["EXTRAORDINAIRE"] },
];
const points = { Paul: { points: 10 }, Test: { points: 9 }, Tigre: { points: 8 } };
const specialRound = { type: "target_long" };

export default function ResultsPreview() {
  const ranking = useFinalRanking({ finalResults: entries, isTargetRound: true, specialRound, tournamentRoundPoints: points });
  return <div className="fixture-results" style={{ height: 200, width: "min(480px, 100%)", margin: "20px auto", background: "white", borderRadius: 12 }}>
    <RankingWidgetMobile fullRanking={ranking} selfNick="Paul" expanded showWheel={false} flatStyle showRoundAward animateRank={false} />
  </div>;
}
