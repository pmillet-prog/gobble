import { resolveVocabRoundProgress } from "./vocabRoundProgress.js";

export function prepareVocabRoundProgress({
  result, baseline, weeklyBaseline, requestSnapshot,
}, onReady) {
  const fromRound = resolveVocabRoundProgress({ result });
  const readyFromRound = !fromRound.available || (
    result?.vocabProgress?.status === "recorded" &&
    Array.isArray(result.newVocabWords) && Array.isArray(result.newWeeklyVocabWords) &&
    Number.isFinite(fromRound.count) && Number.isFinite(fromRound.weeklyCount) &&
    Number.isFinite(fromRound.weeklyBaseline)
  );

  // roundEnded already carries the whole committed vocabulary transaction.
  // Refresh profile counters in the background, without delaying its animation.
  if (readyFromRound) onReady(fromRound);
  return Promise.resolve().then(requestSnapshot).catch(() => null).then((snapshot) => {
    if (readyFromRound) return;
    onReady(resolveVocabRoundProgress({
      result, count: snapshot?.count, weeklyCount: snapshot?.weeklyCount,
      baseline, weeklyBaseline,
    }));
  });
}
