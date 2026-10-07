import { normalizeTargetQuizSummary } from "../../shared/targetQuizSummary.js";

// Kept on the round, independently of the session/progression lifetime. These
// points are a separate mini-game result, never a tournament ranking award.
export function recordTargetQuizResult(context, summary) {
  const round = context.room?.currentRound;
  if (context.devPreview || round?.training || String(round?.id) !== String(context.publicRoundId)) return;
  round.targetQuizResults ??= new Map();
  round.targetQuizResults.set(context.playerKey, normalizeTargetQuizSummary(summary));
}

export function getTargetQuizResult(round, player) {
  const userId = Number(player?.userId);
  const key = Number.isSafeInteger(userId) && userId > 0 ? `user:${userId}` : `install:${player?.installId}`;
  const value = round?.targetQuizResults?.get(key);
  if (!value) return null;
  // Public rankings must not expose private wallet balances or reward receipts.
  const { progression, ...summary } = value;
  return summary;
}
